/**
 * Logotipo Workezt: la "W" de dos cintas violetas + el nombre en minúscula.
 * Reconstruido en SVG a partir de la propuesta de diseño (26 oct 2026); reemplazar por el vector oficial cuando exista.
 */
export function WorkeztMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 40" width={(size * 64) / 40} height={size} aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="wz-mark-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9b6bff" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id="wz-mark-b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6d28d9" />
          <stop offset="1" stopColor="#4c1d95" />
        </linearGradient>
      </defs>
      <path d="M7 8l11 24 9-19" fill="none" stroke="url(#wz-mark-a)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M27 13l10 19 18-24" fill="none" stroke="url(#wz-mark-b)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WorkeztLogo({ size = 26, tone = "dark", byOrk = false }: { size?: number; tone?: "dark" | "light"; byOrk?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2" aria-label="Workezt by OR-K">
      <WorkeztMark size={size * 0.9} />
      <span className="font-display font-bold leading-none tracking-[-0.03em]" style={{ fontSize: size, color: tone === "dark" ? "var(--ork-ink)" : "#fff" }}>workezt</span>
      {byOrk && (
        <span className="ml-1 hidden items-center gap-1 text-[10px] font-medium text-stone-500 sm:inline-flex">
          by
          {/* eslint-disable-next-line @next/next/no-img-element -- logo estático de la marca madre */}
          <img src={tone === "dark" ? "/brand/ork-logo-violet.png" : "/brand/ork-logo-white.png"} alt="OR-K" className="h-3.5 w-auto" />
        </span>
      )}
    </span>
  );
}
