/**
 * Íconos de apps ORKEST — formas planas superpuestas (multiply) sobre la paleta OR-K
 * con dos acentos cálidos para diferenciar apps. viewBox 64×64, sin dependencias.
 */
import type { CSSProperties, ReactNode } from "react";

const C = {
  // Colores como variables CSS: la paleta de íconos de cada organización los reemplaza (ver lib/ui/theme.ts)
  deep: "var(--ic-deep, #32125e)", violet: "var(--ic-violet, #6f35b5)", lav: "var(--ic-lav, #bda5ff)", pink: "var(--ic-pink, #e31572)",
  lime: "var(--ic-lime, #b6ff5c)", amber: "var(--ic-amber, #ffb547)", teal: "var(--ic-teal, #1fc7b6)", ink: "#11100f", white: "#ffffff",
};
/** Superposición: la intersección de dos formas se oscurece, como tinta. */
const mx: CSSProperties = { mixBlendMode: "multiply" };

const ICONS: Record<string, ReactNode> = {
  dashboard: (<>
    <rect x="6" y="6" width="26" height="26" rx="7" fill={C.violet} />
    <rect x="36" y="6" width="22" height="11" rx="5" fill={C.pink} />
    <rect x="36" y="21" width="22" height="11" rx="5" fill={C.teal} />
    <rect x="6" y="36" width="52" height="22" rx="7" fill={C.amber} />
    <path d="M13 51l9-7 8 4 10-9 11 5" stroke={C.deep} strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </>),
  ask: (<>
    <path d="M6 18a12 12 0 0 1 12-12h20a12 12 0 0 1 12 12v8a12 12 0 0 1-12 12H22l-10 8v-9.5A12 12 0 0 1 6 26z" fill={C.lav} />
    <path d="M24 34a10 10 0 0 1 10-10h14a10 10 0 0 1 10 10v6a10 10 0 0 1-10 10h-2v8l-9-8h-3a10 10 0 0 1-10-10z" fill={C.violet} style={mx} />
    <path d="M41 30l1.8 4.7 4.7 1.8-4.7 1.8L41 43l-1.8-4.7-4.7-1.8 4.7-1.8z" fill={C.lime} />
  </>),
  approvals: (<>
    <rect x="8" y="46" width="48" height="11" rx="4" fill={C.amber} />
    <path d="M22 30h20l3 16H19z" fill={C.deep} />
    <circle cx="32" cy="20" r="14" fill={C.violet} />
    <path d="M25.5 20.5l4.5 4.5 9-9" stroke={C.white} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </>),
  tasks: (<>
    <rect x="6" y="8" width="40" height="13" rx="6.5" fill={C.lav} />
    <rect x="6" y="26" width="40" height="13" rx="6.5" fill={C.lav} />
    <rect x="6" y="44" width="28" height="13" rx="6.5" fill={C.lav} />
    <path d="M30 34l9 9 19-21" stroke={C.teal} strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round" style={mx} />
  </>),
  crm: (<>
    <rect x="4" y="12" width="44" height="40" rx="9" fill={C.pink} />
    <circle cx="40" cy="26" r="11" fill={C.violet} style={mx} />
    <path d="M20 58a20 20 0 0 1 40 0z" fill={C.violet} style={mx} />
    <rect x="11" y="22" width="14" height="4" rx="2" fill={C.white} />
    <rect x="11" y="31" width="9" height="4" rx="2" fill={C.white} />
  </>),
  sales: (<>
    <rect x="6" y="34" width="14" height="24" rx="4" fill={C.lav} />
    <rect x="18" y="22" width="14" height="36" rx="4" fill={C.pink} style={mx} />
    <rect x="30" y="12" width="14" height="46" rx="4" fill={C.violet} style={mx} />
    <rect x="42" y="4" width="14" height="54" rx="4" fill={C.amber} style={mx} />
  </>),
  products: (<>
    <path d="M32 4l26 14v28L32 60 6 46V18z" fill={C.violet} />
    <path d="M32 32L6 18 32 4l26 14z" fill={C.lav} />
    <path d="M32 32v28l26-14V18z" fill={C.deep} />
    <path d="M19 11l26 14v8" stroke={C.amber} strokeWidth="4" fill="none" />
  </>),
  inventory: (<>
    <rect x="4" y="30" width="30" height="28" rx="5" fill={C.amber} />
    <rect x="22" y="8" width="38" height="34" rx="5" fill={C.pink} style={mx} />
    <rect x="35" y="8" width="12" height="12" fill={C.deep} />
    <rect x="13" y="30" width="12" height="9" fill={C.deep} opacity=".5" />
  </>),
  purchasing: (<>
    <path d="M10 22h44l-4 34a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4z" fill={C.violet} />
    <path d="M22 26v-6a10 10 0 0 1 20 0v6" stroke={C.pink} strokeWidth="5" fill="none" strokeLinecap="round" />
    <rect x="10" y="22" width="44" height="10" fill={C.deep} opacity=".35" />
    <path d="M38 38h14v14l-7 4-7-4z" fill={C.lime} />
  </>),
  manufacturing: (<>
    <path d="M4 58V30l16 10V30l16 10V30l16 10v18z" fill={C.teal} />
    <path d="M4 58V36l16 10V36l16 10V36l20 12v10z" fill={C.deep} style={mx} />
    <rect x="44" y="6" width="10" height="34" rx="2" fill={C.violet} />
    <rect x="41" y="4" width="16" height="6" rx="3" fill={C.pink} />
    <rect x="12" y="48" width="7" height="6" rx="1" fill={C.amber} />
    <rect x="28" y="48" width="7" height="6" rx="1" fill={C.amber} />
  </>),
  quality: (<>
    <rect x="4" y="4" width="34" height="34" rx="8" fill={C.lav} />
    <circle cx="35" cy="35" r="15" fill={C.teal} style={mx} />
    <circle cx="35" cy="35" r="15" fill="none" stroke={C.deep} strokeWidth="5" />
    <path d="M46 46l12 12" stroke={C.pink} strokeWidth="8" strokeLinecap="round" />
    <path d="M28 35l5 5 9-10" stroke={C.white} strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </>),
  invoicing: (<>
    <path d="M10 4h30l14 14v42H10z" fill={C.lav} />
    <path d="M40 4v14h14z" fill={C.violet} />
    <rect x="17" y="24" width="24" height="4" rx="2" fill={C.deep} />
    <rect x="17" y="32" width="18" height="4" rx="2" fill={C.deep} />
    <circle cx="44" cy="46" r="14" fill={C.pink} style={mx} />
    <path d="M44 38v16M48 41.5c-1-1.5-2.5-2-4.2-2-2.3 0-3.8 1.2-3.8 3s1.6 2.5 4 3 4 1.4 4 3.3-1.6 3.2-4 3.2c-1.8 0-3.4-.7-4.4-2.2" stroke={C.white} strokeWidth="2.4" fill="none" strokeLinecap="round" />
  </>),
  knowledge: (<>
    <path d="M4 12c10-4 19-4 28 3v43c-9-7-18-7-28-3z" fill={C.violet} />
    <path d="M60 12c-10-4-19-4-28 3v43c9-7 18-7 28-3z" fill={C.teal} style={mx} />
    <path d="M42 8h10v22l-5-4-5 4z" fill={C.amber} />
  </>),
  sonar: (<>
    <path d="M6 58A52 52 0 0 1 58 6v12A40 40 0 0 0 18 58z" fill={C.lav} />
    <path d="M18 58a40 40 0 0 1 40-40v12a28 28 0 0 0-28 28z" fill={C.violet} />
    <path d="M30 58a28 28 0 0 1 28-28v12A16 16 0 0 0 42 58z" fill={C.deep} />
    <circle cx="54" cy="54" r="7" fill={C.pink} />
  </>),
  radar: (<>
    <circle cx="32" cy="32" r="27" fill={C.ink} />
    <path d="M32 32V5a27 27 0 0 1 23.4 13.5z" fill={C.lime} />
    <circle cx="32" cy="32" r="17" fill="none" stroke={C.violet} strokeWidth="2.5" />
    <circle cx="32" cy="32" r="8" fill="none" stroke={C.violet} strokeWidth="2" />
    <circle cx="44" cy="20" r="4" fill={C.pink} />
    <circle cx="21" cy="42" r="3" fill={C.amber} />
  </>),
  analytics: (<>
    <path d="M29 8A24 24 0 1 0 56 35H29z" fill={C.violet} />
    <path d="M34 3v27h27A27 27 0 0 0 34 3z" fill={C.pink} />
    <path d="M29 35h27a24 24 0 0 1-12 20.8z" fill={C.teal} />
  </>),
  automations: (<>
    <circle cx="32" cy="32" r="26" fill={C.deep} />
    <path d="M36 4L16 36h14l-4 24 22-34H34z" fill={C.amber} />
    <circle cx="52" cy="50" r="7" fill={C.pink} />
  </>),
  studio: (<>
    <circle cx="22" cy="22" r="17" fill={C.lav} />
    <rect x="24" y="24" width="34" height="34" rx="8" fill={C.pink} style={mx} />
    <path d="M48 6l10 10-22 22-12 2 2-12z" fill={C.deep} />
    <path d="M44 10l10 10" stroke={C.amber} strokeWidth="4" />
  </>),
  import: (<>
    <path d="M4 38h16l4 8h16l4-8h16v16a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6z" fill={C.deep} />
    <rect x="27" y="4" width="10" height="28" rx="5" fill={C.teal} />
    <path d="M18 22l14 14 14-14" stroke={C.teal} strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" style={mx} />
  </>),
  settings: (<>
    <path d="M32 3l25 14.5v29L32 61 7 46.5v-29z" fill={C.violet} />
    <path d="M32 3l25 14.5L32 32z" fill={C.pink} style={mx} />
    <path d="M7 46.5L32 32v29z" fill={C.deep} />
    <circle cx="32" cy="32" r="10" fill={C.white} />
  </>),
  apps: (<>
    <path d="M30 4A26 26 0 0 0 4 30h26z" fill={C.violet} />
    <path d="M34 4a26 26 0 0 1 26 26H34z" fill={C.pink} />
    <path d="M4 34a26 26 0 0 0 26 26V34z" fill={C.teal} />
    <path d="M60 34a26 26 0 0 1-26 26V34z" fill={C.amber} />
  </>),
  notifications: (<>
    <path d="M32 6a17 17 0 0 1 17 17v13l6 9H9l6-9V23A17 17 0 0 1 32 6z" fill={C.violet} />
    <circle cx="32" cy="52" r="7" fill={C.deep} />
    <circle cx="49" cy="13" r="8" fill={C.pink} />
  </>),
  platform: (<>
    <circle cx="32" cy="32" r="27" fill={C.deep} />
    <path d="M32 20c-11 0-17 8-17 14s6 11 17 11 17-5 17-11-6-14-17-14z" fill="none" stroke={C.lav} strokeWidth="4" />
    <path d="M24 18c0-7 4-12 8-14 4 2 8 7 8 14" fill={C.pink} />
  </>),
  // Íconos adicionales para objetos personalizados de Studio
  wrench: (<>
    <circle cx="20" cy="20" r="15" fill={C.amber} />
    <path d="M44 8a12 12 0 0 0-11 16L8 49a5 5 0 0 0 7 7l25-25a12 12 0 0 0 16-11l-7 5-6-2-2-6z" fill={C.violet} style={mx} />
    <circle cx="12" cy="52" r="3" fill={C.white} />
  </>),
  clipboard: (<>
    <rect x="10" y="8" width="44" height="52" rx="7" fill={C.lav} />
    <rect x="22" y="3" width="20" height="11" rx="4" fill={C.deep} />
    <rect x="18" y="24" width="28" height="5" rx="2.5" fill={C.violet} />
    <rect x="18" y="35" width="20" height="5" rx="2.5" fill={C.violet} />
    <circle cx="44" cy="46" r="10" fill={C.teal} style={mx} />
  </>),
  truck: (<>
    <rect x="4" y="14" width="36" height="30" rx="5" fill={C.violet} />
    <path d="M36 24h14l10 12v8H36z" fill={C.amber} style={mx} />
    <circle cx="16" cy="48" r="8" fill={C.deep} />
    <circle cx="48" cy="48" r="8" fill={C.deep} />
    <circle cx="16" cy="48" r="3" fill={C.white} />
    <circle cx="48" cy="48" r="3" fill={C.white} />
  </>),
  calendar: (<>
    <rect x="6" y="10" width="52" height="48" rx="8" fill={C.lav} />
    <rect x="6" y="10" width="52" height="14" rx="7" fill={C.pink} />
    <rect x="16" y="4" width="6" height="12" rx="3" fill={C.deep} />
    <rect x="42" y="4" width="6" height="12" rx="3" fill={C.deep} />
    <rect x="34" y="34" width="14" height="14" rx="3" fill={C.violet} />
  </>),
  flask: (<>
    <path d="M24 4h16v18l16 28a6 6 0 0 1-5 9H13a6 6 0 0 1-5-9l16-28z" fill={C.lav} />
    <path d="M14 40h36l6 10a6 6 0 0 1-5 9H13a6 6 0 0 1-5-9z" fill={C.teal} style={mx} />
    <rect x="20" y="2" width="24" height="6" rx="3" fill={C.deep} />
    <circle cx="28" cy="48" r="3" fill={C.white} />
  </>),
  people: (<>
    <circle cx="22" cy="20" r="11" fill={C.violet} />
    <circle cx="42" cy="22" r="9" fill={C.pink} style={mx} />
    <path d="M4 56a18 18 0 0 1 36 0z" fill={C.violet} />
    <path d="M28 56a14 14 0 0 1 32 0z" fill={C.amber} style={mx} />
  </>),
};

export const APP_ICON_NAMES = Object.keys(ICONS);

export type IconPack = "duo" | "line" | "glyph";

/**
 * Ícono de app. El paquete (duotono, lineal o sólido) lo define el tema de la organización
 * (atributo data-icons en el lienzo); `pack` lo fija para una vista previa.
 */
export function AppIcon({ name, size = 56, pack }: { name: string; size?: number; pack?: IconPack }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="app-icon" data-pack={pack} style={{ isolation: "isolate" }}>
      <rect className="ic-bg" x="0" y="0" width="64" height="64" rx="16" />
      <g className="ic-shapes">{ICONS[name] ?? <rect x="10" y="10" width="44" height="44" rx="12" fill={C.violet} />}</g>
    </svg>
  );
}
