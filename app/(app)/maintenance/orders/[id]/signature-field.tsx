"use client";

import { useRef, useState } from "react";

/** Campo de firma (mouse, touch o lápiz): envía el PNG como data URL en un input oculto `name`. */
export function SignatureField({ name, label }: { name: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [value, setValue] = useState("");

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * e.currentTarget.width) / r.width, y: ((e.clientY - r.top) * e.currentTarget.height) / r.height };
  };
  const pen = (c: HTMLCanvasElement) => {
    const g = c.getContext("2d")!;
    g.lineWidth = 2.5; g.lineCap = "round"; g.strokeStyle = "#11100f";
    return g;
  };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = pen(e.currentTarget);
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = point(e);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 0.01, y); g.stroke();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const g = e.currentTarget.getContext("2d")!;
    const { x, y } = point(e);
    g.lineTo(x, y); g.stroke();
  };
  const end = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    setValue(e.currentTarget.toDataURL("image/png"));
  };
  const clear = () => {
    const c = ref.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setValue("");
  };

  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <canvas ref={ref} width={600} height={200} aria-label={label} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
        className="h-32 w-full touch-none rounded-xl border border-dashed border-slate-300 bg-white" />
      <input type="hidden" name={name} value={value} />
      <button type="button" onClick={clear} className="mt-1 text-xs font-medium text-slate-500 hover:text-[var(--ork-violet)]">Limpiar firma</button>
    </div>
  );
}
