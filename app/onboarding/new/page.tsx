import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/core/context";
import { INDUSTRY_TEMPLATES } from "@/lib/templates/industries";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { btn, Field, input } from "@/components/ui";
import { logout } from "@/app/login/actions";
import { createOrganization } from "../actions";

export const metadata = { title: "Crear empresa" };

export default async function NewOrganization() {
  const s = await getSessionUser();
  if (!s) redirect("/login");
  return (
    <main className="min-h-screen bg-[var(--ork-paper-light)] px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <img src="/brand/ork-logo-violet.png" alt="OR-K" className="h-8 w-auto" />
          <div className="flex items-center gap-3 text-sm">
            {s.user.isPlatformAdmin && <Link href="/platform" className="text-[var(--ork-violet)] underline">Ir al panel OR-K</Link>}
            <form action={logout}><button className="text-stone-600 hover:underline">Cerrar sesión</button></form>
          </div>
        </div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">Paso 1 · Organización</p>
        <h1 className="mt-2 font-display text-5xl uppercase leading-none tracking-tight">Crea tu empresa</h1>
        <p className="mt-3 max-w-xl text-sm text-stone-600">Hola {s.user.name.split(" ")[0]}. Elige la plantilla más parecida a tu negocio: activa las apps, roles, flujos y almacén iniciales. Después todo se ajusta desde Studio.</p>
        <ActionForm action={createOrganization} className="mt-8 space-y-6 rounded-2xl border border-[var(--ork-rule)] bg-white p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre de la empresa *"><input name="name" required className={input} /></Field>
            <Field label="Razón social"><input name="legalName" className={input} /></Field>
            <Field label="NIT"><input name="taxId" className={input} /></Field>
            <Field label="Color de la marca"><input name="color" type="color" defaultValue="#6f35b5" className="h-10 w-full rounded-lg border border-stone-300" /></Field>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Plantilla de industria *</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {INDUSTRY_TEMPLATES.map((t, i) => (
                <label key={t.key} className={`flex cursor-pointer gap-3 rounded-xl border p-4 has-[:checked]:border-[var(--ork-violet)] has-[:checked]:bg-[var(--ork-lavender)]/15 ${t.status !== "available" ? "cursor-not-allowed opacity-50" : "border-stone-200"}`}>
                  <input type="radio" name="template" value={t.key} defaultChecked={i === 0} disabled={t.status !== "available"} className="mt-1 accent-[var(--ork-violet)]" />
                  <span><span className="block font-semibold">{t.name}{t.status !== "available" && " · próximamente"}</span><span className="block text-sm text-stone-600">{t.description}</span><span className="mt-1 block text-xs text-stone-500">{t.modules.length} apps</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <SubmitButton className={`${btn.primary} w-full py-2.5`} pendingText="Creando empresa…">Crear empresa</SubmitButton>
        </ActionForm>
      </div>
    </main>
  );
}
