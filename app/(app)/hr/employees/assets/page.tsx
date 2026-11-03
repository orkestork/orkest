import NextLink from "next/link";
import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { ASSET_STATUS, ASSET_TYPE, opts } from "@/lib/ui/hr-labels";
import { closeAsset, saveAsset } from "../../actions";
import { dday, Pill, Select } from "../../_ui";
import { EmployeeTabs } from "../_tabs";

export const metadata = { title: "Dotación" };

export default async function Assets({ searchParams }: PageProps<"/hr/employees/assets">) {
  const ctx = await requireModule("hr", "hr.employees.read");
  const sp = await searchParams;
  const type = String(sp.type ?? "");
  const status = String(sp.status ?? "ENTREGADO");
  const [assets, byType, employees] = await Promise.all([
    ctx.db.employeeAsset.findMany({ where: { ...(type ? { type } : {}), ...(status ? { status } : {}) }, include: { employee: { select: { id: true, name: true } } }, orderBy: { deliveredAt: "desc" }, take: 500 }),
    ctx.db.employeeAsset.groupBy({ by: ["type"], where: { status: "ENTREGADO" }, _count: { _all: true } }),
    ctx.db.employee.findMany({ where: { status: { not: "TERMINATED" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const canWrite = ctx.can("hr.employees.write");
  return (
    <>
      <PageHeader title="Dotación" subtitle="Equipos, uniformes, EPP y herramientas entregados a cada colaborador." />
      <EmployeeTabs active="/hr/employees/assets" />
      <div className="mb-4 flex flex-wrap gap-2">
        <NextLink href={`?status=${status}`} className={`${btn.small} ${!type ? "border-[var(--ork-violet)] text-[var(--ork-violet)]" : ""}`}>Todos</NextLink>
        {byType.map((t) => (
          <NextLink key={t.type} href={`?type=${t.type}&status=${status}`} className={`${btn.small} ${type === t.type ? "border-[var(--ork-violet)] text-[var(--ork-violet)]" : ""}`}>
            {ASSET_TYPE[t.type]} · {t._count._all}
          </NextLink>
        ))}
        <form className="ml-auto flex gap-2">
          {type && <input type="hidden" name="type" value={type} />}
          <Select name="status" defaultValue={status} empty="Todos los estados" options={Object.entries(ASSET_STATUS).map(([value, v]) => ({ value, label: v.label }))} className="py-1 text-xs" />
          <button className={btn.small}>Ver</button>
        </form>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={["Colaborador", "Elemento", "Entrega", "Devolución", "Estado", ""]} empty={assets.length === 0}>
            {assets.map((a) => (
              <tr key={a.id}>
                <td className={td}><NextLink href={`/hr/employees/${a.employee.id}?tab=dotacion`} className="hover:underline">{a.employee.name}</NextLink></td>
                <td className={td}>{a.name}<div className="text-xs text-slate-500">{ASSET_TYPE[a.type]}{a.serial ? ` · ${a.serial}` : ""}</div></td>
                <td className={td}>{dday(a.deliveredAt)}</td>
                <td className={td}>{dday(a.returnedAt)}</td>
                <td className={td}><Pill map={ASSET_STATUS} value={a.status} /></td>
                <td className={td}>
                  {canWrite && a.status === "ENTREGADO" && (
                    <ActionForm action={closeAsset} className="flex gap-1">
                      <input type="hidden" name="id" value={a.id} />
                      <select name="status" className="rounded-md border border-slate-300 px-1 py-0.5 text-xs">
                        <option value="DEVUELTO">Devuelto</option><option value="DANADO">Dañado</option><option value="PERDIDO">Perdido</option>
                      </select>
                      <SubmitButton className={btn.small} pendingText="…">Cerrar</SubmitButton>
                    </ActionForm>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
        {canWrite && (
          <Card title="Registrar entrega">
            <ActionForm action={saveAsset} className="space-y-3">
              <Field label="Colaborador *"><Select name="employeeId" required empty="Selecciona…" options={employees.map((e) => ({ value: e.id, label: e.name }))} /></Field>
              <Field label="Elemento *"><input name="name" required className={input} placeholder="Ej. Portátil Lenovo T14" /></Field>
              <Field label="Tipo"><Select name="type" options={opts(ASSET_TYPE)} /></Field>
              <Field label="Serial / placa"><input name="serial" className={input} /></Field>
              <Field label="Fecha de entrega"><input type="date" name="deliveredAt" className={input} /></Field>
              <Field label="Notas"><textarea name="notes" rows={2} className={input} /></Field>
              <SubmitButton className={btn.primary}>Registrar</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
