import { describe, expect, it } from "vitest";

import {
  buildLifetimePeriodRef,
  buildPeriodRef,
  getMonthKey,
  getWeekEndDate,
  getWeekKey,
  getWeekStartDate,
  getYearKey,
  toLocalDateKey,
} from "./period-utils";

describe("period-utils", () => {
  it("formats local date keys using local calendar fields", () => {
    const date = new Date(2026, 3, 17, 9, 30, 0);
    expect(toLocalDateKey(date)).toBe("2026-04-17");
  });

  it("calculates monday-based week start and sunday-based week end", () => {
    const date = new Date(2026, 3, 17, 9, 30, 0); // 2026-04-17, Friday
    expect(toLocalDateKey(getWeekStartDate(date))).toBe("2026-04-13");
    expect(toLocalDateKey(getWeekEndDate(date))).toBe("2026-04-19");
  });

  it("builds stable week/month/year keys", () => {
    const date = new Date(2026, 3, 17, 9, 30, 0);
    expect(getWeekKey(date)).toBe("2026-W16");
    expect(getMonthKey(date)).toBe("2026-04");
    expect(getYearKey(date)).toBe("2026");
  });

  it("builds period refs for navigable dimensions", () => {
    const date = new Date(2026, 3, 17, 9, 30, 0);

    expect(buildPeriodRef("day", date)).toEqual({
      dimension: "day",
      key: "2026-04-17",
      startDate: "2026-04-17",
      endDate: "2026-04-17",
      label: "2026-04-17",
    });

    expect(buildPeriodRef("month", date)).toEqual({
      dimension: "month",
      key: "2026-04",
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      label: "2026-04",
    });
  });

  it("builds a lifetime period ref from joined date to today", () => {
    const joined = new Date(2026, 0, 1, 12, 0, 0);
    const lifetime = buildLifetimePeriodRef(joined);

    expect(lifetime.dimension).toBe("lifetime");
    expect(lifetime.key).toBe("lifetime");
    expect(lifetime.startDate).toBe("2026-01-01");
    expect(lifetime.label).toBe("Since 2026-01-01");
  });
});
