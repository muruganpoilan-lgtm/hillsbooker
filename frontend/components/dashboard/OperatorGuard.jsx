"use client";

import Link from "next/link";
import { useAuth } from "../AuthProvider";

// Shows the page only to vehicle operators and admins.
export default function OperatorGuard({ children }) {
  const { ready, token, role } = useAuth();
  if (!ready) return <main className="page" />;
  if (!token) {
    return (
      <main className="page">
        <div className="empty">
          <h2>Log in to manage your vehicles</h2>
          <p>
            <Link href="/login?next=/operator">Log in</Link> or <Link href="/register?role=owner">create a host account</Link>.
          </p>
        </div>
      </main>
    );
  }
  if (role !== "owner" && role !== "operator" && role !== "admin") {
    return (
      <main className="page">
        <div className="empty">
          <h2>This area is for vehicle operators</h2>
          <p>Create a separate host account with another email to list a property or vehicles.</p>
        </div>
      </main>
    );
  }
  return <main className="page">{children}</main>;
}
