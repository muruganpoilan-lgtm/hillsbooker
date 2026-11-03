"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { useLang } from "./LangProvider";

// The side menu on a guest's account pages (overview, trips, saved places, invite). It only shows when logged in.
export default function GuestShell({ children }) {
  const { ready, token, role } = useAuth();
  const { t } = useLang();
  const path = usePathname() || "";
  if (!ready || !token) return children;
  const host = role === "owner" || role === "operator" || role === "admin";
  const groups = [
    {
      title: null,
      items: [
        { href: "/account", label: t("acct.overview") },
        { href: "/bookings", label: t("acct.trips") },
        { href: "/saved", label: t("nav.saved") },
        { href: "/invite", label: t("nav.invite") },
      ],
    },
    { title: t("acct.groupHelp"), items: [{ href: "/support", label: t("footer.support") }] },
    { title: t("acct.groupAccount"), items: [host ? { href: role === "admin" ? "/dashboard/overview" : "/dashboard/home", label: t("acct.hostPanel") } : { href: "/dashboard", label: t("nav.becomeHost") }] },
  ];
  return (
    <div className="admin-shell">
      <nav className="admin-nav" aria-label={t("acct.title")}>
        <p className="admin-nav-title">{t("acct.title")}</p>
        {groups.map((g, gi) => (
          <div key={gi} className="admin-group">
            {g.title && <p className="admin-group-title">{g.title}</p>}
            <ul>
              {g.items.map((it) => {
                const on = path === it.href || path.startsWith(it.href + "/");
                return (
                  <li key={it.href}>
                    <Link href={it.href} className={on ? "on" : ""} aria-current={on ? "page" : undefined}>
                      <span>{it.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="admin-main">{children}</div>
    </div>
  );
}
