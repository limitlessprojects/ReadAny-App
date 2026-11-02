import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Book, ReadingSession } from "../types";

const dbMocks = vi.hoisted(() => ({
  getBooks: vi.fn(),
  getAllReadingSessions: vi.fn(),
}));

vi.mock("../db", () => dbMocks);

const { ReadingReportsService } = await import("./reports-service");

const books: Book[] = [
  {
    id: "book-1",
    filePath: "/tmp/book-1.epub",
    format: "epub",
    meta: {
      title: "Deep Reading",
      author: "Alice",
      coverUrl: "cover-1",
    },
    addedAt: 1,
    updatedAt: 1,
    progress: 0.5,
    isVectorized: false,
    vectorizeProgress: 0,
    tags: [],
    syncStatus: "local",
  },
];

const persistedSessions: ReadingSession[] = [
  {
    id: "session-1",
    bookId: "book-1",
    state: "STOPPED",
    startedAt: new Date(2026, 3, 14, 20, 0, 0).getTime(),
    endedAt: new Date(2026, 3, 14, 20, 30, 0).getTime(),
    totalActiveTime: 30 * 60 * 1000,
    pagesRead: 8,
  },
];

describe("ReadingReportsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.getBooks.mockResolvedValue(books);
    dbMocks.getAllReadingSessions.mockResolvedValue(persistedSessions);
  });

  it("builds daily facts from the DB data", async () => {
    const service = new ReadingReportsService();
    const facts = await service.getAllDailyFacts();

    expect(facts).toEqual([
      expect.objectContaining({
        date: "2026-04-14",
        totalTime: 30,
        pagesRead: 8,
        sessionsCount: 1,
        booksTouched: 1,
      }),
    ]);
    expect(dbMocks.getBooks).toHaveBeenCalled();
    expect(dbMocks.getAllReadingSessions).toHaveBeenCalled();
  });

  it("merges a live session when requested", async () => {
    const service = new ReadingReportsService();
    const currentSession: ReadingSession = {
      id: "live-1",
      bookId: "book-1",
      state: "ACTIVE",
      startedAt: new Date(2026, 3, 15, 8, 0, 0).getTime(),
      totalActiveTime: 20 * 60 * 1000,
      pagesRead: 5,
    };

    const facts = await service.getAllDailyFacts(currentSession);

    expect(facts).toHaveLength(2);
    expect(facts[1]).toEqual(
      expect.objectContaining({
        date: "2026-04-15",
        totalTime: 20,
        pagesRead: 5,
      }),
    );
  });

  it("returns a month report with reading calendar data", async () => {
    const service = new ReadingReportsService();
    const report = await service.getMonthReport(new Date(2026, 3, 14));

    expect(report.dimension).toBe("month");
    expect(report.summary.totalReadingTime).toBe(30);
    expect(report.heatmap?.type).toBe("heatmap");
    expect(report.readingCalendar?.monthKey).toBe("2026-04");
    expect(report.topBooks[0]).toMatchObject({
      bookId: "book-1",
      title: "Deep Reading",
    });
  });

  it("returns a lifetime report with profile charts", async () => {
    const service = new ReadingReportsService();
    const report = await service.getLifetimeReport();

    expect(report.dimension).toBe("lifetime");
    expect(report.timeOfDayChart?.data.length).toBeGreaterThan(0);
    expect(report.categoryDistribution?.data.length).toBeGreaterThan(0);
    expect(report.yearlySnapshots[0]?.year).toBe("2026");
  });
});
