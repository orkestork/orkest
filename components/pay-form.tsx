import { ActionForm, SubmitButton } from "./action-form";
import { payAction } from "@/app/(app)/invoicing/actions";
import { btn } from "./ui";

/** Formulario compacto de pago con diario (cobro de factura o pago a proveedor). */
export function PayForm({ invoiceId, billId, balance, journals }: { invoiceId?: string; billId?: string; balance: number; journals: { id: string; name: string }[] }) {
  return (
    <ActionForm action={payAction} className="flex flex-wrap items-center gap-1">
      {invoiceId && <input type="hidden" name="invoiceId" value={invoiceId} />}
      {billId && <input type="hidden" name="billId" value={billId} />}
      <input name="amount" type="number" min="1" step="any" defaultValue={balance} className="w-32 rounded-full border border-slate-300 px-3 py-1 text-xs" aria-label="Valor" />
      <select name="journalId" className="rounded-full border border-slate-300 px-2 py-1 text-xs" aria-label="Diario">{journals.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}</select>
      <SubmitButton className={btn.small} pendingText="…">{billId ? "Pagar" : "Registrar pago"}</SubmitButton>
    </ActionForm>
  );
}
