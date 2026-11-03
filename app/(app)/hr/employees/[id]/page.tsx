import NextLink from "next/link";
import { notFound } from "next/navigation";
import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { calcVacationBalance } from "@/lib/apps/hr";
import { fileUrl } from "@/lib/core/files";
import { money, dateTime } from "@/lib/ui/format";
import {
  ASSET_STATUS, ASSET_TYPE, CONTRACT_TYPE, DOCUMENT_CATEGORY, EMPLOYEE_STATUS, NOTE_TYPE, PERMIT_SUBTYPE, REQUEST_STATUS, SALARY_PERIOD, TIME_OFF_TYPE, opts, optsT,
} from "@/lib/ui/hr-labels";
import { addEmployeeNote, saveAsset, uploadEmployeeDocument } from "../../actions";
import { dday, Kpi, Pill, Select, Tabs } from "../../_ui";
import { EmployeeForm } from "../_form";
import { formOptions } from "../_data";
import { TimeOffForm } from "../../time-off/_form";

export default async function EmployeeDetail({ params, searchParams }: PageProps<"/hr/employees/[id]">) {
  const ctx = await requireModule("hr", "hr.employees.read");
  const { id } = await params;
  const sp = await searchParams;
  const tab = String(sp.tab ?? "ficha");
  const e = await ctx.db.employee.findFirst({
    where: { id },
    include: {
      department: true, manager: { select: { id: true, name: true } }, directReports: { select: { id: true, name: true, position: true }, orderBy: { name: "asc" } },
      timeOffRequests: { orderBy: { startDate: "desc" } },
    },
  });
  if (!e) notFound();
  const canWrite = ctx.can("hr.employees.write");
  const canPayroll = ctx.can("hr.payroll.read") && !ctx.restricted("deny:costs");
  const bal = calcVacationBalance(e.hireDate, e.timeOffRequests);
  const base = `/hr/employees/${id}`;
  const user = e.userId ? await ctx.db.membership.findFirst({ where: { userId: e.userId }, include: { user: { select: { email: true } }, role: { select: { name: true } } } }) : null;

  return (
    <>
      <PageHeader title={e.name} crumbs={[{ label: "Talento humano", href: "/hr" }, { label: "Colaboradores", href: "/hr/employees" }, { label: e.name }]}
        subtitle={<span className="flex flex-wrap items-center gap-2">{e.position ?? "Sin cargo"} · {e.department?.name ?? "Sin departamento"} <Pill map={EMPLOYEE_STATUS} value={e.status} />
          {user ? <Badge tone="violet">Acceso: {user.user.email} · {user.role.name}</Badge> : <Badge>Sin acceso al portal</Badge>}</span>} />
      {sp.created === "account" && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Colaborador vinculado con acceso al portal. Su contraseña inicial es su número de documento; pídele cambiarla al ingresar.
        </div>
      )}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Vacaciones disponibles" value={bal.diasDisponibles} hint={`${bal.diasCausados} causados · ${bal.diasTomados} tomados`} />
        <Kpi label="Días pendientes de aprobar" value={bal.diasPendientes} />
        <Kpi label="Antigüedad" value={`${(bal.diasTrabajados / 365).toFixed(1)} años`} hint={`Desde ${dday(e.hireDate)}`} />
        <Kpi label="Contrato" value={<span className="text-base">{CONTRACT_TYPE[e.contractType]}</span>}
          hint={canPayroll && e.salaryAmount != null ? `${money(e.salaryAmount)} · ${SALARY_PERIOD[e.salaryPeriod]}` : e.site ?? undefined} />
      </div>
      <Tabs active={`${base}?tab=${tab}`} items={[
        { label: "Ficha", href: `${base}?tab=ficha` }, { label: "Ausencias", href: `${base}?tab=ausencias` }, { label: "Bitácora", href: `${base}?tab=notas` },
        { label: "Dotación", href: `${base}?tab=dotacion` }, { label: "Documentos", href: `${base}?tab=documentos` },
        ...(canPayroll ? [{ label: "Nómina", href: `${base}?tab=nomina` }] : []),
      ]} />
      {tab === "ficha" && <Ficha />}
      {tab === "ausencias" && <Ausencias />}
      {tab === "notas" && <Notas />}
      {tab === "dotacion" && <Dotacion />}
      {tab === "documentos" && <Documentos />}
      {tab === "nomina" && canPayroll && <Nomina />}
    </>
  );

  async function Ficha() {
    if (canWrite) {
      const o = await formOptions(ctx, e!.userId);
      return (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2"><EmployeeForm employee={e!} {...o} canSalary={ctx.can("hr.payroll.write")} /></Card>
          <Team />
        </div>
      );
    }
    const rows: [string, string][] = [["Documento", e!.documentNumber ?? "—"], ["Correo", e!.email ?? "—"], ["Teléfono", e!.phone ?? "—"], ["Jefe inmediato", e!.manager?.name ?? "—"],
      ["Sede", e!.site ?? "—"], ["EPS", e!.eps ?? "—"], ["AFP", e!.afp ?? "—"], ["ARL", e!.arl ?? "—"]];
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2"><dl className="grid gap-3 sm:grid-cols-2">{rows.map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="text-sm">{v}</dd></div>)}</dl></Card>
        <Team />
      </div>
    );
  }

  function Team() {
    return (
      <Card title="Organigrama">
        <p className="text-xs text-slate-500">Reporta a</p>
        <p className="mb-3 text-sm">{e!.manager ? <Link href={`/hr/employees/${e!.manager.id}`} className="hover:underline">{e!.manager.name}</Link> : "—"}</p>
        <p className="text-xs text-slate-500">Equipo a cargo ({e!.directReports.length})</p>
        <ul className="mt-1 space-y-1 text-sm">{e!.directReports.map((r) => <li key={r.id}><Link href={`/hr/employees/${r.id}`} className="hover:underline">{r.name}</Link> <span className="text-xs text-slate-500">{r.position}</span></li>)}</ul>
      </Card>
    );
  }

  function Ausencias() {
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={["Tipo", "Desde", "Hasta", "Días", "Estado", "Nota"]} empty={e!.timeOffRequests.length === 0}>
            {e!.timeOffRequests.map((r) => (
              <tr key={r.id}>
                <td className={td}>{TIME_OFF_TYPE[r.type]}{r.subType && <div className="text-xs text-slate-500">{PERMIT_SUBTYPE[r.subType]}</div>}{r.incapacityNumber && <div className="font-mono text-xs text-slate-500">{r.incapacityNumber}</div>}</td>
                <td className={td}>{dday(r.startDate)}</td>
                <td className={td}>{dday(r.endDate)}</td>
                <td className={`${td} tabular-nums`}>{r.subType === "HORAS" ? `${r.hours} h` : r.durationDays}</td>
                <td className={td}><Pill map={REQUEST_STATUS} value={r.status} />{r.isPaid === false && <div className="text-xs text-slate-500">No remunerado</div>}</td>
                <td className={`${td} text-xs text-slate-500`}>{r.reviewNote ?? r.reason ?? ""}{r.fileId && <> · <a href={fileUrl(r.fileId)} target="_blank" className="text-[var(--ork-violet)] hover:underline">soporte</a></>}</td>
              </tr>
            ))}
          </Table>
        </Card>
        {ctx.can("hr.timeoff.write") && <Card title="Registrar ausencia"><TimeOffForm employeeId={e!.id} /></Card>}
      </div>
    );
  }

  async function Notas() {
    const notes = await ctx.db.employeeNote.findMany({ where: { employeeId: id }, orderBy: { createdAt: "desc" } });
    const authors = await ctx.db.membership.findMany({ where: { userId: { in: notes.map((n) => n.authorId) } }, include: { user: { select: { name: true } } } });
    const author = (uid: string) => authors.find((a) => a.userId === uid)?.user.name ?? "—";
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Bitácora del colaborador">
          {notes.length === 0 ? <p className="text-sm text-slate-400">Sin notas todavía.</p> : (
            <ul className="space-y-4">{notes.map((n) => (
              <li key={n.id} className="border-l-2 border-[var(--ork-rule)] pl-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500"><Pill map={NOTE_TYPE} value={n.type} /> {author(n.authorId)} · {dateTime(n.createdAt)}</div>
                <p className="mt-1 whitespace-pre-line text-sm">{n.note}</p>
              </li>
            ))}</ul>
          )}
        </Card>
        {canWrite && (
          <Card title="Nueva nota">
            <ActionForm action={addEmployeeNote} className="space-y-3">
              <input type="hidden" name="employeeId" value={id} />
              <Field label="Tipo"><Select name="type" options={optsT(NOTE_TYPE)} /></Field>
              <Field label="Nota *"><textarea name="note" rows={4} required className={input} /></Field>
              <SubmitButton className={btn.primary}>Guardar nota</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    );
  }

  async function Dotacion() {
    const assets = await ctx.db.employeeAsset.findMany({ where: { employeeId: id }, orderBy: { deliveredAt: "desc" } });
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={["Elemento", "Tipo", "Serial", "Entrega", "Estado"]} empty={assets.length === 0}>
            {assets.map((a) => (
              <tr key={a.id}><td className={td}>{a.name}</td><td className={td}>{ASSET_TYPE[a.type]}</td><td className={`${td} font-mono text-xs`}>{a.serial ?? "—"}</td>
                <td className={td}>{dday(a.deliveredAt)}</td><td className={td}><Pill map={ASSET_STATUS} value={a.status} /></td></tr>
            ))}
          </Table>
        </Card>
        {canWrite && (
          <Card title="Registrar entrega">
            <ActionForm action={saveAsset} className="space-y-3">
              <input type="hidden" name="employeeId" value={id} />
              <Field label="Elemento *"><input name="name" required className={input} /></Field>
              <Field label="Tipo"><Select name="type" options={opts(ASSET_TYPE)} /></Field>
              <Field label="Serial"><input name="serial" className={input} /></Field>
              <Field label="Fecha de entrega"><input type="date" name="deliveredAt" className={input} /></Field>
              <SubmitButton className={btn.primary}>Registrar</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    );
  }

  async function Documentos() {
    const docs = await ctx.db.employeeDocument.findMany({ where: { employeeId: id }, orderBy: { createdAt: "desc" } });
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={["Documento", "Categoría", "Vence", "Cargado"]} empty={docs.length === 0}>
            {docs.map((d) => (
              <tr key={d.id}><td className={td}><a href={fileUrl(d.fileId)} target="_blank" className="font-medium text-[var(--ork-violet)] hover:underline">{d.name}</a>{d.uploadedBySelf && <span className="ml-1 text-xs text-slate-400">(lo subió el colaborador)</span>}</td>
                <td className={td}>{DOCUMENT_CATEGORY[d.category]}</td><td className={td}>{dday(d.expiresAt)}</td><td className={td}>{dday(d.createdAt)}</td></tr>
            ))}
          </Table>
        </Card>
        {canWrite && (
          <Card title="Cargar documento">
            <ActionForm action={uploadEmployeeDocument} className="space-y-3">
              <input type="hidden" name="employeeId" value={id} />
              <Field label="Nombre"><input name="name" className={input} placeholder="Ej. Contrato 2026" /></Field>
              <Field label="Categoría"><Select name="category" options={opts(DOCUMENT_CATEGORY)} /></Field>
              <Field label="Vence"><input type="date" name="expiresAt" className={input} /></Field>
              <Field label="Archivo *"><input type="file" name="file" required className="text-sm" /></Field>
              <SubmitButton className={btn.primary}>Cargar</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    );
  }

  async function Nomina() {
    const slips = await ctx.db.payslip.findMany({ where: { employeeId: id }, orderBy: { createdAt: "desc" } });
    return (
      <Card padded={false} actions={<NextLink href="/hr/payroll" className={btn.small}>Ir a nómina</NextLink>} title="Desprendibles">
        <Table head={["Periodo", "Devengado", "Deducciones", "Neto", "Pago"]} empty={slips.length === 0}>
          {slips.map((p) => (
            <tr key={p.id}><td className={td}><NextLink href={`/hr/payroll/${p.id}`} className="font-medium hover:underline">{p.period}</NextLink></td>
              <td className={`${td} tabular-nums`}>{money(p.grossAmount)}</td><td className={`${td} tabular-nums`}>{money(p.deductions)}</td>
              <td className={`${td} font-medium tabular-nums`}>{money(p.netAmount)}</td><td className={td}>{p.isPaid ? <Badge tone="emerald">Pagado</Badge> : <Badge tone="amber">Por pagar</Badge>}</td></tr>
          ))}
        </Table>
      </Card>
    );
  }
}
