export interface VectorRecord {
  id: string;
  bookId: string;
  embedding: number[];
}

export interface VectorSearchResult {
  id: string;
  bookId: string;
  score: number;
}

export interface IVectorDB {
  isReady(): Promise<boolean>;
  insert(records: VectorRecord[]): Promise<void>;
  deleteByBookId(bookId: string): Promise<void>;
  deleteByIds(ids: string[]): Promise<void>;
  search(query: number[], bookId: string, topK: number): Promise<VectorSearchResult[]>;
  getStats(): Promise<{ totalVectors: number; dimension: number }>;
  rebuild?(): Promise<number>;
  reinit?(dimension: number): Promise<void>;
  close(): Promise<void>;
}

let vectorDB: IVectorDB | null = null;

export function setVectorDB(db: IVectorDB): void {
  vectorDB = db;
}

export function getVectorDB(): IVectorDB | null {
  return vectorDB;
}

export function hasVectorDB(): boolean {
  return vectorDB !== null;
}
