import type { OrgContext } from "@/lib/core/context";
import { fileUrl } from "@/lib/core/files";
import { money } from "@/lib/ui/format";
import { CONTRACT_TYPE } from "@/lib/ui/hr-labels";
import { PrintButton } from "./_print";
import { dday } from "./_ui";

type Org = OrgContext["org"] & { legalName?: string | null; taxId?: string | null };

/** Documento imprimible con encabezado de la empresa. */
function Sheet({ org, title, children }: { org: Org; title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex justify-end print:hidden"><PrintButton /></div>
      <article className="rounded-2xl border border-[var(--ork-rule)] bg-white p-8 shadow-sm print:border-0 print:p-0 print:shadow-none sm:p-12">
        <header className="mb-8 flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            {org.branding.logoUrl ? <img src={org.branding.logoUrl} alt="" className="mb-2 h-10" /> : null}
            <p className="font-semibold text-[var(--ork-ink)]">{org.legalName ?? org.name}</p>
            {org.taxId && <p className="text-xs text-slate-500">NIT {org.taxId}</p>}
          </div>
          <p className="text-right font-display text-xl uppercase tracking-tight text-[var(--ork-ink)]">{title}</p>
        </header>
        {children}
      </article>
    </div>
  );
}

export function PayslipDoc({ org, p }: {
  org: Org;
  p: { period: string; grossAmount: unknown; deductions: unknown; netAmount: unknown; paymentDueDate: Date | null; isPaid: boolean; paidAt: Date | null;
    epsAmount: unknown; arlAmount: unknown; pensionAmount: unknown; fileId: string | null;
    employee: { name: string; documentNumber: string | null; position: string | null; department: { name: string } | null } };
}) {
  const row = (label: string, v: unknown, strong = false) => (
    <div className={`flex justify-between border-b border-slate-100 py-2 text-sm ${strong ? "font-semibold" : ""}`}><span>{label}</span><span className="tabular-nums">{money(v)}</span></div>
  );
  return (
    <Sheet org={org} title="Desprendible de nómina">
      <dl className="mb-6 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-slate-500">Colaborador</dt><dd className="font-medium">{p.employee.name}</dd></div>
        <div><dt className="text-xs text-slate-500">Documento</dt><dd>{p.employee.documentNumber ?? "—"}</dd></div>
        <div><dt className="text-xs text-slate-500">Cargo</dt><dd>{p.employee.position ?? "—"}{p.employee.department ? ` · ${p.employee.department.name}` : ""}</dd></div>
        <div><dt className="text-xs text-slate-500">Periodo</dt><dd className="font-medium">{p.period}</dd></div>
      </dl>
      {row("Total devengado", p.grossAmount)}
      {p.epsAmount != null && row("Aporte salud (EPS)", p.epsAmount)}
      {p.pensionAmount != null && row("Aporte pensión", p.pensionAmount)}
      {p.arlAmount != null && row("ARL", p.arlAmount)}
      {row("Total deducciones", p.deductions)}
      <div className="mt-2 flex justify-between rounded-xl bg-[var(--ork-paper,#f6f2ea)] px-4 py-3 text-lg font-semibold"><span>Neto a pagar</span><span className="tabular-nums">{money(p.netAmount)}</span></div>
      <p className="mt-4 text-xs text-slate-500">
        {p.isPaid ? `Pagado el ${p.paidAt ? new Date(p.paidAt).toLocaleDateString("es-CO") : "—"}` : p.paymentDueDate ? `Fecha de pago programada: ${dday(p.paymentDueDate)}` : "Pago pendiente de programar"}
        {p.fileId && <> · <a href={fileUrl(p.fileId)} target="_blank" className="text-[var(--ork-violet)] underline print:hidden">Desprendible original (PDF)</a></>}
      </p>
    </Sheet>
  );
}

export function CertificateDoc({ org, c, signer }: {
  org: Org; signer: string;
  c: { includeSalary: boolean; addressee: string | null; updatedAt: Date;
    employee: { name: string; documentNumber: string | null; position: string | null; contractType: string; hireDate: Date | null; terminationDate: Date | null; status: string;
      salaryAmount: unknown; department: { name: string } | null } };
}) {
  const e = c.employee;
  const active = e.status !== "TERMINATED";
  return (
    <Sheet org={org} title="Certificado laboral">
      <p className="mb-6 text-sm">{c.addressee || "A quien interese"}</p>
      <p className="mb-4 text-sm leading-7">
        <strong>{org.legalName ?? org.name}</strong>{org.taxId ? `, identificada con NIT ${org.taxId},` : ""} certifica que <strong>{e.name}</strong>
        {e.documentNumber ? <>, identificado(a) con documento No. <strong>{e.documentNumber}</strong>,</> : ""} {active ? "labora" : "laboró"} en la empresa
        desde el {dday(e.hireDate, { day: "numeric", month: "long", year: "numeric" })}{!active && e.terminationDate ? ` hasta el ${dday(e.terminationDate, { day: "numeric", month: "long", year: "numeric" })}` : ""},
        con contrato a {CONTRACT_TYPE[e.contractType]?.toLowerCase() ?? e.contractType}, desempeñando el cargo de <strong>{e.position ?? "—"}</strong>
        {e.department ? <> en el área de <strong>{e.department.name}</strong></> : ""}
        {c.includeSalary && e.salaryAmount != null ? <>, con una asignación salarial mensual de <strong>{money(e.salaryAmount)}</strong></> : ""}.
      </p>
      <p className="mb-12 text-sm leading-7">Se expide a solicitud del interesado el {new Date(c.updatedAt).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}.</p>
      <div className="w-64 border-t border-slate-400 pt-2 text-sm"><p className="font-medium">{signer}</p><p className="text-xs text-slate-500">Talento humano · {org.legalName ?? org.name}</p></div>
    </Sheet>
  );
}
