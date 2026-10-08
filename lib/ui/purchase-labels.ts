export const RECEIPT_STATUS: Record<string, { label: string; tone: string }> = {
  none: { label: "Sin recibir", tone: "slate" }, partial: { label: "Recibida parcial", tone: "amber" }, full: { label: "Recibida", tone: "emerald" },
};
export const BILL_STATUS: Record<string, { label: string; tone: string }> = {
  none: { label: "Sin facturar", tone: "slate" }, partial: { label: "Facturada parcial", tone: "amber" }, billed: { label: "Facturada", tone: "emerald" },
};
