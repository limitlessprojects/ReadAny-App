import { scaleBand, scaleLinear } from "d3-scale";
/**
 * BarChart — SVG bar chart using D3 scales + React rendering
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface BarData {
  label: string;
  value: number;
}

interface BarChartProps {
  data: BarData[];
  height?: number;
  emptyMessage?: string;
  formatValue?: (value: number) => string;
}

const defaultFormatTime = (minutes: number): string => {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h${m}m` : `${h}h`;
};

export function BarChart({
  data,
  height = 200,
  emptyMessage,
  formatValue = defaultFormatTime,
}: BarChartProps) {
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

  const margin = { top: 10, right: 10, bottom: 28, left: 42 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const maxValue = useMemo(() => Math.max(...data.map((d) => d.value), 1), [data]);
  const hasData = data.some((d) => d.value > 0);

  const xScale = useMemo(
    () =>
      scaleBand<string>()
        .domain(data.map((d) => d.label))
        .range([0, innerWidth])
        .padding(0.3),
    [data, innerWidth],
  );

  const yScale = useMemo(
    () => scaleLinear().domain([0, maxValue]).range([innerHeight, 0]).nice(),
    [maxValue, innerHeight],
  );

  // Y axis ticks
  const yTicks = useMemo(() => yScale.ticks(3), [yScale]);

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
    const d = data[idx];
    const x = (xScale(d.label) || 0) + xScale.bandwidth() / 2;
    const tooltipW = 56;
    if (x - tooltipW / 2 < 0) return tooltipW / 2;
    if (x + tooltipW / 2 > innerWidth) return innerWidth - tooltipW / 2;
    return x;
  };

  return (
    <div ref={containerRef} className="w-full">
      <svg width={width} height={height}>
        <defs>
          <linearGradient id="barGradient" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.18} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.72} />
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
                opacity={0.55}
              />
              <text
                x={-8}
                y={yScale(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill="var(--muted-foreground)"
              >
                {formatValue(tick)}
              </text>
            </g>
          ))}

          {/* Bars */}
          {data.map((d, i) => {
            const barHeight = innerHeight - yScale(d.value);
            const bandWidth = xScale.bandwidth();
            const barWidth = Math.min(bandWidth, 24);
            const x = (xScale(d.label) || 0) + (bandWidth - barWidth) / 2;
            const isHovered = hoveredIndex === i;
            return (
              <g
                key={`bar-${i}`}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {/* Invisible wider hit area */}
                <rect
                  x={x - Math.max((bandWidth - barWidth) / 2, 2)}
                  y={0}
                  width={Math.max(barWidth + 4, bandWidth)}
                  height={innerHeight}
                  fill="transparent"
                />
                <rect
                  x={x}
                  y={yScale(d.value)}
                  width={barWidth}
                  height={Math.max(barHeight, 0)}
                  fill="url(#barGradient)"
                  rx={5}
                  opacity={isHovered ? 1 : 0.85}
                  className="transition-opacity"
                />
                {/* Tooltip on hover */}
                {isHovered && d.value > 0 && (
                  <g>
                    <rect
                      x={getTooltipX(i) - 28}
                      y={Math.max(yScale(d.value) - 28, 0)}
                      width={56}
                      height={20}
                      rx={4}
                      fill="var(--popover)"
                      stroke="var(--border)"
                      strokeWidth={1}
                    />
                    <text
                      x={getTooltipX(i)}
                      y={Math.max(yScale(d.value) - 28, 0) + 13}
                      textAnchor="middle"
                      fill="var(--popover-foreground)"
                      fontSize={11}
                      fontWeight={500}
                    >
                      {formatValue(d.value)}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* X axis labels */}
          {data.map((d, i) => (
            <text
              key={`label-${i}`}
              x={(xScale(d.label) || 0) + xScale.bandwidth() / 2}
              y={innerHeight + 18}
              textAnchor="middle"
              fontSize={11}
              fill="var(--muted-foreground)"
            >
              {d.label}
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
            opacity={0.45}
          />
        </g>
      </svg>
    </div>
  );
}
