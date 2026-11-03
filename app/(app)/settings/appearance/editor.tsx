"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AppIcon } from "@/components/app-icons";
import { WorkeztMark } from "@/components/workezt-logo";
import { ICON_PALETTES, PRESETS, contrast, themeVars, type IconPack, type Theme } from "@/lib/ui/theme";
import { saveAppearance } from "./actions";

const COLORS: { key: keyof Theme; label: string; hint: string }[] = [
  { key: "primary", label: "Principal", hint: "Botones, títulos y barra activa" },
  { key: "accent", label: "Acento", hint: "Enlaces, selección y avatar" },
  { key: "highlight", label: "Resaltado", hint: "Alertas y detalles" },
  { key: "soft", label: "Suave", hint: "Fondos tenues y etiquetas" },
  { key: "background", label: "Fondo", hint: "Lienzo de la aplicación" },
  { key: "text", label: "Texto", hint: "Color del texto" },
];
const PACKS: { key: IconPack; name: string; desc: string }[] = [
  { key: "area", name: "Workezt 3D", desc: "Color por área de negocio" },
  { key: "duo", name: "Duotono", desc: "Formas a color superpuestas" },
  { key: "line", name: "Lineal", desc: "Trazo fino de un solo color" },
  { key: "glyph", name: "Sólido", desc: "Glifo blanco sobre color" },
];
const SAMPLE_ICONS = ["sales", "crm", "inventory", "purchasing", "manufacturing", "invoicing", "ask", "approvals"];

function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: { key: T; name: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key} onClick={() => onChange(o.key)}
          className={`rounded-full border px-3.5 py-1.5 text-sm ${value === o.key ? "border-[var(--ork-violet)] bg-[var(--ork-violet)]/10 font-medium text-[var(--ork-purple)]" : "border-stone-200 bg-white hover:border-[var(--ork-violet)]/40"}`}>{o.name}</button>
      ))}
    </div>
  );
}

export function AppearanceEditor({ initial, initialName, initialLogo, orgName }: { initial: Theme; initialName: string; initialLogo: string; orgName: string }) {
  const [t, setT] = useState<Theme>(initial);
  const [name, setName] = useState(initialName);
  const [logo, setLogo] = useState(initialLogo);
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = <K extends keyof Theme>(k: K, v: Theme[K]) => { setT((x) => ({ ...x, [k]: v })); setMsg(null); };
  const btnContrast = contrast("#ffffff", t.primary), textContrast = contrast(t.text, t.background);
  const dirty = JSON.stringify(t) !== JSON.stringify(initial) || name !== initialName || logo !== initialLogo;

  const save = () => start(async () => {
    const r = await saveAppearance({ theme: t, displayName: name, logoUrl: logo });
    if (r.error) setMsg({ text: r.error }); else { setMsg({ ok: true, text: "Apariencia guardada para toda la empresa." }); router.refresh(); }
  });

  const section = "rounded-2xl border border-[var(--ork-rule)] bg-white p-5 sm:p-6";
  const h = "mb-3 font-display text-base font-semibold text-[var(--ork-ink)]";
  const sub = "-mt-2 mb-3 text-xs text-stone-500";
  const pick = (on: boolean) => `rounded-2xl border p-3 text-left transition ${on ? "border-[var(--ork-violet)] bg-[var(--ork-violet)]/[0.04] ring-2 ring-[var(--ork-violet)]/20" : "border-stone-200 hover:border-[var(--ork-violet)]/40"}`;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="space-y-5">
        <section className={section}>
          <p className={h}>Temas listos</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {PRESETS.map((p) => {
              const active = JSON.stringify(p.theme) === JSON.stringify(t);
              return (
                <button key={p.key} type="button" onClick={() => { setT(p.theme); setMsg(null); }} aria-pressed={active}
                  className={`flex items-center gap-3 ${pick(active)}`}>
                  <span className="flex shrink-0">{[p.theme.primary, p.theme.accent, p.theme.highlight, p.theme.soft].map((c, i) => <span key={c + i} className="-ml-2 h-7 w-7 rounded-full border-2 border-white shadow-sm first:ml-0" style={{ background: c }} />)}</span>
                  <span className="min-w-0 text-sm font-medium">{p.name}</span>
                  {active && <span className="ml-auto text-xs font-semibold text-[var(--ork-violet)]">✓</span>}
                </button>
              );
            })}
          </div>
        </section>

        <section className={section}>
          <p className={h}>Colores de la interfaz</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {COLORS.map((c) => (
              <label key={c.key} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-stone-200 p-2.5 hover:border-[var(--ork-violet)]/40">
                <input type="color" value={t[c.key] as string} onChange={(e) => set(c.key, e.target.value as never)} aria-label={c.label} className="h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-full border border-stone-200 bg-white p-0.5 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-none" />
                <span className="min-w-0"><span className="block text-sm font-medium">{c.label} <code className="text-[11px] text-stone-500">{t[c.key] as string}</code></span><span className="block text-xs text-stone-500">{c.hint}</span></span>
              </label>
            ))}
          </div>
          {(btnContrast < 4.5 || textContrast < 4.5) && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {btnContrast < 4.5 && <>El texto blanco sobre el color principal se lee con dificultad (contraste {btnContrast.toFixed(1)}:1; mínimo 4.5:1). Prueba un principal más oscuro. </>}
              {textContrast < 4.5 && <>El texto sobre el fondo tiene poco contraste ({textContrast.toFixed(1)}:1).</>}
            </p>
          )}
        </section>

        <section className={section}>
          <p className={h}>Paquete de íconos</p>
          <p className={sub}>{t.iconPack === "area" ? "Cada familia tiene su color: turquesa industria, azul administración, naranja comercial, violeta inteligencia y gris organización." : "Se aplica a todas las apps del inicio y de la barra superior."}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {PACKS.map((p) => (
              <button key={p.key} type="button" onClick={() => set("iconPack", p.key)} aria-pressed={t.iconPack === p.key}
                style={themeVars(t)} className={pick(t.iconPack === p.key)}>
                <span className="flex gap-2">{["sales", "invoicing", "inventory", "ask"].map((i) => <AppIcon key={i} name={i} size={34} pack={p.key} />)}</span>
                <span className="mt-2 block text-sm font-semibold">{p.name}</span><span className="block text-xs text-stone-500">{p.desc}</span>
              </button>
            ))}
          </div>
          {t.iconPack === "duo" && <>
          <p className="mb-2 mt-5 text-sm font-medium text-stone-700">Paleta del duotono</p>
          <div className="flex flex-wrap gap-2">
            {ICON_PALETTES.map((p) => {
              const sw = p.colors ? [p.colors.deep, p.colors.violet, p.colors.pink, p.colors.amber, p.colors.teal] : [t.primary, t.accent, t.highlight, t.soft];
              return (
                <button key={p.key} type="button" onClick={() => set("iconPalette", p.key)} aria-pressed={t.iconPalette === p.key}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${t.iconPalette === p.key ? "border-[var(--ork-violet)] bg-[var(--ork-violet)]/10" : "border-stone-200 bg-white"}`}>
                  <span className="flex">{sw.map((c, i) => <span key={i} className="-ml-1 h-4 w-4 rounded-full border border-white first:ml-0" style={{ background: c }} />)}</span>{p.name}
                </button>
              );
            })}
          </div>
          </>}
        </section>

        <section className={section}>
          <p className={h}>Fondo</p>
          <div className="space-y-3">
            <div><Choice label="Fondo" value={t.canvas} onChange={(v) => set("canvas", v)} options={[{ key: "plain", name: "Claro" }, { key: "orbs", name: "Orbes suaves" }, { key: "dots", name: "Puntos" }]} /></div>
            {t.iconPack !== "area" && <div><p className="mb-1.5 text-sm text-stone-700">Tarjetas de las apps</p><Choice label="Tarjetas" value={t.tiles} onChange={(v) => set("tiles", v)} options={[{ key: "card", name: "Tarjeta blanca" }, { key: "tinted", name: "Tinte suave" }, { key: "flat", name: "Sin tarjeta" }]} /></div>}
          </div>
        </section>

        <section className={section}>
          <p className={h}>Identidad</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm"><span className="mb-1 block text-xs font-medium text-stone-600">Nombre visible</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder={orgName} className="w-full rounded-xl border border-stone-200 px-3 py-2 outline-none focus:border-[var(--ork-violet)]" /></label>
            <label className="text-sm"><span className="mb-1 block text-xs font-medium text-stone-600">Logo (URL https)</span><input value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://…/logo.png" className="w-full rounded-xl border border-stone-200 px-3 py-2 outline-none focus:border-[var(--ork-violet)]" /></label>
          </div>
        </section>
      </div>

      {/* ── Vista previa en vivo ── */}
      <div className="xl:sticky xl:top-20 xl:self-start">
        <p className={h}>Vista previa</p>
        <div style={themeVars(t)} data-canvas={t.canvas} data-tiles={t.tiles} data-icons={t.iconPack} className="ork-canvas overflow-hidden rounded-3xl border border-[var(--ork-rule)] shadow-lg shadow-black/5">
          {/* Barra superior */}
          <div className="flex items-center gap-2 border-b border-[var(--ork-rule)] bg-white/90 px-4 py-2.5">
            <WorkeztMark size={14} />
            <span className="font-display text-sm font-bold tracking-tight" style={{ color: t.text }}>workezt</span>
            <span className="mx-auto hidden h-6 w-40 rounded-full border border-[var(--ork-violet)]/15 bg-[var(--ork-violet)]/[0.04] sm:block" />
            {/* eslint-disable-next-line @next/next/no-img-element -- vista previa del logo configurado */}
            {logo && <img src={logo} alt="" className="h-5 w-auto max-w-20 object-contain" />}
            <span className="ml-auto rounded-full border border-[var(--ork-rule)] bg-white px-2.5 py-0.5 text-[11px] sm:ml-0">{name || orgName}</span>
            <span className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-semibold text-white" style={{ background: t.accent }}>A</span>
          </div>
          <div className="space-y-4 p-4 sm:p-5" style={{ color: t.text }}>
            {/* Banner */}
            <div className="relative overflow-hidden rounded-2xl bg-[var(--wz-night)] px-4 py-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- imagen estática de marca */}
              <img src="/brand/workezt-orca.jpg" alt="" className="absolute inset-y-0 right-0 h-full w-auto max-w-none [mask-image:linear-gradient(90deg,transparent,#000_35%)]" />
              <p className="relative font-display text-base font-bold text-white">Tu empresa, en arm<span className="text-[#c4a6ff]">onía.</span></p>
              <p className="relative text-[10px] tracking-[0.2em] text-white/70">Understand · Transform · Scale</p>
            </div>
            {/* Apps */}
            <p className="font-display text-sm font-bold">Aplicaciones</p>
            <div className="grid grid-cols-4 gap-x-2 gap-y-3">
              {SAMPLE_ICONS.map((i) => (
                <div key={i} className="flex flex-col items-center gap-1"><a className="block"><span className="app-tile grid h-12 w-12 place-items-center"><AppIcon name={i} size={t.iconPack === "area" ? 46 : 30} /></span></a>
                  <span className="text-[11px]">{{ sales: "Ventas", crm: "CRM", inventory: "Inventario", purchasing: "Compras", manufacturing: "Manufactura", invoicing: "Facturación", ask: "Ask", approvals: "Aprobaciones" }[i]}</span></div>
              ))}
            </div>
            {/* Ficha */}
            <div className="rounded-2xl border border-[var(--ork-rule)] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <AppIcon name="sales" size={34} />
                  <div><p className="text-[10px] font-medium uppercase tracking-wide text-stone-500">Pedido</p><p className="font-display text-lg font-bold leading-tight">S27165</p>
                    <p className="text-xs">Fábrica de Bolsas de Papel Unibol · <a className="font-medium text-[var(--ork-violet)]">ver cliente</a></p></div>
                </div>
                <span className="rounded-full px-2.5 py-0.5 text-[11px] text-white" style={{ background: t.accent }}>Confirmado</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5"><span className="rounded-full bg-[var(--ork-violet)]/10 px-2.5 py-0.5 text-[11px] text-[var(--ork-purple)]">Servientrega</span><span className="rounded-full px-2.5 py-0.5 text-[11px] text-white" style={{ background: t.highlight }}>Por facturar</span></div>
              <div className="mt-3 flex items-center gap-1.5">
                {["Borrador", "Confirmado", "Entregado"].map((st, i) => (
                  <span key={st} className="flex flex-1 items-center gap-1.5 text-[10px]">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2" style={{ borderColor: i <= 1 ? t.accent : "#c9cedb", background: i < 1 ? t.accent : "#fff" }} />
                    <span className={i === 1 ? "font-semibold" : "text-stone-500"}>{st}</span>
                    {i < 2 && <span className="h-0.5 flex-1 rounded" style={{ background: i < 1 ? t.accent : "#e0e3ec" }} />}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex gap-2"><button type="button" className="rounded-full bg-[var(--ork-purple)] px-4 py-1.5 text-sm font-medium text-white">Crear factura</button><button type="button" className="rounded-full border border-[var(--ork-rule)] bg-white px-4 py-1.5 text-sm">Generar entrega</button></div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" disabled={pending || !dirty} onClick={save} className="rounded-full bg-[var(--ork-purple)] px-5 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-40">{pending ? "Guardando…" : "Guardar apariencia"}</button>
          <button type="button" disabled={!dirty} onClick={() => { setT(initial); setName(initialName); setLogo(initialLogo); setMsg(null); }} className="rounded-full border border-[var(--ork-rule)] bg-white px-5 py-2 text-sm disabled:opacity-40">Descartar cambios</button>
          {msg && <p role="status" className={`text-sm ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
        </div>
        <p className="mt-2 text-xs text-stone-500">Se aplica a todos los usuarios de {orgName}.</p>
      </div>
    </div>
  );
}
