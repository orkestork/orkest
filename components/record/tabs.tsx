"use client";

import { useState, type ReactNode } from "react";

export function Tabs({ tabs }: { tabs: { key: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  return (
    <div>
      <div role="tablist" className="flex gap-1 border-b border-stone-200">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={active === t.key} onClick={() => setActive(t.key)}
            className={`-mb-px rounded-t-lg border px-4 py-2 text-sm ${active === t.key ? "border-stone-200 border-b-white bg-white font-semibold text-stone-900" : "border-transparent text-stone-600 hover:text-stone-900"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => <div key={t.key} role="tabpanel" hidden={active !== t.key} className="pt-5">{t.content}</div>)}
    </div>
  );
}
