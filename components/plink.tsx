import NextLink from "next/link";
import type { ComponentProps } from "react";
import { getContext } from "@/lib/core/context";
import { canOpen } from "@/lib/core/route-permissions";

/**
 * Enlace consciente de permisos (componente de servidor): si el usuario no puede
 * abrir el destino, se muestra solo el contenido, sin enlace. Evita "enlaces trampa"
 * que terminan en "sin permiso" y no revela rutas a las que no tiene acceso.
 */
export default async function Link(props: ComponentProps<typeof NextLink>) {
  const href = typeof props.href === "string" ? props.href : props.href.pathname ?? "/";
  const ctx = await getContext();
  if (ctx && !canOpen(ctx, href)) {
    return <span className={props.className?.replace(/hover:\S+|underline|cursor-pointer/g, "")}>{props.children}</span>;
  }
  return <NextLink {...props} />;
}
