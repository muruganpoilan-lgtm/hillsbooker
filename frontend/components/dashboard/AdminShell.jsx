"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../AuthProvider";
import { api } from "../../lib/api";

// The side menu on host and admin pages. The admin gets the full menu with badges; hosts get their own.
const ADMIN_GROUPS = [
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
      { href: "/dashboard/photos", label: "Photo review", badge: "pending_photos" },
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

const HOST_GROUPS = [
  { title: null, items: [{ href: "/dashboard/home", label: "Overview" }] },
  {
    title: "My business",
    items: [
      { href: "/dashboard", label: "My properties" },
      { href: "/operator", label: "My vehicles" },
      { href: "/dashboard/bookings", label: "Stay bookings" },
      { href: "/operator/bookings", label: "Vehicle bookings" },
    ],
  },
  {
    title: "Money",
    items: [
      { href: "/dashboard/payments", label: "Payments" },
      { href: "/dashboard/reports", label: "Reports" },
    ],
  },
  { title: "Help", items: [{ href: "/support", label: "Help & support" }] },
];

function isActive(path, href) {
  if (href === "/dashboard") return path === "/dashboard" || path.startsWith("/dashboard/properties") || path === "/dashboard/new";
  if (href === "/operator") return path === "/operator" || path.startsWith("/operator/vehicles") || path === "/operator/new";
  return path === href || path.startsWith(href + "/");
}

export default function AdminShell({ children }) {
  const { ready, token, role } = useAuth();
  const path = usePathname() || "";
  const [counts, setCounts] = useState(null);
  const isAdmin = role === "admin";
  const isHost = role === "owner" || role === "operator";

  useEffect(() => {
    if (!isAdmin || !token) return;
    let off = false;
    api("/admin/badges", { token }).then((res) => {
      if (!off && res.ok) setCounts(res.data);
    });
    return () => {
      off = true;
    };
  }, [isAdmin, token, path]);

  if (!ready || !(isAdmin || isHost)) return children;
  const groups = isAdmin ? ADMIN_GROUPS : HOST_GROUPS;
  return (
    <div className="admin-shell">
      <nav className="admin-nav" aria-label={isAdmin ? "Admin" : "Host panel"}>
        <p className="admin-nav-title">{isAdmin ? "Admin" : "My panel"}</p>
        {groups.map((g, gi) => (
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
