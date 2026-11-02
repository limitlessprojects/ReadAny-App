/**
 * WebDatabase — IDatabase implementation on top of sql.js (SQLite in WASM).
 *
 * Vendored sql.js (MIT, see vendor/LICENSE-sqljs.txt) gives the web build the
 * same real-SQL schema/migrations the desktop app uses. Instances are created
 * through WebPlatformService.loadDatabase which caches per path, so migrations
 * and app code always share one connection per database file.
 *
 * Writes are persisted back to the WebVFS with a short debounce (sql.js has
 * no incremental storage engine; we export the whole DB image).
 */
import type { IDatabase } from "@readany/core/services";
import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { vfsPersistBytes, vfsReadFile } from "./web-vfs";

type SqlJsStatement = {
  bind(params?: unknown[]): boolean;
  step(): boolean;
  getAsObject(): Record<string, unknown>;
  free(): boolean;
};

type SqlJsDatabase = {
  run(sql: string, params?: unknown[]): SqlJsDatabase;
  prepare(sql: string): SqlJsStatement;
  export(): Uint8Array;
  close(): void;
};

type SqlJsStatic = {
  Database: new (data?: Uint8Array) => SqlJsDatabase;
};

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

async function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({ locateFile: () => wasmUrl }) as Promise<SqlJsStatic>;
  }
  return sqlJsPromise;
}

const PERSIST_DEBOUNCE_MS = 400;

export class WebDatabase implements IDatabase {
  private db: SqlJsDatabase;
  private path: string;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persisting: Promise<void> = Promise.resolve();
  private closed = false;

  private constructor(db: SqlJsDatabase, path: string) {
    this.db = db;
    this.path = path;
  }

  static async open(path: string): Promise<WebDatabase> {
    const SQL = await getSqlJs();
    let data: Uint8Array | undefined;
    try {
      const existing = await vfsReadFile(path);
      if (existing && existing.byteLength > 0) data = existing;
    } catch {
      data = undefined; // new database
    }
    const db = new SQL.Database(data);
    return new WebDatabase(db, path);
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    if (this.closed) throw new Error("WebDatabase: closed");
    if (params && params.length > 0) {
      // Parameterized statements are single-statement in this codebase.
      const stmt = this.db.prepare(sql);
      try {
        stmt.bind(params as unknown[]);
        stmt.step();
      } finally {
        stmt.free();
      }
    } else {
      // Plain SQL may contain multiple statements (schema/migrations).
      this.db.run(sql);
    }
    this.schedulePersist();
  }

  async select<T>(sql: string, params?: unknown[]): Promise<T[]> {
    if (this.closed) throw new Error("WebDatabase: closed");
    const stmt = this.db.prepare(sql);
    const rows: T[] = [];
    try {
      if (params && params.length > 0) stmt.bind(params as unknown[]);
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
    } finally {
      stmt.free();
    }
    return rows;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.persistNow();
    try {
      this.db.close();
    } catch {
      // ignore double-close
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persistNow();
    }, PERSIST_DEBOUNCE_MS);
  }

  /** Flush any debounced writes immediately (used on beforeunload). */
  async flushForUnload(): Promise<void> {
    if (this.closed) return;
    await this.persistNow();
  }

  private async persistNow(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    const previous = this.persisting;
    this.persisting = (async () => {
      await previous.catch(() => {});
      try {
        const image = this.db.export();
        await vfsPersistBytes(this.path, image);
      } catch (err) {
        console.error("[WebDatabase] persist failed:", this.path, err);
      }
    })();
    return this.persisting;
  }
}

