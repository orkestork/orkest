/**
 * Íconos de apps Workezt — formas planas superpuestas (multiply) sobre la paleta OR-K
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
  campaigns: (<>
    <path d="M8 24h12l26-16v48L20 40H8a4 4 0 0 1-4-4V28a4 4 0 0 1 4-4z" fill={C.violet} />
    <rect x="12" y="38" width="10" height="20" rx="4" fill={C.deep} />
    <path d="M20 24l26-16v48L20 40z" fill={C.pink} style={mx} />
    <rect x="50" y="22" width="10" height="20" rx="5" fill={C.amber} />
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
  maintenance: (<>
    <circle cx="26" cy="38" r="20" fill={C.lav} />
    <path d="M44 6a14 14 0 0 0-13 19L8 48a6 6 0 0 0 8 8l23-23A14 14 0 0 0 58 20l-8 8-8-2-2-8 8-8a14 14 0 0 0-4-4z" fill={C.deep} style={mx} />
    <circle cx="12" cy="52" r="3" fill={C.amber} />
    <rect x="40" y="42" width="18" height="16" rx="4" fill={C.pink} style={mx} />
  </>),
  logistics: (<>
    <rect x="4" y="14" width="34" height="30" rx="4" fill={C.violet} />
    <path d="M38 24h12l10 12v8H38z" fill={C.amber} style={mx} />
    <rect x="42" y="27" width="8" height="7" rx="1" fill={C.white} />
    <circle cx="16" cy="48" r="7" fill={C.deep} /><circle cx="48" cy="48" r="7" fill={C.deep} />
    <circle cx="16" cy="48" r="2.5" fill={C.lime} /><circle cx="48" cy="48" r="2.5" fill={C.lime} />
    <path d="M10 22h16M10 30h10" stroke={C.pink} strokeWidth="4" strokeLinecap="round" />
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
  hr: (<>
    <rect x="4" y="6" width="38" height="46" rx="9" fill={C.lav} />
    <circle cx="23" cy="22" r="8" fill={C.violet} style={mx} />
    <path d="M9 44a14 14 0 0 1 28 0z" fill={C.violet} style={mx} />
    <circle cx="46" cy="44" r="14" fill={C.pink} style={mx} />
    <path d="M40 44l4.5 4.5 8-8" stroke={C.white} strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </>),
  employee_portal: (<>
    <rect x="6" y="6" width="52" height="52" rx="12" fill={C.teal} />
    <circle cx="32" cy="25" r="10" fill={C.deep} style={mx} />
    <path d="M14 54a18 18 0 0 1 36 0z" fill={C.violet} style={mx} />
    <path d="M44 8h10a4 4 0 0 1 4 4v10z" fill={C.amber} />
  </>),
  people: (<>
    <circle cx="22" cy="20" r="11" fill={C.violet} />
    <circle cx="42" cy="22" r="9" fill={C.pink} style={mx} />
    <path d="M4 56a18 18 0 0 1 36 0z" fill={C.violet} />
    <path d="M28 56a14 14 0 0 1 32 0z" fill={C.amber} style={mx} />
  </>),
};


/* ───────── Workezt · propuesta A: color por área ─────────
   Recuadro 3D con el color de la familia y un glifo blanco por función. */
export type Family = "industry" | "admin" | "commercial" | "intel" | "org";
export const FAMILIES: Record<Family, { name: string; light: string; base: string; dark: string }> = {
  industry: { name: "Industria y logística", light: "#34cdc6", base: "#0f9ea3", dark: "#0a6a72" },
  admin: { name: "Administración y finanzas", light: "#4aa3ff", base: "#1a6fe6", dark: "#0b4bb3" },
  commercial: { name: "Comercial y creación", light: "#ffb457", base: "#f57c1f", dark: "#d4520c" },
  intel: { name: "Inteligencia", light: "#a978ff", base: "#7c3aed", dark: "#5317c4" },
  org: { name: "Organización", light: "#8d9bb0", base: "#61708a", dark: "#434f66" },
};
const FAMILY_OF: Record<string, Family> = {
  inventory: "industry", products: "industry", manufacturing: "industry", maintenance: "industry", logistics: "industry",
  quality: "industry", wrench: "industry", truck: "industry", flask: "industry",
  invoicing: "admin", purchasing: "admin", analytics: "admin", import: "admin",
  crm: "commercial", sales: "commercial", campaigns: "commercial", studio: "commercial",
  ask: "intel", automations: "intel", radar: "intel", sonar: "intel", dashboard: "intel",
};
export const familyOf = (name: string): Family => FAMILY_OF[name] ?? "org";

const W = "#fff";
const S = { fill: W, fillOpacity: 0.72 } as const;
/** Glifos blancos (viewBox 64; zona útil 14–50). `c` = tono oscuro de la familia para detalles calados. */
const GLYPHS: Record<string, (c: string) => ReactNode> = {
  inventory: () => (<>
    <path d="M32 13l17 9.5L32 32 15 22.5z" fill={W} />
    <path d="M15 22.5L32 32v19l-17-9.5z" {...S} fillOpacity={0.85} />
    <path d="M49 22.5L32 32v19l17-9.5z" {...S} fillOpacity={0.6} />
  </>),
  products: (c) => (<>
    <path d="M14 31V17a3 3 0 0 1 3-3h14l19 19-17 17z" fill={W} />
    <circle cx="23" cy="23" r="3.6" fill={c} />
  </>),
  manufacturing: (c) => (<>
    <path d="M13 50V30l11 7v-7l11 7v-7l6 4V14h9v36z" fill={W} />
    <rect x="18" y="41" width="5" height="4" rx="1" fill={c} /><rect x="27" y="41" width="5" height="4" rx="1" fill={c} /><rect x="36" y="41" width="5" height="4" rx="1" fill={c} />
  </>),
  maintenance: () => (<>
    <path d="M45 13a11 11 0 0 0-10.5 14.3L14.6 47.2a4.4 4.4 0 0 0 6.2 6.2l19.9-19.9A11 11 0 0 0 52 20.4l-6.3 4.5-5.4-1.3-1.3-5.4 4.5-6.3z" fill={W} />
  </>),
  logistics: (c) => (<>
    <rect x="11" y="18" width="27" height="22" rx="3" fill={W} />
    <path d="M38 25h8l8 9v6H38z" {...S} />
    <circle cx="20" cy="43" r="5.5" fill={W} stroke={c} strokeWidth="2.5" /><circle cx="45" cy="43" r="5.5" fill={W} stroke={c} strokeWidth="2.5" />
  </>),
  quality: (c) => (<>
    <path d="M32 12l17 6v12c0 10.5-7.3 17.6-17 21-9.7-3.4-17-10.5-17-21V18z" fill={W} />
    <path d="M24 31.5l5.5 5.5L41 25.5" fill="none" stroke={c} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
  </>),
  invoicing: (c) => (<>
    <path d="M17 12h22l8 8v28l-4-3-4 3-4-3-4 3-4-3-4 3-4-3-2 1.5z" fill={W} />
    <rect x="22" y="21" width="14" height="3.5" rx="1.75" fill={c} opacity=".55" /><rect x="22" y="28" width="10" height="3.5" rx="1.75" fill={c} opacity=".55" />
    <circle cx="43" cy="41" r="9" fill={W} stroke={c} strokeWidth="2.5" />
    <path d="M39 41l3 3 5.5-6" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </>),
  purchasing: () => (<>
    <path d="M11 15h6l5.5 22h22L51 21H20" fill="none" stroke={W} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20 21h31l-6.5 16h-22z" {...S} />
    <circle cx="24.5" cy="46" r="4" fill={W} /><circle cx="42" cy="46" r="4" fill={W} />
  </>),
  analytics: () => (<>
    <path d="M30 14.2A18 18 0 1 0 49.8 34H30z" fill={W} />
    <path d="M34 11v19h19A19 19 0 0 0 34 11z" {...S} />
  </>),
  import: () => (<>
    <path d="M13 37h10l3 5h12l3-5h10v10a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4z" fill={W} />
    <path d="M32 12v20M23.5 24l8.5 8.5 8.5-8.5" fill="none" stroke={W} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
  </>),
  crm: () => (<>
    <circle cx="32" cy="32" r="17" fill="none" stroke={W} strokeOpacity=".75" strokeWidth="2.5" strokeDasharray="7 5" />
    <circle cx="32" cy="15" r="4" fill={W} /><circle cx="15" cy="32" r="4" fill={W} /><circle cx="49" cy="32" r="4" fill={W} />
    <circle cx="32" cy="28" r="6" fill={W} /><path d="M21 46a11 11 0 0 1 22 0z" fill={W} />
  </>),
  sales: () => (<>
    <rect x="14" y="36" width="8" height="14" rx="2" fill={W} /><rect x="26" y="30" width="8" height="20" rx="2" fill={W} /><rect x="38" y="24" width="8" height="26" rx="2" fill={W} />
    <path d="M14 29l13-9 7 4 14-10" fill="none" stroke={W} strokeOpacity=".8" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M42 13h7v7" fill="none" stroke={W} strokeOpacity=".8" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
  </>),
  campaigns: () => (<>
    <path d="M13 27a4 4 0 0 1 4-4h6l18-10v38L23 41h-6a4 4 0 0 1-4-4z" fill={W} />
    <path d="M20 41h7l2 9h-6z" {...S} />
    <path d="M46 25l5-3M47 32h6M46 39l5 3" stroke={W} strokeWidth="3" strokeLinecap="round" />
  </>),
  studio: (c) => (<>
    <path d="M13 21v-6a2 2 0 0 1 2-2h6M43 13h6a2 2 0 0 1 2 2v6M51 43v6a2 2 0 0 1-2 2h-6M21 51h-6a2 2 0 0 1-2-2v-6" fill="none" stroke={W} strokeWidth="3.5" strokeLinecap="round" />
    <path d="M32 15l9 14-9 18-9-18z" fill={W} />
    <circle cx="32" cy="31" r="2.6" fill={c} /><path d="M32 33.5V47" stroke={c} strokeWidth="1.6" />
  </>),
  ask: (c) => (<>
    <path d="M12 22a8 8 0 0 1 8-8h24a8 8 0 0 1 8 8v13a8 8 0 0 1-8 8H27l-9 7v-7.3A8 8 0 0 1 12 35z" fill={W} />
    <path d="M32 19.5l2.6 6.4 6.4 2.6-6.4 2.6L32 37.5l-2.6-6.4-6.4-2.6 6.4-2.6z" fill={c} />
  </>),
  automations: (c) => (<>
    <circle cx="20" cy="19" r="6" fill={W} /><circle cx="20" cy="45" r="6" fill={W} />
    <path d="M26 19h6a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4h-6" fill="none" stroke={W} strokeOpacity=".8" strokeWidth="3.5" />
    <circle cx="43" cy="32" r="9.5" fill={W} />
    <path d="M44.5 25.5l-5 7.5h4.5l-1.5 6 5-7.5H43z" fill={c} />
  </>),
  radar: () => (<>
    <circle cx="32" cy="32" r="18" fill="none" stroke={W} strokeOpacity=".55" strokeWidth="2.5" />
    <circle cx="32" cy="32" r="10" fill="none" stroke={W} strokeOpacity=".55" strokeWidth="2.5" />
    <path d="M32 32V14a18 18 0 0 1 15.6 9z" fill={W} />
    <circle cx="40" cy="38" r="3" fill={W} /><circle cx="32" cy="32" r="3" fill={W} />
  </>),
  sonar: () => (<>
    <path d="M14 50a36 36 0 0 1 36-36v7a29 29 0 0 0-29 29z" {...S} fillOpacity={0.55} />
    <path d="M23 50a27 27 0 0 1 27-27v8a19 19 0 0 0-19 19z" {...S} fillOpacity={0.8} />
    <path d="M33 50a17 17 0 0 1 17-17v8a9 9 0 0 0-9 9z" fill={W} />
  </>),
  dashboard: () => (<>
    <rect x="13" y="13" width="17" height="21" rx="4" fill={W} /><rect x="34" y="13" width="17" height="12" rx="4" {...S} />
    <rect x="13" y="38" width="17" height="13" rx="4" {...S} /><rect x="34" y="29" width="17" height="22" rx="4" fill={W} />
  </>),
  knowledge: (c) => (<>
    <path d="M19 18h17l9 9v21a3 3 0 0 1-3 3H19a3 3 0 0 1-3-3V21a3 3 0 0 1 3-3z" {...S} transform="translate(-4 -4)" />
    <path d="M23 18h15l9 9v21a3 3 0 0 1-3 3H23a3 3 0 0 1-3-3V21a3 3 0 0 1 3-3z" fill={W} />
    <path d="M38 18v9h9" fill="none" stroke={c} strokeOpacity=".35" strokeWidth="2" />
    <rect x="25" y="34" width="16" height="3" rx="1.5" fill={c} opacity=".5" /><rect x="25" y="40" width="11" height="3" rx="1.5" fill={c} opacity=".5" />
  </>),
  tasks: (c) => (<>
    <rect x="12" y="15" width="12" height="34" rx="3" fill={W} /><rect x="26" y="15" width="12" height="34" rx="3" fill={W} /><rect x="40" y="15" width="12" height="34" rx="3" fill={W} />
    {[18, 32, 46].map((x) => <rect key={x} x={x - 3.5} y="22" width="7" height="2.6" rx="1.3" fill={c} opacity=".55" />)}
  </>),
  approvals: (c) => (<>
    <path d="M32 11l5 3.6 6.1-.2 1.9 5.8 5 3.6-1.9 5.8 1.9 5.8-5 3.6-1.9 5.8-6.1-.2L32 53l-5-3.6-6.1.2-1.9-5.8-5-3.6 1.9-5.8-1.9-5.8 5-3.6 1.9-5.8 6.1.2z" fill={W} />
    <path d="M24.5 32l5 5 10-10" fill="none" stroke={c} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
  </>),
  hr: () => (<>
    <circle cx="20" cy="25" r="5.5" {...S} /><circle cx="44" cy="25" r="5.5" {...S} />
    <path d="M9 45a11 11 0 0 1 20 0zM35 45a11 11 0 0 1 20 0z" {...S} />
    <circle cx="32" cy="22" r="7.5" fill={W} /><path d="M18 50a14 14 0 0 1 28 0z" fill={W} />
  </>),
  people: () => (<>
    <circle cx="24" cy="23" r="7" fill={W} /><path d="M11 48a13 13 0 0 1 26 0z" fill={W} />
    <circle cx="42" cy="25" r="6" {...S} /><path d="M33 48a11 11 0 0 1 20 0z" {...S} />
  </>),
  employee_portal: (c) => (<>
    <rect x="12" y="17" width="40" height="30" rx="5" fill={W} />
    <circle cx="24" cy="30" r="5" fill={c} opacity=".6" /><path d="M16.5 42a7.5 7.5 0 0 1 15 0z" fill={c} opacity=".6" />
    <rect x="35" y="27" width="12" height="3" rx="1.5" fill={c} opacity=".5" /><rect x="35" y="33" width="9" height="3" rx="1.5" fill={c} opacity=".5" />
  </>),
  settings: () => (<>
    <path d="M14 21h36M14 32h36M14 43h36" stroke={W} strokeOpacity=".7" strokeWidth="3.5" strokeLinecap="round" />
    <circle cx="38" cy="21" r="5.5" fill={W} /><circle cx="24" cy="32" r="5.5" fill={W} /><circle cx="42" cy="43" r="5.5" fill={W} />
  </>),
  apps: () => (<>
    <rect x="14" y="14" width="15" height="15" rx="4.5" fill={W} /><rect x="35" y="14" width="15" height="15" rx="4.5" {...S} />
    <rect x="14" y="35" width="15" height="15" rx="4.5" {...S} /><rect x="35" y="35" width="15" height="15" rx="4.5" fill={W} />
  </>),
  notifications: () => (<>
    <path d="M32 12a13 13 0 0 1 13 13v9l4 7H15l4-7v-9a13 13 0 0 1 13-13z" fill={W} />
    <path d="M26.5 45a5.5 5.5 0 0 0 11 0z" {...S} />
  </>),
  platform: () => (<>
    <circle cx="32" cy="32" r="18" fill="none" stroke={W} strokeWidth="3.5" />
    <path d="M14 32h36M32 14c6 5 6 31 0 36M32 14c-6 5-6 31 0 36" fill="none" stroke={W} strokeOpacity=".75" strokeWidth="3" />
  </>),
  wrench: () => (<>
    <path d="M45 13a11 11 0 0 0-10.5 14.3L14.6 47.2a4.4 4.4 0 0 0 6.2 6.2l19.9-19.9A11 11 0 0 0 52 20.4l-6.3 4.5-5.4-1.3-1.3-5.4 4.5-6.3z" fill={W} />
  </>),
  truck: (c) => (<>
    <rect x="11" y="18" width="27" height="22" rx="3" fill={W} />
    <path d="M38 25h8l8 9v6H38z" {...S} />
    <circle cx="20" cy="43" r="5.5" fill={W} stroke={c} strokeWidth="2.5" /><circle cx="45" cy="43" r="5.5" fill={W} stroke={c} strokeWidth="2.5" />
  </>),
  clipboard: (c) => (<>
    <rect x="16" y="15" width="32" height="37" rx="5" fill={W} />
    <rect x="24" y="11" width="16" height="8" rx="3" {...S} />
    <path d="M23 30l3 3 5-6M23 41l3 3 5-6" fill="none" stroke={c} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="34" y="29" width="9" height="3" rx="1.5" fill={c} opacity=".5" /><rect x="34" y="40" width="9" height="3" rx="1.5" fill={c} opacity=".5" />
  </>),
  calendar: (c) => (<>
    <rect x="13" y="16" width="38" height="35" rx="6" fill={W} />
    <path d="M13 22a6 6 0 0 1 6-6h26a6 6 0 0 1 6 6v4H13z" {...S} />
    <rect x="21" y="11" width="4" height="9" rx="2" fill={W} /><rect x="39" y="11" width="4" height="9" rx="2" fill={W} />
    {[20, 29, 38].flatMap((x) => [32, 41].map((y) => <rect key={`${x}-${y}`} x={x} y={y} width="6" height="5" rx="1.2" fill={c} opacity=".6" />))}
  </>),
  flask: (c) => (<>
    <path d="M26 12h12v13l12 20a4 4 0 0 1-3.4 6H17.4a4 4 0 0 1-3.4-6l12-20z" fill={W} />
    <path d="M18.5 40h27l4.5 6a4 4 0 0 1-3.4 5H17.4a4 4 0 0 1-3.4-5z" fill={c} opacity=".35" />
  </>),
};

function AreaIcon({ name }: { name: string }) {
  const fam = familyOf(name);
  const f = FAMILIES[fam];
  const g = `wz-${fam}`;
  return (
    <g className="ic-area">
      <defs>
        <linearGradient id={`${g}-bg`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor={f.light} />
          <stop offset=".55" stopColor={f.base} />
          <stop offset="1" stopColor={f.dark} />
        </linearGradient>
        <linearGradient id={`${g}-gloss`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".42" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="15" fill={`url(#${g}-bg)`} />
      <path d="M16 1h32a15 15 0 0 1 15 15v6C50 30 14 30 1 22v-6A15 15 0 0 1 16 1z" fill={`url(#${g}-gloss)`} />
      <rect x="1.6" y="1.6" width="60.8" height="60.8" rx="14.4" fill="none" stroke="#fff" strokeOpacity=".28" strokeWidth="1.2" />
      <g className="ic-glyph">{(GLYPHS[name] ?? GLYPHS.apps)(f.dark)}</g>
    </g>
  );
}

export const APP_ICON_NAMES = Object.keys(ICONS);

export type IconPack = "area" | "duo" | "line" | "glyph";

/**
 * Ícono de app. El paquete (Workezt 3D por área, duotono, lineal o sólido) lo define el tema de la organización
 * (atributo data-icons en el lienzo); `pack` lo fija para una vista previa.
 */
export function AppIcon({ name, size = 56, pack }: { name: string; size?: number; pack?: IconPack }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="app-icon" data-pack={pack} style={{ isolation: "isolate" }}>
      <AreaIcon name={name} />
      <rect className="ic-bg" x="0" y="0" width="64" height="64" rx="16" />
      <g className="ic-shapes">{ICONS[name] ?? <rect x="10" y="10" width="44" height="44" rx="12" fill={C.violet} />}</g>
    </svg>
  );
}
