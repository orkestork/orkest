import { ActionForm, SubmitButton } from "@/components/action-form";
import { btn, input, Field } from "@/components/ui";
import { login } from "./actions";

export const metadata = { title: "Ingresar" };
const DEV = process.env.NODE_ENV !== "production";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <main className="grid min-h-screen bg-[var(--ork-paper)] lg:grid-cols-[1.25fr_1fr]">
      <section className="relative hidden overflow-hidden lg:block">
        <img src="/brand/ork-hero.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--ork-paper)]/90 via-[var(--ork-paper)]/40 to-transparent" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <img src="/brand/ork-logo-violet.png" alt="OR-K Business Innovation & Technology" className="h-12 w-auto self-start" />
          <div className="max-w-md">
            <p className="text-[11px] uppercase tracking-[0.18em] text-stone-600">Enterprise Operating Platform</p>
            <h1 className="mt-4 font-display text-7xl uppercase leading-[0.8] tracking-tight text-[var(--ork-ink)]">
              Orquesta<br />toda tu<br /><em className="font-serif text-[1.08em] normal-case italic text-[var(--ork-violet)]">empresa</em>
            </h1>
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-stone-700">
              ERP, CRM, procesos, conocimiento, automatización e inteligencia en una sola plataforma.
              Cada empresa se configura; ninguna se reprograma.
            </p>
          </div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-stone-500">ORKEST by OR-K · Understand · Transform · Scale</p>
        </div>
      </section>

      <section className="flex items-center justify-center bg-[var(--ork-paper-light)] p-6">
        <div className="w-full max-w-sm">
          <img src="/brand/ork-logo-violet.png" alt="OR-K" className="mb-10 h-9 w-auto lg:hidden" />
          <h2 className="font-display text-5xl uppercase leading-none tracking-tight">Ingresar</h2>
          <p className="mt-2 text-sm text-stone-500">Accede a tu espacio de trabajo <span className="font-serif text-base italic text-[var(--ork-violet)]">ORKEST</span>.</p>
          <ActionForm action={login} className="mt-8 space-y-4">
            <input type="hidden" name="next" value={typeof next === "string" ? next : ""} />
            <Field label="Email"><input name="email" type="email" required autoComplete="email" className={input} defaultValue={DEV ? "admin@presservac.co" : undefined} /></Field>
            <Field label="Contraseña"><input name="password" type="password" required autoComplete="current-password" className={input} defaultValue={DEV ? "orkest123" : undefined} /></Field>
            <SubmitButton className={`${btn.primary} w-full py-2.5`} pendingText="Ingresando…">Ingresar →</SubmitButton>
          </ActionForm>
          {DEV && (
            <div className="mt-8 rounded-2xl border border-[var(--ork-rule)] bg-white/70 p-4 text-xs text-stone-500">
              <p className="font-semibold uppercase tracking-[0.12em] text-stone-700">Demo · clave orkest123</p>
              <ul className="mt-2 space-y-0.5">
                <li>admin@presservac.co — Propietario</li>
                <li>gerencia@presservac.co — Gerencia (aprobaciones)</li>
                <li>comercial@presservac.co — Comercial (2 empresas)</li>
                <li>plataforma@or-k.co — Panel global OR-K</li>
              </ul>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
