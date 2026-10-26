"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

export default function Header() {
  const { ready, token, role, logout } = useAuth();
  const router = useRouter();

  return (
    <header className="site-header">
      <Link href="/" className="brand">
        <img src="/logo-mark.png" alt="" className="brand-logo" />
        Hill Booker
      </Link>
      <nav className="nav" aria-label="Main">
        <Link href="/vehicles">Cars &amp; vans</Link>
        {ready && token ? (
          <>
            {(role === "owner" || role === "operator" || role === "admin") && <Link href="/dashboard">My properties</Link>}
            {(role === "owner" || role === "operator" || role === "admin") && <Link href="/operator">My vehicles</Link>}
            <Link href="/bookings">My bookings</Link>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                logout();
                router.push("/");
              }}
            >
              Log out
            </button>
          </>
        ) : ready ? (
          <>
            <Link href="/login">Log in</Link>
            <Link href="/register" className="btn btn-small">
              Sign up
            </Link>
          </>
        ) : null}
      </nav>
    </header>
  );
}
