"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { money } from "../lib/api";

// A one-time note shown right after a friend's invite code has been accepted.
export default function WelcomeToast() {
  const [w, setW] = useState(null);

  useEffect(() => {
    const read = () => {
      try {
        const v = sessionStorage.getItem("hb_welcome");
        if (v) setW(JSON.parse(v));
      } catch {}
    };
    read();
    window.addEventListener("hb-welcome", read);
    return () => window.removeEventListener("hb-welcome", read);
  }, []);

  if (!w) return null;
  const close = () => {
    try {
      sessionStorage.removeItem("hb_welcome");
    } catch {}
    setW(null);
  };
  return (
    <div className="welcome-toast" role="status">
      <p>
        <b>Welcome to Hill Booker!</b> Your friend's invite gave you {money(w.amount)} off your first stay. Use code <b>{w.code}</b> when you book.
      </p>
      <p>
        <Link href="/" className="btn btn-small" onClick={close}>Find a stay</Link>{" "}
        <button type="button" className="link-btn" onClick={close}>Close</button>
      </p>
    </div>
  );
}
