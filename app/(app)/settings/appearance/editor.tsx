"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AppIcon } from "@/components/app-icons";
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
          className={`rounded-lg border px-3 py-1.5 text-sm ${value === o.key ? "border-[var(--ork-purple)] bg-[var(--ork-purple)] text-white" : "border-stone-300 bg-white hover:border-stone-500"}`}>{o.name}</button>
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

  const section = "rounded-2xl border border-[var(--ork-rule)] bg-white p-5";
  const h = "mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-stone-600";

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
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left ${active ? "border-[var(--ork-purple)] ring-2 ring-[var(--ork-purple)]/20" : "border-stone-200 hover:border-stone-400"}`}>
                  <span className="flex shrink-0 overflow-hidden rounded-lg border border-black/10">{[p.theme.primary, p.theme.accent, p.theme.highlight, p.theme.soft, p.theme.background].map((c) => <span key={c} className="h-8 w-4" style={{ background: c }} />)}</span>
                  <span className="text-sm font-medium">{p.name}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className={section}>
          <p className={h}>Colores de la interfaz</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {COLORS.map((c) => (
              <label key={c.key} className="flex items-center gap-3 rounded-xl border border-stone-200 p-2.5">
                <input type="color" value={t[c.key] as string} onChange={(e) => set(c.key, e.target.value as never)} aria-label={c.label} className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-stone-300 bg-white" />
                <span className="min-w-0"><span className="block text-sm font-medium">{c.label} <code className="text-[11px] text-stone-500">{t[c.key] as string}</code></span><span className="block text-xs text-stone-500">{c.hint}</span></span>
              </label>
            ))}
          </div>
          {(btnContrast < 4.5 || textContrast < 4.5) && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {btnContrast < 4.5 && <>El texto blanco sobre el color principal se lee con dificultad (contraste {btnContrast.toFixed(1)}:1; mínimo 4.5:1). Prueba un principal más oscuro. </>}
              {textContrast < 4.5 && <>El texto sobre el fondo tiene poco contraste ({textContrast.toFixed(1)}:1).</>}
            </p>
          )}
        </section>

        <section className={section}>
          <p className={h}>Paquete de íconos</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {PACKS.map((p) => (
              <button key={p.key} type="button" onClick={() => set("iconPack", p.key)} aria-pressed={t.iconPack === p.key}
                style={themeVars(t)} className={`rounded-xl border p-3 text-left ${t.iconPack === p.key ? "border-[var(--ork-purple)] ring-2 ring-[var(--ork-purple)]/20" : "border-stone-200 hover:border-stone-400"}`}>
                <span className="flex gap-1.5">{["sales", "crm", "inventory", "ask"].map((i) => <AppIcon key={i} name={i} size={30} pack={p.key} />)}</span>
                <span className="mt-2 block text-sm font-semibold">{p.name}</span><span className="block text-xs text-stone-500">{p.desc}</span>
              </button>
            ))}
          </div>
          <p className={`${h} mt-5`}>Paleta de los íconos {t.iconPack !== "duo" && <span className="normal-case tracking-normal text-stone-400">(aplica al paquete Duotono)</span>}</p>
          <div className="flex flex-wrap gap-2">
            {ICON_PALETTES.map((p) => {
              const sw = p.colors ? [p.colors.deep, p.colors.violet, p.colors.pink, p.colors.amber, p.colors.teal] : [t.primary, t.accent, t.highlight, t.soft];
              return (
                <button key={p.key} type="button" onClick={() => set("iconPalette", p.key)} aria-pressed={t.iconPalette === p.key}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${t.iconPalette === p.key ? "border-[var(--ork-purple)] bg-[var(--ork-lavender)]/20" : "border-stone-300 bg-white"}`}>
                  <span className="flex">{sw.map((c, i) => <span key={i} className="-ml-1 h-4 w-4 rounded-full border border-white first:ml-0" style={{ background: c }} />)}</span>{p.name}
                </button>
              );
            })}
          </div>
        </section>

        <section className={section}>
          <p className={h}>Fondo y tarjetas</p>
          <div className="space-y-3">
            <div><p className="mb-1.5 text-sm text-stone-700">Fondo del lienzo</p><Choice label="Fondo" value={t.canvas} onChange={(v) => set("canvas", v)} options={[{ key: "orbs", name: "Orbes suaves" }, { key: "plain", name: "Liso" }, { key: "dots", name: "Puntos" }]} /></div>
            <div><p className="mb-1.5 text-sm text-stone-700">Tarjetas de las apps</p><Choice label="Tarjetas" value={t.tiles} onChange={(v) => set("tiles", v)} options={[{ key: "card", name: "Tarjeta blanca" }, { key: "tinted", name: "Tinte suave" }, { key: "flat", name: "Sin tarjeta" }]} /></div>
          </div>
        </section>

        <section className={section}>
          <p className={h}>Identidad</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm"><span className="mb-1 block text-xs font-medium text-stone-600">Nombre visible</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder={orgName} className="w-full rounded-lg border border-stone-300 px-3 py-2" /></label>
            <label className="text-sm"><span className="mb-1 block text-xs font-medium text-stone-600">Logo (URL https)</span><input value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://…/logo.png" className="w-full rounded-lg border border-stone-300 px-3 py-2" /></label>
          </div>
        </section>
      </div>

      {/* ── Vista previa en vivo ── */}
      <div className="xl:sticky xl:top-20 xl:self-start">
        <p className={h}>Vista previa</p>
        <div style={themeVars(t)} data-canvas={t.canvas} data-tiles={t.tiles} data-icons={t.iconPack} className="ork-canvas overflow-hidden rounded-2xl border border-[var(--ork-rule)] shadow-sm" >
          <div className="flex items-center justify-between border-b border-[var(--ork-rule)] bg-white/60 px-4 py-2.5">
            <div className="flex items-center gap-2"><AppIcon name="sales" size={20} /><span className="font-display text-sm uppercase">Ventas</span>
              <span className="ml-2 rounded-md bg-[var(--ork-purple)] px-2 py-0.5 text-xs text-white">Pedidos</span><span className="text-xs text-stone-600">Cotizaciones</span></div>
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- vista previa del logo configurado */}
              {logo && <img src={logo} alt="" className="h-5 w-auto max-w-20 object-contain" />}
              <span className="rounded-full border border-[var(--ork-rule)] bg-white/70 px-2 py-0.5 text-[11px]">{name || orgName}</span>
              <span className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-semibold text-white" style={{ background: t.accent }}>A</span>
            </div>
          </div>
          <div className="space-y-4 p-5" style={{ color: t.text }}>
            <div className="grid grid-cols-4 gap-3">
              {SAMPLE_ICONS.map((i) => (
                <div key={i} className="flex flex-col items-center gap-1"><a className="block"><span className="app-tile grid h-14 w-14 place-items-center"><AppIcon name={i} size={34} /></span></a>
                  <span className="text-[11px]">{{ sales: "Ventas", crm: "CRM", inventory: "Inventario", purchasing: "Compras", manufacturing: "Manufactura", invoicing: "Facturación", ask: "Ask", approvals: "Aprobaciones" }[i]}</span></div>
              ))}
            </div>
            <div className="rounded-xl border border-[var(--ork-rule)] bg-white p-4">
              <div className="mb-3 flex items-center justify-between"><p className="font-display text-lg uppercase text-[var(--ork-purple)]">Pedido S27165</p><span className="rounded-full px-2 py-0.5 text-[11px] text-white" style={{ background: t.accent }}>Confirmado</span></div>
              <p className="text-sm">Fábrica de Bolsas de Papel Unibol · <a className="font-medium text-[var(--ork-violet)] underline">ver cliente</a></p>
              <div className="mt-2 flex flex-wrap gap-1.5"><span className="rounded-full bg-[var(--ork-lavender)]/35 px-2 py-0.5 text-[11px] text-[var(--ork-purple)]">Servientrega</span><span className="rounded-full px-2 py-0.5 text-[11px] text-white" style={{ background: t.highlight }}>Por facturar</span></div>
              <div className="mt-4 flex gap-2"><button type="button" className="rounded-lg bg-[var(--ork-purple)] px-3 py-1.5 text-sm font-medium text-white">Crear factura</button><button type="button" className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm">Generar entrega</button></div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" disabled={pending || !dirty} onClick={save} className="rounded-lg bg-[var(--ork-purple)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{pending ? "Guardando…" : "Guardar apariencia"}</button>
          <button type="button" disabled={!dirty} onClick={() => { setT(initial); setName(initialName); setLogo(initialLogo); setMsg(null); }} className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm disabled:opacity-40">Descartar cambios</button>
          {msg && <p role="status" className={`text-sm ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
        </div>
        <p className="mt-2 text-xs text-stone-500">Se aplica a todos los usuarios de {orgName}.</p>
      </div>
    </div>
  );
}
