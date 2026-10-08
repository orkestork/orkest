import type { ExecContext } from "@/lib/core/context";
import { registerPayment as pay } from "./invoicing";

/** Compatibilidad: abono a factura de cliente con el diario de banco por defecto. */
export async function registerPayment(ctx: ExecContext, invoiceId: string, amount: number) {
  await pay(ctx, { invoiceId, amount });
}
