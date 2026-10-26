"use client";

import Link from "next/link";
import { useAuth } from "../AuthProvider";

// Shows the page only to owners and admins. Everyone else gets a short explanation.
export default function Guard({ children }) {
  const { ready, token, role } = useAuth();
  if (!ready) return <main className="page" />;
  if (!token) {
    return (
      <main className="page">
        <div className="empty">
          <h2>Log in to manage your properties</h2>
          <p>
            <Link href="/login?next=/dashboard">Log in</Link> or <Link href="/register">create a host account</Link>.
          </p>
        </div>
      </main>
    );
  }
  if (role !== "owner" && role !== "operator" && role !== "admin") {
    return (
      <main className="page">
        <div className="empty">
          <h2>This area is for property owners</h2>
          <p>Your account is a guest account. Create a separate host account with another email to list a property or vehicles.</p>
        </div>
      </main>
    );
  }
  return <main className="page">{children}</main>;
}
