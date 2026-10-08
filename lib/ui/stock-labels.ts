export const TRANSFER_STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Borrador", tone: "slate" }, waiting: { label: "En espera", tone: "amber" }, ready: { label: "Listo", tone: "blue" },
  done: { label: "Hecho", tone: "emerald" }, canceled: { label: "Cancelado", tone: "rose" },
};
export const OP_KIND: Record<string, string> = { RECEIPT: "Recepción", INTERNAL: "Traslado interno", DELIVERY: "Entrega", MANUFACTURING: "Fabricación" };
export const RULE_ACTION: Record<string, string> = { BUY: "Comprar", MANUFACTURE: "Fabricar", TRANSFER: "Traer de otra bodega" };
