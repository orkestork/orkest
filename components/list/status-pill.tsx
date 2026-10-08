/** Píldora de estado sólida (estilo Odoo) con contraste AA en ambos sentidos. */
const SOLID: Record<string, string> = {
  slate: "bg-stone-500 text-white", blue: "bg-blue-600 text-white", indigo: "bg-indigo-600 text-white",
  violet: "bg-[var(--ork-violet)] text-white", emerald: "bg-emerald-600 text-white", amber: "bg-amber-400 text-stone-900",
  rose: "bg-rose-600 text-white", cyan: "bg-cyan-600 text-white",
};
export function StatusPill({ label, tone = "slate" }: { label: string; tone?: string }) {
  return <span className={`inline-block max-w-full truncate whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${SOLID[tone] ?? SOLID.slate}`}>{label}</span>;
}

export function Avatar({ name, size = 22, label = true }: { name?: string | null; size?: number; label?: boolean }) {
  if (!name) return <span className="text-stone-400">—</span>;
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const hues = ["#6f35b5", "#e31572", "#1fc7b6", "#e8a33a", "#32125e", "#3b82f6"];
  const bg = hues[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % hues.length];
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="grid shrink-0 place-items-center rounded-full text-[9px] font-bold text-white" style={{ width: size, height: size, background: bg }}>{initials}</span>
      {label && <span className="truncate">{name}</span>}
    </span>
  );
}
