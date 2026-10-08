/** Miniatura de producto (sin foto): iniciales sobre un tono derivado de la categoría. */
const TONES = ["#6f35b5", "#e31572", "#1fc7b6", "#e8a33a", "#32125e", "#3b82f6", "#16a34a"];
export function ProductThumb({ name, category, size = 56 }: { name: string; category?: string | null; size?: number }) {
  const key = category ?? name;
  const bg = TONES[[...key].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length];
  const initials = name.split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || name.slice(0, 2).toUpperCase();
  return (
    <span className="grid shrink-0 place-items-center rounded-xl font-semibold text-white" style={{ width: size, height: size, background: `linear-gradient(135deg, ${bg}, ${bg}cc)`, fontSize: size * 0.32 }} aria-hidden="true">
      {initials}
    </span>
  );
}
