import { requireModule } from "@/lib/core/context";
import { TicketView } from "../_view";

export const metadata = { title: "Solicitud" };

export default async function TicketPage({ params }: PageProps<"/hr/tickets/[id]">) {
  const ctx = await requireModule("hr", "hr.tickets.read");
  const { id } = await params;
  return <TicketView ctx={ctx} id={id} back={{ label: "Centro de solicitudes", href: "/hr/tickets" }} />;
}
