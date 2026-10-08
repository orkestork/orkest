"use server";

import Anthropic from "@anthropic-ai/sdk";
import { actionContext } from "@/lib/core/context";
import { askClaude, ASK_MODEL, type ChatTurn } from "@/lib/intelligence/agent";
import { ask } from "@/lib/intelligence/tools";

export type AskResult = { text: string; tools: string[]; mode: "claude" | "basic"; error?: boolean };

/** Pregunta a Ask ORKEST. Con ANTHROPIC_API_KEY usa Claude; sin ella, el planificador básico por palabras clave. */
export async function askOrkest(history: ChatTurn[], question: string): Promise<AskResult> {
  const ctx = await actionContext("intelligence.ask");
  if (!ctx.flags.has("intelligence.ask")) throw new Error("Ask ORKEST no está habilitado");
  const q = question.trim().slice(0, 2000);
  if (!q) return { text: "Escribe una pregunta.", tools: [], mode: "basic" };

  if (!process.env.ANTHROPIC_API_KEY) {
    const r = await ask(ctx, q);
    const table = r.table?.rows.length ? `\n\n| ${r.table.columns.join(" | ")} |\n|${r.table.columns.map(() => "---").join("|")}|\n${r.table.rows.map((row) => `| ${row.join(" | ")} |`).join("\n")}` : "";
    const links = r.links?.length ? `\n\n${r.links.map((l) => `[${l.label}](${l.href})`).join(" · ")}` : "";
    return { text: r.answer + table + links, tools: r.tool ? [r.tool] : [], mode: "basic" };
  }

  try {
    const reply = await askClaude(ctx, history.filter((t) => t.text).slice(-10), q);
    await ctx.db.auditLog.create({ data: { organizationId: ctx.orgId, actorId: ctx.user.id, action: "IntelligenceQuery", entityType: "intelligence", changes: { question: q, tools: reply.tools, model: ASK_MODEL } } });
    return { ...reply, mode: "claude" };
  } catch (e) {
    console.error("[ask]", e);
    if (e instanceof Anthropic.AuthenticationError) return { text: "La clave de Anthropic no es válida. Revisa ANTHROPIC_API_KEY.", tools: [], mode: "claude", error: true };
    if (e instanceof Anthropic.RateLimitError) return { text: "Hay muchas consultas en este momento. Intenta de nuevo en unos segundos.", tools: [], mode: "claude", error: true };
    if (e instanceof Anthropic.APIError) return { text: `El servicio de IA respondió con un error (${e.status ?? "conexión"}). Intenta de nuevo.`, tools: [], mode: "claude", error: true };
    return { text: "No pude completar la consulta. Intenta reformularla.", tools: [], mode: "claude", error: true };
  }
}
