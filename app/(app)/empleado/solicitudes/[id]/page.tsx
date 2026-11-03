import { TicketView } from "../../../hr/tickets/_view";
import { portal } from "../../_me";

export const metadata = { title: "Solicitud" };

export default async function MyTicket({ params }: PageProps<"/empleado/solicitudes/[id]">) {
  const { ctx } = await portal();
  const { id } = await params;
  return <TicketView ctx={ctx} id={id} back={{ label: "Centro de solicitudes", href: "/empleado/solicitudes" }} />;
}
