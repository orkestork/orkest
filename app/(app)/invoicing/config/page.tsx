import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Field, input, PageHeader } from "@/components/ui";
import { num } from "@/lib/ui/format";
import { saveConfig } from "../actions";

export const metadata = { title: "Configuración contable" };
type TermLine = { percent: number; days: number };

export default async function InvoicingConfig() {
  const ctx = await requireModule("invoicing", "invoicing.write");
  const [taxes, terms, journals] = await Promise.all([ctx.db.tax.findMany({ orderBy: [{ scope: "asc" }, { rate: "desc" }] }), ctx.db.paymentTerm.findMany(), ctx.db.journal.findMany()]);
  return (
    <>
      <PageHeader title="Configuración contable" subtitle="Impuestos, plazos de pago y diarios de esta organización." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Impuestos">
          <ul className="mb-4 space-y-1 text-sm">{taxes.map((t) => <li key={t.id} className="flex justify-between"><span>{t.name}</span><Badge tone={t.scope === "SALE" ? "blue" : "amber"}>{num(t.rate)}% · {t.scope === "SALE" ? "venta" : "compra"}</Badge></li>)}</ul>
          <ActionForm action={saveConfig} className="space-y-2 border-t border-slate-100 pt-3">
            <input type="hidden" name="kind" value="tax" />
            <Field label="Nombre"><input name="name" required className={input} /></Field>
            <div className="grid grid-cols-2 gap-2"><Field label="Tasa %"><input name="rate" type="number" step="any" min="0" required className={input} /></Field>
              <Field label="Uso"><select name="scope" className={input}><option value="SALE">Venta</option><option value="PURCHASE">Compra</option></select></Field></div>
            <SubmitButton className={btn.small}>Agregar</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="Plazos de pago">
          <ul className="mb-4 space-y-1 text-sm">{terms.map((t) => <li key={t.id}><b>{t.name}</b> <span className="text-xs text-slate-500">{(t.lines as TermLine[]).map((l) => `${l.percent}% a ${l.days} d`).join(" + ")}</span></li>)}</ul>
          <ActionForm action={saveConfig} className="space-y-2 border-t border-slate-100 pt-3">
            <input type="hidden" name="kind" value="term" />
            <Field label="Nombre"><input name="name" required className={input} placeholder="50% anticipo, saldo 30 días" /></Field>
            <Field label="Cuotas" hint="porcentaje@días separados por coma"><input name="lines" required className={input} placeholder="50@0, 50@30" /></Field>
            <SubmitButton className={btn.small}>Agregar</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="Diarios">
          <ul className="mb-4 space-y-1 text-sm">{journals.map((j) => <li key={j.id} className="flex justify-between"><span>{j.code} · {j.name}</span><Badge>{j.type}</Badge></li>)}</ul>
          <ActionForm action={saveConfig} className="space-y-2 border-t border-slate-100 pt-3">
            <input type="hidden" name="kind" value="journal" />
            <div className="grid grid-cols-2 gap-2"><Field label="Código"><input name="code" required maxLength={5} className={input} /></Field>
              <Field label="Tipo"><select name="type" className={input}><option value="BANK">Banco</option><option value="CASH">Efectivo</option><option value="GENERAL">General</option></select></Field></div>
            <Field label="Nombre"><input name="name" required className={input} placeholder="Bancolombia" /></Field>
            <SubmitButton className={btn.small}>Agregar</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
