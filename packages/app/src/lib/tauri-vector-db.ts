import type { IVectorDB, VectorRecord, VectorSearchResult } from "@readany/core/rag/vector-db";
import { invoke } from "@tauri-apps/api/core";

interface TauriVectorRecord {
  id: string;
  book_id: string;
  embedding: number[];
}

interface TauriVectorSearchResult {
  id: string;
  book_id: string;
  score: number;
}

export class TauriVectorDB implements IVectorDB {
  private readyPromise: Promise<void> | null = null;
  private isInitialized = false;

  constructor() {
    this.readyPromise = this.waitForReady();
  }

  private async waitForReady(maxRetries = 10, delayMs = 500): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await invoke("vector_get_stats");
        this.isInitialized = true;
        console.log("[TauriVectorDB] Rust backend ready");
        return;
      } catch (err) {
        if (i < maxRetries - 1) {
          console.log(`[TauriVectorDB] Waiting for Rust backend... (${i + 1}/${maxRetries})`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
    console.warn("[TauriVectorDB] Rust backend not ready after max retries");
  }

  private async ensureReady(): Promise<void> {
    if (this.isInitialized) return;
    if (this.readyPromise) {
      await this.readyPromise;
    }
    if (!this.isInitialized) {
      throw new Error("Vector database not initialized");
    }
  }

  async isReady(): Promise<boolean> {
    try {
      await this.ensureReady();
      return true;
    } catch {
      return false;
    }
  }

  async insert(records: VectorRecord[]): Promise<void> {
    await this.ensureReady();
    const tauriRecords: TauriVectorRecord[] = records.map((r) => ({
      id: r.id,
      book_id: r.bookId,
      embedding: r.embedding,
    }));
    await invoke("vector_insert", { records: tauriRecords });
  }

  async deleteByBookId(bookId: string): Promise<void> {
    await this.ensureReady();
    await invoke("vector_delete_by_book", { bookId });
  }

  async deleteByIds(_ids: string[]): Promise<void> {
    console.warn("[TauriVectorDB] deleteByIds not implemented");
  }

  async search(query: number[], bookId: string, topK: number): Promise<VectorSearchResult[]> {
    await this.ensureReady();
    const results: TauriVectorSearchResult[] = await invoke("vector_search", {
      query,
      bookId,
      topK,
    });
    return results.map((r) => ({
      id: r.id,
      bookId: r.book_id,
      score: r.score,
    }));
  }

  async getStats(): Promise<{ totalVectors: number; dimension: number }> {
    await this.ensureReady();
    const [totalVectors, dimension]: [number, number] = await invoke("vector_get_stats");
    return { totalVectors, dimension };
  }

  async rebuild(): Promise<number> {
    await this.ensureReady();
    const count: number = await invoke("vector_rebuild");
    console.log(`[TauriVectorDB] Rebuilt ${count} vectors`);
    return count;
  }

  async reinit(dimension: number): Promise<void> {
    await this.ensureReady();
    await invoke("vector_reinit", { dimension });
    console.log(`[TauriVectorDB] Reinitialized with dimension ${dimension}`);
  }

  async close(): Promise<void> {}
}
