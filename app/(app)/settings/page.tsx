import { requirePermission } from "@/lib/core/context";
import { radarSettings } from "@/lib/radar/engine";
import { prisma } from "@/lib/core/prisma";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { btn, Card, Field, input, PageHeader } from "@/components/ui";
import { saveCompany } from "./actions";

export const metadata = { title: "Empresa" };

export default async function CompanySettings() {
  const ctx = await requirePermission("org.settings.manage");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.orgId } });
  const radar = await radarSettings(ctx.orgId);
  return (
    <>
      <PageHeader title="Empresa y branding" subtitle="Afecta solo a esta organización." />
      <ActionForm action={saveCompany} className="grid max-w-4xl gap-6">
        <Card title="Datos de la empresa">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre"><input name="name" defaultValue={org.name} className={input} /></Field>
            <Field label="Razón social"><input name="legalName" defaultValue={org.legalName ?? ""} className={input} /></Field>
            <Field label="NIT"><input name="taxId" defaultValue={org.taxId ?? ""} className={input} /></Field>
            <Field label="Moneda"><select name="currency" defaultValue={org.currency} className={input}>{["COP", "USD", "EUR", "MXN", "PEN", "CLP"].map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Zona horaria"><input name="timezone" defaultValue={org.timezone} className={input} /></Field>
          </div>
        </Card>
        <Card title="Branding">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Nombre visible"><input name="displayName" defaultValue={ctx.org.branding.displayName ?? ""} className={input} /></Field>
            <Field label="Color de la organización"><input name="primaryColor" type="color" defaultValue={ctx.org.branding.primaryColor ?? "#6f35b5"} className="h-10 w-full rounded-lg border border-slate-300" /></Field>
            <Field label="URL del logo"><input name="logoUrl" defaultValue={ctx.org.branding.logoUrl ?? ""} className={input} /></Field>
          </div>
        </Card>
        {ctx.hasModule("radar") && (
          <Card title="Umbrales de Radar">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Días sin actividad (oportunidades)"><input name="staleOpportunityDays" type="number" min="1" defaultValue={radar.staleOpportunityDays} className={input} /></Field>
              <Field label="Días máx. de aprobación pendiente"><input name="approvalPendingDays" type="number" min="1" defaultValue={radar.approvalPendingDays} className={input} /></Field>
              <Field label="No conformidades para alertar proveedor"><input name="repeatedNcThreshold" type="number" min="1" defaultValue={radar.repeatedNcThreshold} className={input} /></Field>
            </div>
          </Card>
        )}
        <div><SubmitButton className={btn.primary}>Guardar</SubmitButton></div>
      </ActionForm>
    </>
  );
}
