"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Markdown } from "@/components/markdown";
import { askOrkest } from "./actions";

type Msg = { role: "user" | "assistant"; text: string; tools?: string[]; error?: boolean };
const STORE = "ask-orkest-chat";

const TOOL_LABEL: Record<string, string> = {
  ventas_resumen: "Ventas", buscar_pedidos: "Pedidos", ver_pedido: "Pedido", cliente_resumen: "Clientes", productos_buscar: "Productos",
  compras_buscar: "Compras", produccion_resumen: "Producción", stock_risk: "Stock", overdue_receivables: "Cartera", sales_this_month: "Facturación",
  opportunities_followup: "Oportunidades", supplier_nonconformities: "Calidad", radar_summary: "Radar",
};

export function AskChat({ examples, orgName, smart }: { examples: string[]; orgName: string; smart: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  // La conversación se recuerda en este navegador (solo comodidad; nada se guarda en el servidor)
  // Se lee tras montar (no en el render) para que el HTML del servidor y el del navegador coincidan
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { try { const s = sessionStorage.getItem(STORE); if (s) setMsgs(JSON.parse(s)); } catch { /* sin almacenamiento */ } }, []);
  useEffect(() => { try { sessionStorage.setItem(STORE, JSON.stringify(msgs.slice(-30))); } catch { /* opcional */ } end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, pending]);

  const send = (q: string) => {
    const question = q.trim();
    if (!question || pending) return;
    const history = msgs.filter((m) => !m.error).map((m) => ({ role: m.role, text: m.text }));
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setText("");
    start(async () => {
      try {
        const r = await askOrkest(history, question);
        setMsgs((m) => [...m, { role: "assistant", text: r.text, tools: r.tools, error: r.error }]);
      } catch {
        setMsgs((m) => [...m, { role: "assistant", text: "No pude completar la consulta. Intenta de nuevo.", error: true }]);
      }
      input.current?.focus();
    });
  };

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-3xl flex-col">
      <div className="flex-1 space-y-5 pb-6">
        {msgs.length === 0 && (
          <div className="pt-8 text-center">
            <p className="font-display text-4xl uppercase tracking-tight text-[var(--ork-purple)]">¿Qué quieres saber?</p>
            <p className="mt-2 text-sm text-stone-600">Pregunta en lenguaje natural sobre los datos de {orgName}. Solo verás lo que tu rol puede consultar.</p>
            {!smart && <p className="mx-auto mt-3 max-w-md rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Modo básico: falta conectar la IA (ANTHROPIC_API_KEY). Por ahora solo responde preguntas frecuentes.</p>}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {examples.map((e) => <button key={e} type="button" onClick={() => send(e)} className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:border-[var(--ork-violet)] hover:text-[var(--ork-violet)]">{e}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) => m.role === "user" ? (
          <div key={i} className="flex justify-end"><p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--ork-purple)] px-4 py-2.5 text-[15px] text-white">{m.text}</p></div>
        ) : (
          <div key={i} className={`rounded-2xl border bg-white px-5 py-4 shadow-sm ${m.error ? "border-rose-200" : "border-[var(--ork-rule)]"}`}>
            <Markdown text={m.text} />
            {m.tools && m.tools.length > 0 && <p className="mt-3 border-t border-stone-100 pt-2 text-[11px] text-stone-500">Consultado: {m.tools.map((t) => TOOL_LABEL[t] ?? t).join(" · ")}</p>}
          </div>
        ))}
        {pending && <div className="flex items-center gap-2 px-2 text-sm text-stone-500" aria-live="polite"><span className="h-2 w-2 animate-pulse rounded-full bg-[var(--ork-violet)]" />Consultando tus datos…</div>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="sticky bottom-4 flex items-end gap-2 rounded-2xl border border-stone-300 bg-white p-2 shadow-lg focus-within:border-[var(--ork-violet)]">
        <textarea ref={input} value={text} onChange={(e) => setText(e.target.value)} rows={1} autoFocus placeholder="Pregunta algo sobre tu empresa…" aria-label="Pregunta"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
          className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none" />
        {msgs.length > 0 && <button type="button" onClick={() => { setMsgs([]); try { sessionStorage.removeItem(STORE); } catch { /* opcional */ } }} className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100">Nueva</button>}
        <button disabled={pending || !text.trim()} className="rounded-xl bg-[var(--ork-purple)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Preguntar</button>
      </form>
    </div>
  );
}
