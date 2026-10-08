import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/core/context";
import { AskChat } from "./chat";

export const metadata = { title: "Ask ORKEST" };

export default async function Ask() {
  const ctx = await requirePermission("intelligence.ask");
  if (!ctx.flags.has("intelligence.ask")) notFound();
  const smart = !!process.env.ANTHROPIC_API_KEY;
  const examples = smart
    ? ["¿Cuánto vendimos este mes y cómo vamos frente al anterior?", "Top 10 clientes del año", "¿Qué vendedor vendió más en septiembre?", "¿Qué productos están por debajo del mínimo?", "Pedidos por facturar de más de $1.000.000", "¿Cuánto hemos producido este mes por producto?"]
    : ["¿Cuánto vendimos este mes?", "¿Qué productos tienen riesgo de agotarse?", "¿Cuánto tenemos en cartera vencida?"];
  return <AskChat examples={examples} orgName={ctx.org.name} smart={smart} />;
}
