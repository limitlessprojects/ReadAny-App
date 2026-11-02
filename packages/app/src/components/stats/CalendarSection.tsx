/**
 * CalendarSection.tsx — Month calendar grid with day cells.
 * Desktop behavior intentionally matches mobile stats calendar.
 */
import { useResolvedSrc } from "@/hooks/use-resolved-src";
import type { MonthReport, StatsCalendarCell } from "@readany/core/stats";
import { cn } from "@readany/core/utils";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCompactMinutes, intensityClass } from "./stats-utils";

export function MonthCalendarSection({
  calendar,
  isZh,
}: {
  calendar: NonNullable<MonthReport["readingCalendar"]>;
  isZh: boolean;
}) {
  const locale = isZh ? "zh-CN" : "en-US";
  const weekLabels = useMemo(() => {
    const monday = new Date(2024, 0, 1);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
    });
  }, [locale]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-2.5">
        {weekLabels.map((label) => (
          <div
            key={label}
            className="px-1 text-center text-[11px] font-medium text-muted-foreground/52"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="space-y-2.5">
        {calendar.weeks.map((week, index) => (
          <div key={`${calendar.monthKey}-${index}`} className="grid grid-cols-7 gap-2.5">
            {week.map((cell) => (
              <CalendarDayCell key={cell.date} cell={cell} isZh={isZh} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarDayCell({
  cell,
  isZh,
}: {
  cell: StatsCalendarCell;
  isZh: boolean;
}) {
  const { t } = useTranslation();
  const [coverIndex, setCoverIndex] = useState(0);
  const hasCovers = cell.covers.length > 0;
  const multipleCovers = cell.covers.length > 1;
  const currentCover = hasCovers ? cell.covers[coverIndex % cell.covers.length] : null;

  const titleText =
    cell.totalTime > 0
      ? `${cell.date} · ${formatCompactMinutes(cell.totalTime, isZh)}`
      : `${cell.date} · ${t("stats.noReading")}`;

  if (currentCover) {
    const shellClassName = cn(
      "book-cover-shadow relative aspect-[28/41] overflow-hidden rounded transition-all duration-200",
      "hover:-translate-y-0.5",
      cell.isToday && "ring-1.5 ring-primary/25 ring-offset-1 ring-offset-background",
      !cell.inCurrentMonth && "opacity-55",
      multipleCovers && "cursor-pointer",
    );

    const content = (
      <>
        <CalendarBookFace
          title={currentCover.title}
          coverUrl={currentCover.coverUrl}
          className="absolute inset-0 h-full w-full rounded"
        />
        <div className="book-spine absolute inset-0 rounded" />

        <div className="absolute inset-x-0 top-0 z-[3] h-[44%] bg-gradient-to-b from-black/42 via-black/14 to-transparent" />

        <div className="absolute inset-0 z-[4] flex flex-col justify-between p-1.5">
          <div className="flex items-start justify-between gap-1">
            <span className="text-[13px] font-semibold tabular-nums text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]">
              {cell.dayOfMonth}
            </span>
            {cell.totalTime > 0 && (
              <span className="text-[10px] font-semibold tabular-nums text-white/92 drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]">
                {formatCompactMinutes(cell.totalTime, isZh)}
              </span>
            )}
          </div>

          {multipleCovers && (
            <div className="flex justify-end">
              <span className="inline-flex items-center rounded-full border border-white/24 bg-black/28 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white/92 shadow-[0_2px_6px_rgba(0,0,0,0.18)] backdrop-blur-[2px]">
                {(coverIndex % cell.covers.length) + 1}/{cell.covers.length}
              </span>
            </div>
          )}
        </div>
      </>
    );

    if (multipleCovers) {
      return (
        <button
          type="button"
          title={titleText}
          onClick={() => setCoverIndex((prev) => (prev + 1) % cell.covers.length)}
          className={shellClassName}
        >
          {content}
        </button>
      );
    }

    return (
      <div title={titleText} className={shellClassName}>
        {content}
      </div>
    );
  }

  return (
    <div
      title={titleText}
      className={cn(
        "flex aspect-[28/41] flex-col rounded-[14px] border p-2 transition-all duration-200",
        intensityClass(cell.intensity, cell.inCurrentMonth),
        cell.isToday && "ring-1.5 ring-primary/25 ring-offset-1 ring-offset-background",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <span
          className={cn(
            "text-[13px] font-semibold tabular-nums",
            cell.inCurrentMonth ? "text-foreground/78" : "text-muted-foreground/32",
            cell.isToday && "text-primary/72",
          )}
        >
          {cell.dayOfMonth}
        </span>
        {cell.totalTime > 0 && (
          <span className="text-[10px] font-medium tabular-nums text-foreground/62">
            {formatCompactMinutes(cell.totalTime, isZh)}
          </span>
        )}
      </div>
    </div>
  );
}

function CalendarBookFace({
  title,
  coverUrl,
  className,
}: {
  title: string;
  coverUrl?: string;
  className?: string;
}) {
  const resolved = useResolvedSrc(coverUrl);

  return resolved ? (
    <img
      src={resolved}
      alt=""
      className={cn("absolute inset-0 h-full w-full rounded object-cover", className)}
      loading="lazy"
    />
  ) : (
    <div
      className={cn(
        "absolute inset-0 flex items-center justify-center rounded bg-gradient-to-b from-stone-100 to-stone-200 px-1.5",
        className,
      )}
    >
      <span className="line-clamp-2 text-center font-serif text-[10px] font-medium leading-tight text-stone-400">
        {title.trim().slice(0, 6)}
      </span>
    </div>
  );
}
