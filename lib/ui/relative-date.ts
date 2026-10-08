/** Fecha relativa estilo Odoo: Hoy, Mañana, Ayer, Anteayer, Hace 5 días, En 3 días. */
export function relativeDay(d: Date | null | undefined) {
  if (!d) return { label: "", past: false, today: false };
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(d); b.setHours(0, 0, 0, 0);
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
  const label = diff === 0 ? "Hoy" : diff === 1 ? "Mañana" : diff === -1 ? "Ayer" : diff === -2 ? "Anteayer" : diff < 0 ? `Hace ${-diff} días` : diff <= 7 ? `En ${diff} días` : b.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
  return { label, past: diff < 0, today: diff === 0 };
}
