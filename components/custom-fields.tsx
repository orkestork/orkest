import { input, Field } from "./ui";
import { fieldOptions, formatFieldValue, relationTarget, type FieldDef } from "@/lib/core/custom-fields";

type Relations = Record<string, { id: string; name: string }[]>;

/** Renderiza inputs para los campos personalizados configurados en Studio. */
export function CustomFieldInputs({ defs, values = {}, users = [], relations = {}, legend = "Campos personalizados", wide = false }: {
  defs: (FieldDef & { id: string })[]; values?: Record<string, unknown>; users?: { id: string; name: string }[]; relations?: Relations; legend?: string | null;
  /** Tres columnas en pantallas grandes (formularios a todo el ancho) */
  wide?: boolean;
}) {
  if (defs.length === 0) return null;
  return (
    <fieldset className={`grid gap-4 sm:grid-cols-2 ${wide ? "lg:grid-cols-3" : ""}`}>
      {legend && <legend className="col-span-full mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{legend}</legend>}
      {defs.map((d) => {
        const name = `cf_${d.key}`;
        const v = values[d.key];
        const label = `${d.label}${d.required ? " *" : ""}`;
        const opts = fieldOptions(d);
        let control;
        switch (d.type) {
          case "textarea": control = <textarea name={name} defaultValue={String(v ?? "")} rows={3} className={input} />; break;
          case "number": case "currency": control = <input name={name} type="number" step="any" defaultValue={v as number ?? ""} className={input} />; break;
          case "date": control = <input name={name} type="date" defaultValue={String(v ?? "")} className={input} />; break;
          case "datetime": control = <input name={name} type="datetime-local" defaultValue={v ? String(v).slice(0, 16) : ""} className={input} />; break;
          case "boolean": control = <input name={name} type="checkbox" defaultChecked={!!v} className="h-4 w-4 accent-[var(--brand)]" />; break;
          case "select":
            control = (
              <select name={name} defaultValue={String(v ?? "")} className={input}>
                <option value="">—</option>
                {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            );
            break;
          case "multiselect":
            control = (
              <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-slate-200 px-3 py-2">
                {opts.map((o) => (
                  <label key={o.value} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" name={name} value={o.value} defaultChecked={Array.isArray(v) && v.includes(o.value)} className="accent-[var(--brand)]" />
                    {o.label}
                  </label>
                ))}
              </div>
            );
            break;
          case "relation": {
            const choices = relations[relationTarget(d) ?? ""] ?? [];
            control = (
              <select name={name} defaultValue={String(v ?? "")} className={input}>
                <option value="">—</option>
                {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            );
            break;
          }
          case "user":
            control = (
              <select name={name} defaultValue={String(v ?? "")} className={input}>
                <option value="">—</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            );
            break;
          default:
            control = <input name={name} type={d.type === "email" ? "email" : d.type === "url" ? "url" : d.type === "phone" ? "tel" : "text"} defaultValue={String(v ?? "")} className={input} />;
        }
        return <Field key={d.id} label={label} hint={d.helpText ?? undefined}>{control}</Field>;
      })}
    </fieldset>
  );
}

export function CustomFieldValues({ defs, values, users, relations }: {
  defs: (FieldDef & { id: string })[]; values: Record<string, unknown>; users?: Map<string, string>; relations?: Relations;
}) {
  if (defs.length === 0) return null;
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {defs.map((d) => (
        <div key={d.id}>
          <dt className="text-xs text-slate-500">{d.label}</dt>
          <dd className="whitespace-pre-wrap text-sm text-slate-800">{formatFieldValue(d, values?.[d.key], users, relations)}</dd>
        </div>
      ))}
    </dl>
  );
}
