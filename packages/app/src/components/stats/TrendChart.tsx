import { scaleLinear, scalePoint } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";
/**
 * TrendChart — SVG area/line chart for reading trends using D3
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface TrendData {
  date: string;
  value: number;
}

interface TrendChartProps {
  data: TrendData[];
  height?: number;
  emptyMessage?: string;
}

const formatTime = (minutes: number): string => {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h${m}m` : `${h}h`;
};

const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export function TrendChart({ data, height = 160, emptyMessage }: TrendChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const updateWidth = useCallback(() => {
    if (containerRef.current) {
      setWidth(containerRef.current.clientWidth);
    }
  }, []);

  useEffect(() => {
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [updateWidth]);

  const margin = { top: 12, right: 12, bottom: 28, left: 48 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const hasData = data.some((d) => d.value > 0);

  const maxValue = useMemo(() => Math.max(...data.map((d) => d.value), 1), [data]);

  const xScale = useMemo(
    () =>
      scalePoint<string>()
        .domain(data.map((d) => d.date))
        .range([0, innerWidth])
        .padding(0.05),
    [data, innerWidth],
  );

  const yScale = useMemo(
    () =>
      scaleLinear()
        .domain([0, maxValue * 1.1])
        .range([innerHeight, 0])
        .nice(),
    [maxValue, innerHeight],
  );

  const linePath = useMemo(() => {
    const gen = line<TrendData>()
      .x((d: TrendData) => xScale(d.date) || 0)
      .y((d: TrendData) => yScale(d.value))
      .curve(curveMonotoneX);
    return gen(data) || "";
  }, [data, xScale, yScale]);

  const areaPath = useMemo(() => {
    const gen = area<TrendData>()
      .x((d: TrendData) => xScale(d.date) || 0)
      .y0(innerHeight)
      .y1((d: TrendData) => yScale(d.value))
      .curve(curveMonotoneX);
    return gen(data) || "";
  }, [data, xScale, yScale, innerHeight]);

  // Pick ~6 evenly spaced X axis labels
  const xTicks = useMemo(() => {
    if (data.length <= 7) return data.map((d) => d.date);
    const step = Math.ceil(data.length / 6);
    const ticks: string[] = [];
    for (let i = 0; i < data.length; i += step) {
      ticks.push(data[i].date);
    }
    // Always include last date
    if (ticks[ticks.length - 1] !== data[data.length - 1].date) {
      ticks.push(data[data.length - 1].date);
    }
    return ticks;
  }, [data]);

  // Y axis ticks
  const yTicks = useMemo(() => yScale.ticks(4), [yScale]);

  if (!hasData && emptyMessage) {
    return (
      <div
        ref={containerRef}
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        {emptyMessage}
      </div>
    );
  }

  // Tooltip positioning helper
  const getTooltipX = (idx: number): number => {
    const x = xScale(data[idx].date) || 0;
    const tooltipW = 72;
    // Clamp within chart area
    if (x - tooltipW / 2 < 0) return tooltipW / 2;
    if (x + tooltipW / 2 > innerWidth) return innerWidth - tooltipW / 2;
    return x;
  };

  return (
    <div ref={containerRef} className="w-full">
      <svg width={width} height={height}>
        <defs>
          <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(16, 185, 129)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="rgb(16, 185, 129)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Y axis grid lines & labels */}
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={0}
                y1={yScale(tick)}
                x2={innerWidth}
                y2={yScale(tick)}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={-8}
                y={yScale(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill="var(--muted-foreground)"
              >
                {formatTime(tick)}
              </text>
            </g>
          ))}

          {/* Area fill */}
          <path d={areaPath} fill="url(#trendGradient)" />
          {/* Line */}
          <path d={linePath} fill="none" stroke="rgb(16, 185, 129)" strokeWidth={2} />

          {/* X axis labels */}
          {xTicks.map((date) => (
            <text
              key={`x-${date}`}
              x={xScale(date) || 0}
              y={innerHeight + 18}
              textAnchor="middle"
              fontSize={10}
              fill="var(--muted-foreground)"
            >
              {formatDate(date)}
            </text>
          ))}

          {/* Baseline */}
          <line
            x1={0}
            y1={innerHeight}
            x2={innerWidth}
            y2={innerHeight}
            stroke="var(--border)"
            strokeWidth={1}
          />

          {/* Invisible hit areas for hover */}
          {data.map((d, i) => {
            const x = xScale(d.date) || 0;
            const step = innerWidth / Math.max(data.length - 1, 1);
            return (
              <rect
                key={d.date}
                x={x - step / 2}
                y={0}
                width={step}
                height={innerHeight}
                fill="transparent"
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            );
          })}

          {/* Hover indicator */}
          {hoveredIndex !== null && data[hoveredIndex] && (
            <g>
              <line
                x1={xScale(data[hoveredIndex].date) || 0}
                y1={0}
                x2={xScale(data[hoveredIndex].date) || 0}
                y2={innerHeight}
                stroke="var(--muted-foreground)"
                strokeWidth={1}
                strokeDasharray="3,3"
              />
              <circle
                cx={xScale(data[hoveredIndex].date) || 0}
                cy={yScale(data[hoveredIndex].value)}
                r={4}
                fill="rgb(16, 185, 129)"
                stroke="var(--background)"
                strokeWidth={2}
              />
              {/* Tooltip */}
              <rect
                x={getTooltipX(hoveredIndex) - 36}
                y={Math.max(yScale(data[hoveredIndex].value) - 32, 0)}
                width={72}
                height={22}
                rx={4}
                fill="var(--popover)"
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={getTooltipX(hoveredIndex)}
                y={Math.max(yScale(data[hoveredIndex].value) - 32, 0) + 14}
                textAnchor="middle"
                fill="var(--popover-foreground)"
                fontSize={10}
                fontWeight={500}
              >
                {formatDate(data[hoveredIndex].date)} {formatTime(data[hoveredIndex].value)}
              </text>
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}
