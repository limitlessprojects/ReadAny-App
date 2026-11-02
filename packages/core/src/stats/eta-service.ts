/**
 * eta-service.ts — Estimate days remaining to finish a book based on recent reading pace.
 */
import { toLocalDateKey } from "./period-utils";
import type { DailyReadingFact } from "./schema";

export interface BookETA {
  bookId: string;
  /** Pages still to read. */
  remainingPages: number;
  /** Recent average pages per active day (days user actually read this book). */
  avgPagesPerDay: number;
  /** Estimated days to finish at current pace. */
  etaDays: number;
}

/**
 * Compute ETA (days to finish) for a single book using recent pace.
 *
 * Returns null when we can't make a reliable estimate — caller should hide the UI.
 */
export function computeBookETA(
  bookId: string,
  progress: number,
  totalPages: number | undefined,
  facts: DailyReadingFact[],
  lookbackDays = 14,
  now: Date = new Date(),
): BookETA | null {
  if (!totalPages || totalPages <= 0) return null;
  if (progress >= 1) return null;

  const remainingPages = Math.max(1, Math.round(totalPages * (1 - progress)));

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - (lookbackDays - 1));
  const cutoffKey = toLocalDateKey(cutoff);

  let sumPages = 0;
  let activeDays = 0;
  for (const fact of facts) {
    if (fact.date < cutoffKey) continue;
    const breakdown = fact.bookBreakdown.find((b) => b.bookId === bookId);
    if (breakdown && breakdown.pagesRead > 0) {
      sumPages += breakdown.pagesRead;
      activeDays += 1;
    }
  }

  if (activeDays === 0 || sumPages === 0) return null;

  const avgPagesPerDay = sumPages / activeDays;
  const etaDays = Math.max(1, Math.ceil(remainingPages / avgPagesPerDay));

  return { bookId, remainingPages, avgPagesPerDay, etaDays };
}
