import { ActionForm, SubmitButton } from "@/components/action-form";
import { btn, input, Field } from "@/components/ui";
import { login } from "./actions";
import { WorkeztLogo } from "@/components/workezt-logo";

export const metadata = { title: "Ingresar" };
const DEV = process.env.NODE_ENV !== "production";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <main className="grid min-h-screen bg-[var(--ork-paper-light)] lg:grid-cols-[1.25fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[var(--wz-night)] lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element -- imagen estática de marca */}
        <img src="/brand/workezt-orca.jpg" alt="" className="absolute bottom-[7%] right-0 w-full max-w-none [mask-image:linear-gradient(90deg,transparent,#000_45%)]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <WorkeztLogo size={34} tone="light" byOrk />
          <div className="max-w-md">
            <h1 className="font-display text-6xl font-bold leading-[1.02] tracking-tight text-white">
              Tu empresa,<br />en arm<span className="text-[#c4a6ff]">onía.</span>
            </h1>
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/75">
              ERP, CRM, procesos, conocimiento, automatización e inteligencia en una sola plataforma.
              Cada empresa se configura; ninguna se reprograma.
            </p>
          </div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/55">Understand · Transform · Scale</p>
        </div>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden"><WorkeztLogo size={28} byOrk /></div>
          <h2 className="font-display text-4xl font-bold leading-none">Ingresar</h2>
          <p className="mt-2 text-sm text-stone-500">Accede a tu espacio de trabajo en <span className="font-semibold text-[var(--ork-violet)]">Workezt</span>.</p>
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
