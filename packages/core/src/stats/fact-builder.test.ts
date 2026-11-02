import { describe, expect, it } from "vitest";

import type { Book, ReadingSession } from "../types";
import { buildDailyReadingFacts } from "./fact-builder";

function createSession(overrides: Partial<ReadingSession>): ReadingSession {
  return {
    id: overrides.id ?? "session",
    bookId: overrides.bookId ?? "book-1",
    state: overrides.state ?? "STOPPED",
    startedAt: overrides.startedAt ?? new Date(2026, 3, 17, 9, 0, 0).getTime(),
    endedAt: overrides.endedAt,
    pausedAt: overrides.pausedAt,
    totalActiveTime: overrides.totalActiveTime ?? 30 * 60 * 1000,
    pagesRead: overrides.pagesRead ?? 10,
    startCfi: overrides.startCfi,
    endCfi: overrides.endCfi,
  };
}

const books: Book[] = [
  {
    id: "book-1",
    filePath: "/tmp/book-1.epub",
    format: "epub",
    meta: {
      title: "Deep Reading",
      author: "Alice",
      coverUrl: "cover-1",
      subjects: ["Personal Growth"],
    },
    addedAt: 1,
    updatedAt: 1,
    progress: 0.42,
    isVectorized: false,
    vectorizeProgress: 0,
    tags: ["Growth"],
    syncStatus: "local",
  },
  {
    id: "book-2",
    filePath: "/tmp/book-2.epub",
    format: "epub",
    meta: {
      title: "Second Book",
      author: "Bob",
    },
    addedAt: 1,
    updatedAt: 1,
    progress: 1,
    isVectorized: false,
    vectorizeProgress: 0,
    tags: [],
    syncStatus: "local",
  },
];

describe("buildDailyReadingFacts", () => {
  it("groups sessions by local day and computes summary metrics", () => {
    const sessions: ReadingSession[] = [
      createSession({
        id: "s1",
        bookId: "book-1",
        startedAt: new Date(2026, 3, 17, 9, 0, 0).getTime(),
        endedAt: new Date(2026, 3, 17, 9, 30, 0).getTime(),
        totalActiveTime: 30 * 60 * 1000,
        pagesRead: 8,
      }),
      createSession({
        id: "s2",
        bookId: "book-1",
        startedAt: new Date(2026, 3, 17, 20, 0, 0).getTime(),
        endedAt: new Date(2026, 3, 17, 20, 45, 0).getTime(),
        totalActiveTime: 45 * 60 * 1000,
        pagesRead: 12,
      }),
      createSession({
        id: "s3",
        bookId: "book-2",
        startedAt: new Date(2026, 3, 18, 7, 0, 0).getTime(),
        endedAt: new Date(2026, 3, 18, 7, 20, 0).getTime(),
        totalActiveTime: 20 * 60 * 1000,
        pagesRead: 5,
      }),
    ];

    const facts = buildDailyReadingFacts(sessions, books);

    expect(facts).toHaveLength(2);
    expect(facts[0]).toMatchObject({
      date: "2026-04-17",
      totalTime: 75,
      pagesRead: 20,
      sessionsCount: 2,
      booksTouched: 1,
      avgSessionTime: 37.5,
      longestSessionTime: 45,
      peakHour: 20,
      weekKey: "2026-W16",
      monthKey: "2026-04",
      yearKey: "2026",
    });
    expect(facts[0].bookBreakdown).toEqual([
      expect.objectContaining({
        bookId: "book-1",
        title: "Deep Reading",
        tags: ["Growth"],
        subjects: ["Personal Growth"],
        totalTime: 75,
        pagesRead: 20,
        sessionsCount: 2,
        progressEnd: 0.42,
      }),
    ]);
    expect(facts[0].hourlyDistribution[9]).toBe(30);
    expect(facts[0].hourlyDistribution[20]).toBe(45);

    expect(facts[1]).toMatchObject({
      date: "2026-04-18",
      totalTime: 20,
      pagesRead: 5,
      sessionsCount: 1,
      booksTouched: 1,
      peakHour: 7,
    });
  });

  it("sorts book breakdown by reading time and keeps unknown books safe", () => {
    const sessions: ReadingSession[] = [
      createSession({
        id: "s1",
        bookId: "book-unknown",
        startedAt: new Date(2026, 3, 17, 8, 0, 0).getTime(),
        totalActiveTime: 15 * 60 * 1000,
      }),
      createSession({
        id: "s2",
        bookId: "book-1",
        startedAt: new Date(2026, 3, 17, 10, 0, 0).getTime(),
        totalActiveTime: 45 * 60 * 1000,
      }),
    ];

    const [fact] = buildDailyReadingFacts(sessions, books);

    expect(fact.booksTouched).toBe(2);
    expect(fact.bookBreakdown[0]).toMatchObject({
      bookId: "book-1",
      title: "Deep Reading",
      totalTime: 45,
    });
    expect(fact.bookBreakdown[1]).toMatchObject({
      bookId: "book-unknown",
      title: "Unknown",
      tags: [],
      subjects: [],
      totalTime: 15,
    });
  });
});
