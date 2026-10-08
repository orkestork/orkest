export const money = (v: unknown, currency = "COP") =>
  Number(v ?? 0).toLocaleString("es-CO", { style: "currency", currency, maximumFractionDigits: 0 });
export const num = (v: unknown) => Number(v ?? 0).toLocaleString("es-CO");
export const date = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const dateTime = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
export const ago = (d: Date | string) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "hace un momento";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
};

/** Compacto para COP: $3.728 M · $850 mil · $12 M. */
export const compactCop = (v: number, sign = true) => {
  const a = Math.abs(v), s = sign ? "$" : "";
  if (a >= 1e6) return `${s}${(v / 1e6).toLocaleString("es-CO", { maximumFractionDigits: a >= 1e8 ? 0 : 1 })} M`;
  if (a >= 1e3) return `${s}${(v / 1e3).toLocaleString("es-CO", { maximumFractionDigits: 0 })} mil`;
  return `${s}${v.toLocaleString("es-CO", { maximumFractionDigits: 1 })}`;
};
