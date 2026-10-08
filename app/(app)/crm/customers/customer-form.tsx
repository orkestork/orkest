import { ActionForm, SubmitButton } from "@/components/action-form";
import { CustomFieldInputs } from "@/components/custom-fields";
import { btn, Card, Field, input } from "@/components/ui";
import { saveCustomer } from "../actions";
import type { FieldDef } from "@/lib/core/custom-fields";

type Customer = { id: string; name: string; taxId: string | null; email: string | null; phone: string | null; city: string | null; ownerId: string | null; pricelistId: string | null; paymentTermId: string | null; customFields: unknown };
type Opt = { id: string; name: string };

export function CustomerForm({ customer, defs, users, pricelists = [], terms = [] }: { customer?: Customer; defs: (FieldDef & { id: string })[]; users: Opt[]; pricelists?: Opt[]; terms?: Opt[] }) {
  return (
    <Card>
      <ActionForm action={saveCustomer} className="space-y-6">
        {customer && <input type="hidden" name="id" value={customer.id} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre / Razón social *"><input name="name" required defaultValue={customer?.name} className={input} /></Field>
          <Field label="NIT / Documento"><input name="taxId" defaultValue={customer?.taxId ?? ""} className={input} /></Field>
          <Field label="Email"><input name="email" type="email" defaultValue={customer?.email ?? ""} className={input} /></Field>
          <Field label="Teléfono"><input name="phone" defaultValue={customer?.phone ?? ""} className={input} /></Field>
          <Field label="Ciudad"><input name="city" defaultValue={customer?.city ?? ""} className={input} /></Field>
          <Field label="Responsable">
            <select name="ownerId" defaultValue={customer?.ownerId ?? ""} className={input}>
              <option value="">—</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          {pricelists.length > 0 && <Field label="Lista de precios"><select name="pricelistId" defaultValue={customer?.pricelistId ?? ""} className={input}><option value="">Precio base</option>{pricelists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
          {terms.length > 0 && <Field label="Plazo de pago"><select name="paymentTermId" defaultValue={customer?.paymentTermId ?? ""} className={input}><option value="">—</option>{terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>}
        </div>
        <CustomFieldInputs defs={defs} values={(customer?.customFields ?? {}) as Record<string, unknown>} users={users} />
        <div className="flex justify-end"><SubmitButton className={btn.primary}>Guardar</SubmitButton></div>
      </ActionForm>
    </Card>
  );
}
