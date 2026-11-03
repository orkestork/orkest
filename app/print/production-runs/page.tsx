import { requireModule } from "@/lib/core/context";
import { orgPeople } from "@/lib/core/members";
import { goodPieces, qualityPct, runEfficiency } from "@/lib/apps/plant";
import { dayEnd, dayStart, hhmm, todayKey } from "@/lib/apps/ops-shared";
import { date, num } from "@/lib/ui/format";
import { PrintButton } from "./print-button";

export const metadata = { title: "Planilla de inyección" };

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 10) / 10} %`);

/** Planilla diaria de inyección para imprimir o guardar como PDF desde el navegador. */
export default async function PrintRuns({ searchParams }: PageProps<"/print/production-runs">) {
  const ctx = await requireModule("manufacturing", "manufacturing.read");
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const from = str("from") || todayKey();
  const to = str("to") || from;
  const [runs, machines, products, people] = await Promise.all([
    ctx.db.productionRun.findMany({
      where: { productionDate: { gte: dayStart(from), lte: dayEnd(to) }, ...(str("machine") ? { workCenterId: str("machine") } : {}), ...(str("operator") ? { operatorId: str("operator") } : {}) },
      orderBy: [{ productionDate: "asc" }, { workCenterId: "asc" }, { startTime: "asc" }],
    }),
    ctx.db.workCenter.findMany({ select: { id: true, code: true, name: true } }),
    ctx.db.product.findMany({ select: { id: true, name: true } }),
    orgPeople(ctx),
  ]);
  const m = new Map(machines.map((x) => [x.id, x]));
  const p = new Map(products.map((x) => [x.id, x.name]));
  const who = new Map(people.map((x) => [x.id, x.name]));
  const th = "border border-stone-400 px-1.5 py-1 text-left font-semibold";
  const tc = "border border-stone-300 px-1.5 py-1 align-top";
  return (
    <main className="mx-auto max-w-[1200px] bg-white p-6 text-[11px] text-stone-900 print:p-0">
      <header className="mb-4 flex items-end justify-between border-b-2 border-[#32125e] pb-2">
        <div>
          <p className="text-xs uppercase tracking-widest text-stone-500">{ctx.org.name}</p>
          <h1 className="font-display text-3xl uppercase leading-none">Planilla diaria de inyección</h1>
          <p className="mt-1 text-xs">Periodo {date(`${from}T12:00:00Z`)} — {date(`${to}T12:00:00Z`)} · {runs.length} corridas</p>
        </div>
        <PrintButton />
      </header>
      <table className="w-full border-collapse">
        <thead className="bg-stone-100">
          <tr>{["Fecha", "Máquina", "OP", "Producto", "Operario", "Horario", "Material / pigmento", "Peso iny. / pieza", "Ciclo · cav.", "Temp.", "Prod.", "Dañ.", "NC", "Buenas", "Calidad", "Efic.", "Observaciones"].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const zones = (r.temperatureZones as { label: string; value: number }[]) ?? [];
            return (
              <tr key={r.id} className="break-inside-avoid">
                <td className={tc}>{date(r.productionDate)}</td>
                <td className={tc}>{m.get(r.workCenterId)?.code}</td>
                <td className={tc}>{r.orderNumber}</td>
                <td className={tc}>{r.productId ? p.get(r.productId) : r.manualProductName}</td>
                <td className={tc}>{who.get(r.operatorId)}</td>
                <td className={tc}>{hhmm(r.startTime)}–{hhmm(r.endTime)}{r.downtimeMinutes ? ` (${r.downtimeMinutes}′ det.)` : ""}</td>
                <td className={tc}>{r.material}{r.materialQuantityKg ? ` · ${r.materialQuantityKg} kg` : ""}{r.pigment ? ` / ${r.pigment}` : ""}{r.pigmentColor ? ` ${r.pigmentColor}` : ""}</td>
                <td className={tc}>{r.injectionWeight} / {r.pieceWeight} g</td>
                <td className={tc}>{r.cycle} {r.cycleUnit === "minutes" ? "min" : "s"} · {r.cavities}</td>
                <td className={tc}>{zones.length ? zones.map((z) => `${z.label} ${z.value}`).join(" ") : `${r.temperature} °C`}</td>
                <td className={`${tc} text-right`}>{num(r.produced)}</td>
                <td className={`${tc} text-right`}>{r.damaged}</td>
                <td className={`${tc} text-right`}>{r.nonConforming}</td>
                <td className={`${tc} text-right`}>{num(goodPieces(r))}</td>
                <td className={`${tc} text-right`}>{pct(qualityPct(r))}</td>
                <td className={`${tc} text-right`}>{pct(runEfficiency(r).efficiency)}</td>
                <td className={tc}>{[r.couplingTest && `Acople: ${r.couplingTest}${r.couplingStatus === "na" ? " (N/A)" : ""}`, r.observations].filter(Boolean).join(" · ")}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td className={tc} colSpan={10}>Totales</td>
            <td className={`${tc} text-right`}>{num(runs.reduce((s, r) => s + r.produced, 0))}</td>
            <td className={`${tc} text-right`}>{runs.reduce((s, r) => s + r.damaged, 0)}</td>
            <td className={`${tc} text-right`}>{runs.reduce((s, r) => s + r.nonConforming, 0)}</td>
            <td className={`${tc} text-right`}>{num(runs.reduce((s, r) => s + goodPieces(r), 0))}</td>
            <td className={tc} colSpan={3} />
          </tr>
        </tfoot>
      </table>
      <footer className="mt-10 grid grid-cols-2 gap-16 text-xs">
        <div className="border-t border-stone-500 pt-1">Jefe de producción</div>
        <div className="border-t border-stone-500 pt-1">Control de calidad</div>
      </footer>
    </main>
  );
}
