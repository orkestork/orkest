import Link from "@/components/plink";
import { requireContext } from "@/lib/core/context";
import { btn, Card, PageHeader } from "@/components/ui";
import { ago } from "@/lib/ui/format";
import { markNotificationsRead } from "../shell-actions";

export const metadata = { title: "Notificaciones" };

export default async function Notifications() {
  const ctx = await requireContext();
  const items = await ctx.db.notification.findMany({ where: { userId: ctx.user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <>
      <PageHeader title="Notificaciones" actions={<form action={markNotificationsRead}><button className={btn.secondary}>Marcar todas como leídas</button></form>} />
      <Card padded={false}>
        <ul className="divide-y divide-slate-100">
          {items.map((n) => (
            <li key={n.id} className={`flex gap-3 px-5 py-3 ${n.readAt ? "" : "bg-blue-50/40"}`}>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-blue-500"}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{n.link ? <Link href={n.link} className="hover:underline">{n.title}</Link> : n.title}</p>
                {n.body && <p className="text-sm text-slate-500">{n.body}</p>}
              </div>
              <span className="whitespace-nowrap text-xs text-slate-400">{ago(n.createdAt)}</span>
            </li>
          ))}
          {items.length === 0 && <li className="px-5 py-8 text-center text-sm text-slate-400">Sin notificaciones.</li>}
        </ul>
      </Card>
    </>
  );
}
