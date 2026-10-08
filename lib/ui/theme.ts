/**
 * Apariencia por organización (se guarda en Organization.branding.theme).
 * Todo se aplica con variables CSS sobre el lienzo de la app, así que no hay estilos por cliente en el código.
 */
export type IconPack = "duo" | "line" | "glyph";
export type IconPalette = "ork" | "ocean" | "forest" | "sunset" | "brand";
export type Theme = {
  primary: string; accent: string; highlight: string; soft: string; background: string; text: string;
  canvas: "orbs" | "plain" | "dots";
  tiles: "card" | "tinted" | "flat";
  iconPack: IconPack;
  iconPalette: IconPalette;
};

export const DEFAULT_THEME: Theme = {
  primary: "#32125e", accent: "#6f35b5", highlight: "#e31572", soft: "#bda5ff", background: "#f7f1e7", text: "#11100f",
  canvas: "orbs", tiles: "card", iconPack: "duo", iconPalette: "ork",
};

/** Temas listos para aplicar con un clic. */
export const PRESETS: { key: string; name: string; theme: Theme }[] = [
  { key: "ork", name: "OR-K (predeterminado)", theme: DEFAULT_THEME },
  { key: "ocean", name: "Océano", theme: { primary: "#0b2545", accent: "#1d6fb8", highlight: "#ff6b4a", soft: "#9cc9f0", background: "#f3f7fb", text: "#0d1b2a", canvas: "orbs", tiles: "card", iconPack: "duo", iconPalette: "ocean" } },
  { key: "forest", name: "Bosque", theme: { primary: "#1f3d2b", accent: "#2f7d4f", highlight: "#e0a526", soft: "#a8d5b5", background: "#f5f6ef", text: "#14201a", canvas: "plain", tiles: "tinted", iconPack: "duo", iconPalette: "forest" } },
  { key: "sunset", name: "Atardecer", theme: { primary: "#4a1d2f", accent: "#c2410c", highlight: "#db2777", soft: "#fdba74", background: "#fff7ed", text: "#1c1210", canvas: "orbs", tiles: "card", iconPack: "glyph", iconPalette: "sunset" } },
  { key: "graphite", name: "Grafito", theme: { primary: "#1f2328", accent: "#3b5bdb", highlight: "#e8590c", soft: "#c5cbd3", background: "#f6f7f9", text: "#111418", canvas: "dots", tiles: "flat", iconPack: "line", iconPalette: "brand" } },
];

/** Paletas de los íconos duotono: 7 tonos por paleta. "brand" se deriva de los colores del tema. */
export const ICON_PALETTES: { key: IconPalette; name: string; colors?: Record<"deep" | "violet" | "lav" | "pink" | "lime" | "amber" | "teal", string> }[] = [
  { key: "ork", name: "OR-K", colors: { deep: "#32125e", violet: "#6f35b5", lav: "#bda5ff", pink: "#e31572", lime: "#b6ff5c", amber: "#ffb547", teal: "#1fc7b6" } },
  { key: "ocean", name: "Océano", colors: { deep: "#0b2545", violet: "#1d6fb8", lav: "#9cc9f0", pink: "#ff6b4a", lime: "#7ee8c4", amber: "#ffd166", teal: "#06aed5" } },
  { key: "forest", name: "Bosque", colors: { deep: "#1f3d2b", violet: "#2f7d4f", lav: "#a8d5b5", pink: "#d1495b", lime: "#c5e063", amber: "#e0a526", teal: "#3fa7a3" } },
  { key: "sunset", name: "Atardecer", colors: { deep: "#4a1d2f", violet: "#c2410c", lav: "#fdba74", pink: "#db2777", lime: "#fde047", amber: "#fb923c", teal: "#14b8a6" } },
  { key: "brand", name: "De mi marca" },
];

const HEX = /^#[0-9a-f]{6}$/i;
const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);

/** Normaliza lo guardado (o lo enviado) a un tema válido. */
export function normalizeTheme(raw: unknown, fallbackPrimary?: string): Theme {
  const r = (raw ?? {}) as Partial<Theme>;
  const color = (k: keyof Theme) => (typeof r[k] === "string" && HEX.test(r[k] as string) ? (r[k] as string) : (DEFAULT_THEME[k] as string));
  return {
    primary: typeof r.primary === "string" && HEX.test(r.primary) ? r.primary : fallbackPrimary && HEX.test(fallbackPrimary) ? fallbackPrimary : DEFAULT_THEME.primary,
    accent: color("accent"), highlight: color("highlight"), soft: color("soft"), background: color("background"), text: color("text"),
    canvas: pick(r.canvas, ["orbs", "plain", "dots"] as const, "orbs"),
    tiles: pick(r.tiles, ["card", "tinted", "flat"] as const, "card"),
    iconPack: pick(r.iconPack, ["duo", "line", "glyph"] as const, "duo"),
    iconPalette: pick(r.iconPalette, ["ork", "ocean", "forest", "sunset", "brand"] as const, "ork"),
  };
}

/** Variables CSS del tema para el lienzo de la app. */
export function themeVars(t: Theme): Record<string, string> {
  const p = ICON_PALETTES.find((x) => x.key === t.iconPalette)?.colors;
  const ic = p ?? {
    deep: t.primary, violet: t.accent, lav: t.soft, pink: t.highlight,
    lime: `color-mix(in srgb, ${t.soft} 55%, #fff)`, amber: `color-mix(in srgb, ${t.highlight} 45%, ${t.soft})`, teal: `color-mix(in srgb, ${t.accent} 60%, ${t.soft})`,
  };
  return {
    "--ork-purple": t.primary, "--ork-violet": t.accent, "--ork-pink": t.highlight, "--ork-lavender": t.soft,
    "--ork-paper-light": t.background, "--ork-paper": `color-mix(in srgb, ${t.background} 88%, ${t.text})`, "--ork-ink": t.text,
    "--brand": t.primary, "--org": t.accent,
    "--ic-deep": ic.deep, "--ic-violet": ic.violet, "--ic-lav": ic.lav, "--ic-pink": ic.pink, "--ic-lime": ic.lime, "--ic-amber": ic.amber, "--ic-teal": ic.teal,
    "--ic-line": t.primary, "--ic-tile": t.accent,
    color: t.text,
  };
}

/** Contraste WCAG entre dos colores hex (para avisar si el texto de los botones no se lee). */
export function contrast(a: string, b: string) {
  const lum = (h: string) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
