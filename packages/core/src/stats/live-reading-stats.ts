import type { ReadingSession } from "../types/reading";
import type { DailyStats, OverallStats } from "./reading-stats";

function toDateKey(timestamp: number): string {
  return new Date(timestamp).toISOString().split("T")[0];
}

function calculateStreaks(dailyStats: DailyStats[]): {
  longestStreak: number;
  currentStreak: number;
} {
  const activeDates = dailyStats
    .filter((day) => day.totalTime > 0)
    .map((day) => day.date)
    .sort();

  if (activeDates.length === 0) {
    return { longestStreak: 0, currentStreak: 0 };
  }

  let longestStreak = 1;
  let tempStreak = 1;

  for (let i = 1; i < activeDates.length; i++) {
    const prev = new Date(activeDates[i - 1]);
    const curr = new Date(activeDates[i]);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);

    if (diffDays === 1) {
      tempStreak++;
    } else {
      tempStreak = 1;
    }

    longestStreak = Math.max(longestStreak, tempStreak);
  }

  const today = toDateKey(Date.now());
  const yesterday = toDateKey(Date.now() - 86400000);

  if (!activeDates.includes(today) && !activeDates.includes(yesterday)) {
    return { longestStreak, currentStreak: 0 };
  }

  let currentStreak = 1;
  const reversed = [...activeDates].reverse();
  for (let i = 1; i < reversed.length; i++) {
    const curr = new Date(reversed[i - 1]);
    const prev = new Date(reversed[i]);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);
    if (diffDays === 1) {
      currentStreak++;
    } else {
      break;
    }
  }

  return { longestStreak, currentStreak };
}

export function mergeCurrentSessionIntoDailyStats(
  dailyStats: DailyStats[],
  currentSession: ReadingSession | null,
): DailyStats[] {
  if (!currentSession || currentSession.totalActiveTime <= 0) {
    return dailyStats;
  }

  const sessionDate = toDateKey(currentSession.startedAt);
  const sessionMinutes = currentSession.totalActiveTime / 60000;
  const existing = dailyStats.find((day) => day.date === sessionDate);

  if (existing) {
    return dailyStats.map((day) =>
      day.date === sessionDate
        ? {
            ...day,
            totalTime: day.totalTime + sessionMinutes,
            pagesRead: day.pagesRead + currentSession.pagesRead,
            charactersRead: (day.charactersRead ?? 0) + (currentSession.charactersRead ?? 0),
            sessionsCount: day.sessionsCount + 1,
          }
        : day,
    );
  }

  return [
    ...dailyStats,
    {
      date: sessionDate,
      totalTime: sessionMinutes,
      pagesRead: currentSession.pagesRead,
      charactersRead: currentSession.charactersRead ?? 0,
      sessionsCount: 1,
    },
  ].sort((a, b) => a.date.localeCompare(b.date));
}

export function mergeCurrentSessionIntoOverallStats(
  overallStats: OverallStats | null,
  dailyStats: DailyStats[],
  currentSession: ReadingSession | null,
): OverallStats | null {
  if (!overallStats || !currentSession || currentSession.totalActiveTime <= 0) {
    return overallStats;
  }

  const mergedDaily = mergeCurrentSessionIntoDailyStats(dailyStats, currentSession);
  const totalReadingDays = mergedDaily.filter((day) => day.totalTime > 0).length;
  const totalReadingTime = overallStats.totalReadingTime + currentSession.totalActiveTime / 60000;
  const totalCharactersRead =
    (overallStats.totalCharactersRead ?? 0) + (currentSession.charactersRead ?? 0);
  const { longestStreak, currentStreak } = calculateStreaks(mergedDaily);

  return {
    ...overallStats,
    totalReadingTime,
    totalCharactersRead,
    avgCharactersPerMinute: totalReadingTime > 0 ? totalCharactersRead / totalReadingTime : 0,
    totalSessions: overallStats.totalSessions + 1,
    totalReadingDays,
    avgDailyTime: totalReadingTime / Math.max(1, totalReadingDays),
    longestStreak,
    currentStreak,
  };
}
