import { unstable_rethrow } from "next/navigation";
import type { ActionResult } from "@/components/action-form";

/** Convierte excepciones (validación, permisos) en un resultado mostrable por ActionForm. */
export async function safeAction(fn: () => Promise<ActionResult | void>): Promise<ActionResult> {
  try {
    return (await fn()) ?? undefined;
  } catch (e) {
    unstable_rethrow(e);
    const err = e as Error & { errors?: Record<string, string>; code?: string; name?: string };
    // Errores de base de datos: nunca se muestran crudos al usuario
    if (err.name?.startsWith("PrismaClient")) {
      if (err.code === "P2025") return { error: "Registro no encontrado o no pertenece a tu organización" };
      if (err.code === "P2002") return { error: "Ya existe un registro con esos datos (valor duplicado)" };
      console.error("[ORKEST] Error de base de datos en acción:", err);
      return { error: "No se pudo completar la operación. Intenta de nuevo; si persiste, contacta al administrador." };
    }
    if (err.errors) {
      const values = Object.values(err.errors);
      return { error: values.length === 1 ? values[0] : "Revisa los datos ingresados", errors: values.length > 1 ? err.errors : undefined };
    }
    return { error: err.message };
  }
}
