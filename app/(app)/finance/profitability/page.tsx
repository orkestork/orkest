import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { Card, PageHeader, Stat, Table, td } from "@/components/ui";
import { money } from "@/lib/ui/format";
import { loadFinance, monthLabel } from "@/lib/apps/finance";
import { MonthNav, monthParam, tone } from "../shared";

export const metadata = { title: "Rentabilidad · Finanzas" };

export default async function Profitability({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const ctx = await requireModule("finance", "finance.read");
  const ym = await monthParam(searchParams);
  const f = await loadFinance(ctx, ym);
  const cur = ctx.org.currency;
  const rows = f.profitability;
  const revenue = rows.reduce((a, r) => a + r.revenue, 0);
  const direct = rows.reduce((a, r) => a + r.direct, 0);
  const top = rows[0];

  return (
    <>
      <PageHeader
        title="Rentabilidad por cliente"
        subtitle={`Últimos 12 meses (${monthLabel(f.months[0], { month: "short", year: "numeric" })} – ${monthLabel(ym, { month: "short", year: "numeric" })}). Facturado sin IVA y otros ingresos, menos los gastos cargados a cada cliente.`}
        actions={<MonthNav ym={ym} path="/finance/profitability" />}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ingresos con cliente" value={money(revenue, cur)} hint={`${rows.length} clientes`} />
        <Stat label="Gastos directos" value={money(direct, cur)} hint="Cargados a un cliente en Gastos" />
        <Stat label="Margen directo" value={<span className={tone(revenue - direct)}>{money(revenue - direct, cur)}</span>} />
        <Stat label="Cliente principal" value={top ? <span className="text-base">{top.name}</span> : "—"} hint={top && revenue ? `${Math.round((top.revenue / revenue) * 100)} % de los ingresos` : undefined} />
      </div>
      <Card padded={false}>
        <Table head={["Cliente", "Facturas", "Facturado", "Otros ingresos", "Gastos directos", "Margen", "% del total"]} empty={rows.length === 0}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className={td}><Link href={`/crm/customers/${r.id}`} className="font-medium hover:underline">{r.name || "Cliente"}</Link></td>
              <td className={`${td} text-right tabular-nums`}>{r.invoices}</td>
              <td className={`${td} text-right font-mono tabular-nums`}>{money(r.invoiced, cur)}</td>
              <td className={`${td} text-right font-mono tabular-nums text-slate-500`}>{money(r.other, cur)}</td>
              <td className={`${td} text-right font-mono tabular-nums text-slate-500`}>{money(r.direct, cur)}</td>
              <td className={`${td} text-right font-mono tabular-nums ${tone(r.margin)}`}>
                {money(r.margin, cur)}
                {r.revenue > 0 && <p className="text-xs">{Math.round((r.margin / r.revenue) * 100)} %</p>}
              </td>
              <td className={`${td} w-40`}>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[var(--ork-violet)]" style={{ width: `${revenue ? Math.max(0, (r.revenue / revenue) * 100) : 0}%` }} /></div>
                  <span className="w-9 text-right text-xs tabular-nums text-slate-500">{revenue ? Math.round((r.revenue / revenue) * 100) : 0}%</span>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
