import { useDailyReport } from '../../hooks/useDailyReport'
import { AmountKgPcs } from '../../components/AmountKgPcs'
import { formatQty } from '../../lib/format'
import { LoadingState } from '../../components/States'

function Section({
  title,
  total,
  children,
}: {
  title: string
  total?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400">{title}</h3>
        {total && (
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{total}</span>
        )}
      </div>
      {children}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-400 dark:text-slate-500">{children}</p>
}

function Row({ label, value, muted }: { label: string; value: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span
        className={`min-w-0 truncate text-sm ${muted ? 'text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}
      >
        {label}
      </span>
      <span className="shrink-0 text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">
        {value}
      </span>
    </div>
  )
}

export function DailySummaryTab({ fromDate, toDate }: { fromDate: string; toDate: string }) {
  const { data: report, isLoading } = useDailyReport(fromDate, toDate)

  return (
    <div className="space-y-4">
      {isLoading && <LoadingState />}

      {report && (
        <>
          <Section
            title="Production"
            total={<AmountKgPcs kg={report.productionTotalKg} pcs={report.productionTotalPcs} />}
          >
            {report.production.length === 0 ? (
              <Empty>No production recorded.</Empty>
            ) : (
              report.production.map((p) => (
                <Row key={p.label} label={p.label} value={<AmountKgPcs kg={p.kg} pcs={p.pcs} />} />
              ))
            )}
          </Section>

          <Section
            title="Sales"
            total={<AmountKgPcs kg={report.salesTotalKg} pcs={report.salesTotalPcs} />}
          >
            {report.salesByCustomer.length === 0 ? (
              <Empty>No sales recorded.</Empty>
            ) : (
              <div className="space-y-3">
                {report.salesByCustomer.map((c) => (
                  <div key={c.customer}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {c.customer}
                      </span>
                      <span className="shrink-0 text-sm font-medium tabular-nums">
                        <AmountKgPcs kg={c.totalKg} pcs={c.totalPcs} />
                      </span>
                    </div>
                    <div className="mt-0.5 pl-3">
                      {c.lines.map((l) => (
                        <Row
                          key={l.label}
                          label={l.label}
                          value={<AmountKgPcs kg={l.kg} pcs={l.pcs} />}
                          muted
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Recycling — Granules" total={`${formatQty(report.recyclingOutputKg)} kg`}>
            {report.recyclingEntryCount === 0 && (
              <Empty>No recycling recorded.</Empty>
            )}
          </Section>

          <Section title="Purchases">
            {report.rawPurchases.length === 0 && report.scrapPurchases.length === 0 ? (
              <Empty>No purchases recorded.</Empty>
            ) : (
              <div className="space-y-1">
                {report.rawPurchases.map((p, i) => (
                  <Row
                    key={`raw-${i}`}
                    label={p.detail ? `${p.label} · ${p.detail}` : p.label}
                    value={`${formatQty(p.quantity)} kg`}
                  />
                ))}
                {report.scrapPurchases.map((p, i) => (
                  <Row
                    key={`scrap-${i}`}
                    label={p.detail ? `Scrap · ${p.label} (${p.detail})` : `Scrap · ${p.label}`}
                    value={`${formatQty(p.quantity)} kg`}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section title="Factory Waste" total={`${formatQty(report.factoryWasteKg)} kg`}>
            {report.factoryWasteKg === 0 && <Empty>No factory waste recorded.</Empty>}
          </Section>
        </>
      )}
    </div>
  )
}
