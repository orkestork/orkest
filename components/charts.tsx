"use client";

import { useState } from "react";

/**
 * Gráficos SVG livianos para tableros.
 * Especificaciones: grid hairline recesivo, línea 2px, relleno 10%, barras ≤ 24px con
 * punta redondeada de 4px anclada a la base, marcadores ≥ 8px con anillo de superficie,
 * leyenda solo con ≥ 2 series, texto en tokens de tinta (nunca del color de la serie),
 * crosshair + tooltip al pasar el cursor.
 */
type Series = { name: string; color: string; values: number[]; colors?: string[] };
type Props = { labels: string[]; series: Series[]; format: "money" | "number"; height?: number };

const W = 760, PAD = { l: 64, r: 16, t: 16, b: 34 };
import { compactCop } from "@/lib/ui/format";
const full = (v: number, f: Props["format"]) => (f === "money" ? v.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }) : v.toLocaleString("es-CO", { maximumFractionDigits: 1 }));
const short = (v: number, f: Props["format"]) => compactCop(v, f === "money");

function niceTicks(max: number, count = 4) {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

function Frame({ ticks, y, height, children, labels, x, hover, onHover, tooltip, format }: {
  ticks: number[]; y: (v: number) => number; height: number; children: React.ReactNode; labels: string[];
  x: (i: number) => number; hover: number | null; onHover: (i: number | null) => void; tooltip: React.ReactNode; format: Props["format"];
}) {
  const step = labels.length > 1 ? x(1) - x(0) : W - PAD.l - PAD.r;
  const every = Math.ceil(labels.length / 8);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" onMouseLeave={() => onHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#e7e2da" strokeWidth="1" />
            <text x={PAD.l - 10} y={y(t) + 4} textAnchor="end" className="fill-stone-500 text-[11px]">{t === 0 ? "0" : short(t, format)}</text>
          </g>
        ))}
        {children}
        {labels.map((l, i) => i % every === 0 && (
          <text key={i} x={x(i)} y={height - 10} textAnchor={i === labels.length - 1 && labels.length > 1 && x(i) > W - PAD.r - 30 ? "end" : i === 0 && x(i) < PAD.l + 30 ? "start" : "middle"} className="fill-stone-500 text-[11px]">{l}</text>
        ))}
        {labels.map((_, i) => (
          <rect key={i} x={x(i) - step / 2} y={PAD.t} width={step} height={height - PAD.t - PAD.b} fill="transparent" onMouseEnter={() => onHover(i)} />
        ))}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${x(hover) > W * 0.65 ? "-105%" : "8px"})` }}>
          {tooltip}
        </div>
      )}
    </div>
  );
}

function Tip({ label, series, i, format }: { label: string; series: Series[]; i: number; format: Props["format"] }) {
  return (
    <>
      <p className="mb-1 font-semibold text-stone-800">{label}</p>
      {series.map((s) => (
        <p key={s.name} className="flex items-center justify-between gap-4 text-stone-600">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.colors?.[i] ?? s.color }} />{s.name}</span>
          <span className="font-medium tabular-nums text-stone-900">{full(s.values[i] ?? 0, format)}</span>
        </p>
      ))}
    </>
  );
}

export function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-4 text-xs text-stone-600">
      {series.map((s) => <span key={s.name} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: s.color, height: 3 }} />{s.name}</span>)}
    </div>
  );
}

export function AreaChart({ labels, series, format, height = 300 }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const y = (v: number) => PAD.t + (1 - v / top) * (height - PAD.t - PAD.b);
  const x = (i: number) => (labels.length === 1 ? (PAD.l + W - PAD.r) / 2 : PAD.l + (i * (W - PAD.l - PAD.r)) / (labels.length - 1));
  return (
    <Frame ticks={ticks} y={y} x={x} height={height} labels={labels} hover={hover} onHover={setHover} format={format}
      tooltip={hover !== null && <Tip label={labels[hover]} series={series} i={hover} format={format} />}>
      {series.map((s) => {
        const pts = s.values.map((v, i) => `${x(i)},${y(v)}`);
        return (
          <g key={s.name}>
            <path d={`M${x(0)},${y(0)} L${pts.join(" L")} L${x(s.values.length - 1)},${y(0)} Z`} fill={s.color} opacity="0.1" />
            <polyline points={pts.join(" ")} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </g>
        );
      })}
      {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={height - PAD.b} stroke="#a39a8e" strokeWidth="1" />}
      {series.map((s) => s.values.map((v, i) => (
        <circle key={`${s.name}${i}`} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 4} fill={s.color} stroke="#fff" strokeWidth="2" />
      )))}
    </Frame>
  );
}

export function BarChart({ labels, series, format, height = 300 }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const y = (v: number) => PAD.t + (1 - v / top) * (height - PAD.t - PAD.b);
  const band = (W - PAD.l - PAD.r) / Math.max(labels.length, 1);
  const x = (i: number) => PAD.l + band * i + band / 2;
  const bw = Math.min(24, (band * 0.7) / series.length);
  const gap = 2;
  return (
    <Frame ticks={ticks} y={y} x={x} height={height} labels={labels} hover={hover} onHover={setHover} format={format}
      tooltip={hover !== null && <Tip label={labels[hover]} series={series} i={hover} format={format} />}>
      {hover !== null && <rect x={x(hover) - band / 2} y={PAD.t} width={band} height={height - PAD.t - PAD.b} fill="#f2eee8" />}
      {labels.map((_, i) => series.map((s, k) => {
        const v = s.values[i] ?? 0;
        const h = Math.max(0, y(0) - y(v));
        const bx = x(i) - (series.length * bw + (series.length - 1) * gap) / 2 + k * (bw + gap);
        const r = Math.min(4, h, bw / 2);
        // Punta redondeada arriba, base recta
        const d = h <= 0 ? "" : `M${bx},${y(0)} V${y(v) + r} Q${bx},${y(v)} ${bx + r},${y(v)} H${bx + bw - r} Q${bx + bw},${y(v)} ${bx + bw},${y(v) + r} V${y(0)} Z`;
        const showLabel = series.length === 1 && labels.length <= 8 && v > 0;
        return d && (
          <g key={`${i}${k}`}>
            <path d={d} fill={s.colors?.[i] ?? s.color} />
            {showLabel && <text x={bx + bw / 2} y={y(v) - 6} textAnchor="middle" className="fill-stone-700 text-[11px] font-medium">{short(v, format)}</text>}
          </g>
        );
      }))}
    </Frame>
  );
}
