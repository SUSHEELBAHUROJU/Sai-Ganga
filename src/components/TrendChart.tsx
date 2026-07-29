import { useState } from 'react'
import { BarChart3, Table2 } from 'lucide-react'
import type { DayPoint } from '../hooks/useMonthlyReport'
import { useElementWidth } from '../hooks/useElementWidth'
import { formatQty } from '../lib/format'
import { formatShortDate } from '../lib/date'

const SERIES = [
  { key: 'produced', label: 'Produced', color: 'var(--viz-produced)' },
  { key: 'sold', label: 'Sold', color: 'var(--viz-sold)' },
] as const

const PAD = { top: 12, right: 14, bottom: 26, left: 40 }
const PLOT_HEIGHT = 190

/** Round a value up to a clean 1/2/2.5/5/10 step. */
function niceCeil(value: number): number {
  if (value <= 0) return 10
  const magnitude = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude
    if (candidate >= value) return candidate
  }
  return 10 * magnitude
}

/**
 * Y scale with round gridline values that stops just above the data, rather
 * than snapping the top to a single nice number — that left a peak of 120
 * sitting in a 0–200 plot, wasting most of the height.
 */
function axisScale(dataMax: number): { max: number; ticks: number[] } {
  if (dataMax <= 0) return { max: 10, ticks: [0, 5, 10] }
  const interval = niceCeil(dataMax / 4)
  const max = Math.ceil(dataMax / interval) * interval
  const ticks: number[] = []
  for (let v = 0; v <= max + 1e-9; v += interval) ticks.push(v)
  return { max, ticks }
}

/**
 * Day labels every 5th day plus the month's last day — but only when the last
 * day is far enough from the previous tick to not collide with it (day 30 and
 * 31 otherwise overprint into "3031").
 */
function tickDaysFor(totalDays: number): number[] {
  const ticks = [1]
  for (let day = 5; day <= totalDays; day += 5) ticks.push(day)
  const last = ticks[ticks.length - 1]
  if (totalDays - last >= 3) ticks.push(totalDays)
  return ticks
}

type TrendChartProps = {
  series: DayPoint[]
  rangeLabel: string
}

export function TrendChart({ series, rangeLabel }: TrendChartProps) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>()
  const [showTable, setShowTable] = useState(false)
  const [activeDay, setActiveDay] = useState<number | null>(null)

  const hasData = series.some((d) => d.produced > 0 || d.sold > 0)
  const { max: maxValue, ticks: gridValues } = axisScale(
    Math.max(...series.map((d) => Math.max(d.produced, d.sold)), 0),
  )

  const plotWidth = Math.max(width - PAD.left - PAD.right, 10)
  const totalHeight = PLOT_HEIGHT + PAD.top + PAD.bottom

  const xFor = (day: number) =>
    PAD.left + (series.length > 1 ? ((day - 1) / (series.length - 1)) * plotWidth : plotWidth / 2)
  const yFor = (value: number) => PAD.top + PLOT_HEIGHT - (value / maxValue) * PLOT_HEIGHT

  const linePath = (key: 'produced' | 'sold') =>
    series.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xFor(d.day)} ${yFor(d[key])}`).join(' ')

  const tickDays = tickDaysFor(series.length)

  const active = activeDay === null ? null : series.find((d) => d.day === activeDay) ?? null

  function handlePointer(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left - PAD.left
    const ratio = Math.min(Math.max(x / plotWidth, 0), 1)
    setActiveDay(Math.round(ratio * (series.length - 1)) + 1)
  }

  return (
    <div className="viz-root">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        {/* Legend — always present for two series, so identity is never colour alone. */}
        <ul className="flex flex-wrap items-center gap-4">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-0.5 w-4 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                {s.label}
              </span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          {showTable ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
          {showTable ? 'Chart' : 'Table'}
        </button>
      </div>

      {!hasData && (
        <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">
          No production or sales recorded in {rangeLabel}.
        </p>
      )}

      {hasData && showTable && (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="sticky top-0 bg-white dark:bg-slate-900">
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
                <th className="py-1.5 font-medium">Date</th>
                <th className="py-1.5 text-right font-medium">Produced</th>
                <th className="py-1.5 text-right font-medium">Sold</th>
              </tr>
            </thead>
            <tbody>
              {series
                .filter((d) => d.produced > 0 || d.sold > 0)
                .map((d) => (
                  <tr key={d.day} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1.5 text-slate-600 dark:text-slate-400">
                      {formatShortDate(d.date)}
                    </td>
                    <td className="py-1.5 text-right text-slate-900 dark:text-slate-100">
                      {formatQty(d.produced)}
                    </td>
                    <td className="py-1.5 text-right text-slate-900 dark:text-slate-100">
                      {formatQty(d.sold)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {hasData && !showTable && (
        <div ref={containerRef} className="relative w-full">
          {width > 0 && (
            <svg
              width={width}
              height={totalHeight}
              role="img"
              aria-label={`Daily produced and sold pieces for ${rangeLabel}`}
              onPointerMove={handlePointer}
              onPointerLeave={() => setActiveDay(null)}
              className="touch-pan-y"
            >
              {/* Hairline solid gridlines, one step off the surface */}
              {gridValues.map((value) => (
                <g key={value}>
                  <line
                    x1={PAD.left}
                    x2={width - PAD.right}
                    y1={yFor(value)}
                    y2={yFor(value)}
                    stroke="var(--viz-grid)"
                    strokeWidth={1}
                  />
                  <text
                    x={PAD.left - 6}
                    y={yFor(value) + 3}
                    textAnchor="end"
                    fontSize={10}
                    fill="var(--viz-muted)"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {formatQty(value)}
                  </text>
                </g>
              ))}

              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={yFor(0)}
                y2={yFor(0)}
                stroke="var(--viz-axis)"
                strokeWidth={1}
              />

              {tickDays.map((day) => {
                const point = series[day - 1]
                return (
                  <text
                    key={day}
                    x={xFor(day)}
                    y={totalHeight - 8}
                    textAnchor="middle"
                    fontSize={10}
                    fill="var(--viz-muted)"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {point ? formatShortDate(point.date) : day}
                  </text>
                )
              })}

              {active && (
                <line
                  x1={xFor(active.day)}
                  x2={xFor(active.day)}
                  y1={PAD.top}
                  y2={PAD.top + PLOT_HEIGHT}
                  stroke="var(--viz-axis)"
                  strokeWidth={1}
                />
              )}

              {SERIES.map((s) => (
                <path
                  key={s.key}
                  d={linePath(s.key)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}

              {/* Markers on the hovered day carry a 2px surface ring so they
                  stay legible where the two lines cross. */}
              {active &&
                SERIES.map((s) => (
                  <circle
                    key={s.key}
                    cx={xFor(active.day)}
                    cy={yFor(active[s.key])}
                    r={4}
                    fill={s.color}
                    stroke="var(--viz-surface)"
                    strokeWidth={2}
                  />
                ))}
            </svg>
          )}

          {active && (
            <div
              className="pointer-events-none absolute top-0 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg dark:border-slate-700 dark:bg-slate-800"
              style={{
                left: Math.min(Math.max(xFor(active.day) - 52, 0), Math.max(width - 108, 0)),
              }}
            >
              <p className="mb-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {formatShortDate(active.date)}
              </p>
              {SERIES.map((s) => (
                <p key={s.key} className="flex items-center gap-1.5 text-xs">
                  <span
                    aria-hidden
                    className="h-0.5 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                    {formatQty(active[s.key])}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">{s.label}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
