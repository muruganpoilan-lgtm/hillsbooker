"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "../AuthProvider";
import { api } from "../../lib/api";

// Shows the page only to owners and admins. Everyone else gets a short explanation.
export default function Guard({ children }) {
  const { ready, token, role, login, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function becomeHost() {
    setBusy(true);
    setError("");
    const res = await api("/auth/become-host", { method: "POST", token });
    setBusy(false);
    if (res.status === 401) {
      logout();
      return;
    }
    if (!res.ok) return setError(res.error);
    login(res.data.token, res.data.role);
  }
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
          <h2>Become a host</h2>
          <p>Your account is a guest account. Switch it to a host account to list properties and vehicles. You can still book stays with the same login.</p>
          <p>
            <button type="button" className="btn btn-primary" onClick={becomeHost} disabled={busy}>
              {busy ? "Please wait…" : "Become a host"}
            </button>
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </main>
    );
  }
  return <main className="page">{children}</main>;
}
