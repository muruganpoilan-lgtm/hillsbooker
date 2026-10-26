"use client";

import { useEffect, useState } from "react";
import { API_BASE, api } from "../lib/api";

// "Continue with Google". Hidden until the server has Google sign-in switched on.
export default function GoogleButton({ role = "guest", label = "Continue with Google" }) {
  const [on, setOn] = useState(false);
  const [next, setNext] = useState("/");

  useEffect(() => {
    api("/auth/google/config").then((res) => res.ok && setOn(Boolean(res.data.enabled)));
    const n = new URLSearchParams(window.location.search).get("next");
    if (n && n.startsWith("/") && !n.startsWith("//")) setNext(n);
    else if (role === "owner") setNext("/dashboard");
    else if (role === "operator") setNext("/operator");
  }, [role]);

  if (!on) return null;
  const href = `${API_BASE}/auth/google/start?${new URLSearchParams({ target: "web", role, next }).toString()}`;
  return (
    <a className="btn" href={href}>
      {label}
    </a>
  );
}
