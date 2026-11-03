"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../AuthProvider";
import { api } from "../../lib/api";

// The admin's side menu. Hosts and guests never see it: the pages look the same for them as before.
const GROUPS = [
  { title: null, items: [{ href: "/dashboard/overview", label: "Overview" }] },
  {
    title: "Sales",
    items: [
      { href: "/dashboard/bookings", label: "Bookings" },
      { href: "/dashboard/payments", label: "Payments" },
      { href: "/dashboard/payouts", label: "Host payouts", badge: "payouts_due", dot: true },
      { href: "/dashboard/reports", label: "Reports" },
    ],
  },
  {
    title: "Listings",
    items: [
      { href: "/dashboard", label: "Properties", badge: "pending_properties" },
      { href: "/operator", label: "Vehicles", badge: "pending_vehicles" },
      { href: "/dashboard/packages", label: "Trip packages" },
      { href: "/dashboard/blog", label: "Travel guides" },
    ],
  },
  {
    title: "Guests",
    items: [
      { href: "/dashboard/enquiries", label: "Tour enquiries", badge: "new_enquiries" },
      { href: "/dashboard/support", label: "Support tickets", badge: "open_tickets" },
      { href: "/dashboard/coupons", label: "Coupons" },
    ],
  },
];

function isActive(path, href) {
  if (href === "/dashboard") return path === "/dashboard" || path.startsWith("/dashboard/properties") || path === "/dashboard/new";
  return path === href || path.startsWith(href + "/");
}

export default function AdminShell({ children }) {
  const { ready, token, role } = useAuth();
  const path = usePathname() || "";
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    if (role !== "admin" || !token) return;
    let off = false;
    api("/admin/badges", { token }).then((res) => {
      if (!off && res.ok) setCounts(res.data);
    });
    return () => {
      off = true;
    };
  }, [role, token, path]);

  if (!ready || role !== "admin") return children;
  return (
    <div className="admin-shell">
      <nav className="admin-nav" aria-label="Admin">
        <p className="admin-nav-title">Admin</p>
        {GROUPS.map((g, gi) => (
          <div key={gi} className="admin-group">
            {g.title && <p className="admin-group-title">{g.title}</p>}
            <ul>
              {g.items.map((it) => {
                const n = counts && it.badge ? Number(counts[it.badge]) : 0;
                const on = isActive(path, it.href);
                return (
                  <li key={it.href}>
                    <Link href={it.href} className={on ? "on" : ""} aria-current={on ? "page" : undefined}>
                      <span>{it.label}</span>
                      {n > 0 && (it.dot ? <i className="admin-dot" title="Money to pay" aria-label="money due" /> : <b className="admin-badge" aria-label={`${n} waiting`}>{n}</b>)}
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
