"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, safeNext } from "../../../components/AuthProvider";

// Google sends people back here (via the server) with a login token in the address.
export default function GoogleReturnPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [error, setError] = useState("");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const token = q.get("token");
    const role = q.get("role");
    if (!token || !role) {
      setError(q.get("error") || "Google sign-in did not finish.");
      return;
    }
    login(token, role);
    router.replace(safeNext(q.get("next"), "/"));
  }, [login, router]);

  return (
    <main className="page auth">
      {error ? (
        <>
          <h1>Google sign-in</h1>
          <p className="form-error" role="alert">
            {error}
          </p>
          <p className="auth-alt">
            <Link href="/login">Back to log in</Link>
          </p>
        </>
      ) : (
        <p className="empty">Signing you in…</p>
      )}
    </main>
  );
}
