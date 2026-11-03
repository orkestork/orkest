"use client";

import { useState, type ReactNode } from "react";

/** Secciones de una ficha como control segmentado (pastillas). */
export function Tabs({ tabs }: { tabs: { key: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  return (
    <div>
      <div role="tablist" className="inline-flex flex-wrap gap-1 rounded-full bg-stone-100 p-1">
        {tabs.map((t) => (
          <button key={t.key} role="tab" type="button" aria-selected={active === t.key} onClick={() => setActive(t.key)}
            className={`rounded-full px-4 py-1.5 text-sm transition ${active === t.key ? "bg-white font-semibold text-[var(--ork-purple)] shadow-sm" : "text-stone-600 hover:text-stone-900"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => <div key={t.key} role="tabpanel" hidden={active !== t.key} className="pt-5">{t.content}</div>)}
    </div>
  );
}
