"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { AppIcon } from "./app-icons";
import { currentApp, type LauncherApp } from "@/lib/launcher";
import { switchOrganization } from "@/app/(app)/shell-actions";
import { logout } from "@/app/login/actions";

type Props = {
  apps: LauncherApp[];
  org: { id: string; name: string; color: string; logoUrl?: string };
  memberships: { orgId: string; orgName: string; roleName: string }[];
  user: { name: string; email: string; role: string; isPlatformAdmin: boolean };
  unread: number;
  pendingApprovals: number;
};

export function TopBar({ apps, org, memberships, user, unread, pendingApprovals }: Props) {
  const path = usePathname();
  const app = currentApp(apps, path);
  const formRef = useRef<HTMLFormElement>(null);
  const home = path === "/";

  return (
    <header className="sticky top-0 z-20 print:hidden border-b border-[var(--ork-rule)] bg-[var(--ork-paper-light)]/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2 sm:px-6">
        <Link href="/" aria-label="Inicio · todas las apps" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--ork-purple)] hover:bg-black/5">
          <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor" aria-hidden="true">
            {[2, 8, 14].flatMap((y) => [2, 8, 14].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" rx="1" />))}
          </svg>
        </Link>

        {home || !app ? (
          <Link href="/" className="flex items-center gap-2">
            <img src="/brand/ork-logo-violet.png" alt="OR-K" className="h-6 w-auto" />
            <span className="hidden font-display text-lg uppercase tracking-wide text-[var(--ork-ink)] sm:inline">ORKEST</span>
          </Link>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <Link href={app.href} className="flex shrink-0 items-center gap-2">
              <AppIcon name={app.icon} size={24} />
              <span className="font-display text-lg uppercase tracking-wide text-[var(--ork-ink)]">{app.name}</span>
            </Link>
            {app.nav.length > 0 && (
              <nav className="ml-3 hidden items-center gap-0.5 overflow-x-auto md:flex">
                {app.nav.map((n) => {
                  // Activo = el ítem cuya ruta es el prefijo más largo de la ruta actual
                  const best = app.nav.filter((x) => path === x.href || path.startsWith(`${x.href}/`)).sort((a, b) => b.href.length - a.href.length)[0];
                  const active = best?.href === n.href;
                  return (
                    <Link key={n.href} href={n.href} className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm ${active ? "bg-[var(--ork-purple)] text-white" : "text-stone-700 hover:bg-black/5"}`}>
                      {n.label}
                    </Link>
                  );
                })}
              </nav>
            )}
          </div>
        )}

        <form action="/search" className="ml-auto hidden w-full max-w-xs lg:block">
          <input name="q" placeholder="Buscar en ORKEST…" className="w-full rounded-full border border-[var(--ork-rule)] bg-white/70 px-4 py-1.5 text-sm outline-none placeholder:text-stone-400 focus:border-[var(--ork-violet)] focus:bg-white" />
        </form>

        <div className="ml-auto flex items-center gap-1 lg:ml-0">
          <Link href="/approvals" title="Aprobaciones" className="relative grid h-9 w-9 place-items-center rounded-lg hover:bg-black/5">
            <AppIcon name="approvals" size={22} />
            {pendingApprovals > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-[var(--ork-pink)] px-1.5 text-[10px] font-semibold text-white">{pendingApprovals}</span>}
          </Link>
          <Link href="/notifications" title="Notificaciones" className="relative grid h-9 w-9 place-items-center rounded-lg hover:bg-black/5">
            <AppIcon name="notifications" size={22} />
            {unread > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-[var(--ork-pink)] px-1.5 text-[10px] font-semibold text-white">{unread}</span>}
          </Link>

          {memberships.length > 1 ? (
            <form ref={formRef} action={switchOrganization}>
              <label className="sr-only" htmlFor="org-switch">Cambiar organización</label>
              <select id="org-switch" name="orgId" defaultValue={org.id} onChange={() => formRef.current?.requestSubmit()}
                className="max-w-44 cursor-pointer truncate rounded-full border border-[var(--ork-rule)] bg-white/70 py-1.5 pl-3 pr-7 text-xs font-medium text-stone-800 outline-none">
                {memberships.map((m) => <option key={m.orgId} value={m.orgId}>{m.orgName}</option>)}
              </select>
            </form>
          ) : (
            <span className="hidden rounded-full border border-[var(--ork-rule)] bg-white/70 px-3 py-1.5 text-xs font-medium sm:inline">{org.name}</span>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element -- logo externo configurado por la empresa */}
          {org.logoUrl && <img src={org.logoUrl} alt={org.name} className="hidden h-7 w-auto max-w-28 object-contain sm:block" />}

          <details className="relative">
            <summary className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-full text-sm font-semibold text-white" style={{ background: org.color }} title={user.name}>
              {user.name.charAt(0)}
            </summary>
            <div className="absolute right-0 mt-2 w-60 rounded-xl border border-[var(--ork-rule)] bg-white p-3 text-sm shadow-xl">
              <p className="font-medium">{user.name}</p>
              <p className="truncate text-xs text-stone-500">{user.email}</p>
              <p className="mt-1 text-xs text-stone-500">{user.role} · {org.name}</p>
              <div className="mt-3 space-y-1 border-t border-stone-100 pt-2">
                {user.isPlatformAdmin && <Link href="/platform" className="block rounded px-2 py-1 hover:bg-stone-100">Panel OR-K</Link>}
                <form action={logout}><button className="w-full rounded px-2 py-1 text-left text-[var(--ork-pink)] hover:bg-stone-100">Cerrar sesión</button></form>
              </div>
            </div>
          </details>
        </div>
      </div>
      {app && app.nav.length > 0 && (
        <nav className="flex gap-1 overflow-x-auto border-t border-[var(--ork-rule)] px-4 py-1.5 md:hidden">
          {app.nav.map((n) => <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-md px-2.5 py-1 text-sm text-stone-700 hover:bg-black/5">{n.label}</Link>)}
        </nav>
      )}
    </header>
  );
}
