export const DELIVERY_STATUS: Record<string, { label: string; tone: string }> = {
  none: { label: "Sin entregar", tone: "slate" }, partial: { label: "Entrega parcial", tone: "amber" }, full: { label: "Entregado", tone: "emerald" },
};
export const INVOICE_STATUS: Record<string, { label: string; tone: string }> = {
  none: { label: "Nada por facturar", tone: "slate" }, to_invoice: { label: "Por facturar", tone: "amber" }, partial: { label: "Facturado parcial", tone: "blue" }, invoiced: { label: "Facturado", tone: "emerald" },
};
