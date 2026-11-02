export type TimeGroup = "today" | "yesterday" | "last7Days" | "last30Days" | "older";

export interface GroupedThreads<T> {
  today: T[];
  yesterday: T[];
  last7Days: T[];
  last30Days: T[];
  older: T[];
}

export function getTimeGroup(timestamp: number): TimeGroup {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStart = yesterday.getTime();

  const last7DaysStart = todayStart - 7 * 24 * 60 * 60 * 1000;
  const last30DaysStart = todayStart - 30 * 24 * 60 * 60 * 1000;

  if (timestamp >= todayStart) {
    return "today";
  } else if (timestamp >= yesterdayStart) {
    return "yesterday";
  } else if (timestamp >= last7DaysStart) {
    return "last7Days";
  } else if (timestamp >= last30DaysStart) {
    return "last30Days";
  } else {
    return "older";
  }
}

export function getMonthLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function groupThreadsByTime<T extends { updatedAt: number }>(
  threads: T[],
): GroupedThreads<T> {
  const groups: GroupedThreads<T> = {
    today: [],
    yesterday: [],
    last7Days: [],
    last30Days: [],
    older: [],
  };

  for (const thread of threads) {
    const group = getTimeGroup(thread.updatedAt);
    groups[group].push(thread);
  }

  return groups;
}

export function groupThreadsByMonth<T extends { updatedAt: number }>(
  threads: T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  const sortedThreads = [...threads].sort((a, b) => b.updatedAt - a.updatedAt);

  for (const thread of sortedThreads) {
    const monthLabel = getMonthLabel(thread.updatedAt);
    if (!groups.has(monthLabel)) {
      groups.set(monthLabel, []);
    }
    groups.get(monthLabel)!.push(thread);
  }

  return groups;
}

export function formatRelativeTimeShort(ts: number, t: (key: string) => string): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("chat.justNow");
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const date = new Date(ts);
  const now = new Date();
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}
