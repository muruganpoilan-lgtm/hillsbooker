"use client";

import { useEffect } from "react";
import { useAuth } from "./AuthProvider";
import { api } from "../lib/api";

const KEY = "hb_ref";

// Remembers an invite code from a link like hillbooker.com/?ref=HB3K9XQ2 and, once the guest is logged in on a new
// account, hands it to the server. Works for email sign-up and Google sign-in alike. Errors are ignored on purpose:
// an old account or a used code simply gets no welcome coupon.
export default function ReferralClaim() {
  const { ready, token } = useAuth();

  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref && /^[A-Za-z0-9]{4,12}$/.test(ref)) localStorage.setItem(KEY, ref.toUpperCase());
    } catch {}
  }, []);

  useEffect(() => {
    if (!ready || !token) return;
    let code = null;
    try {
      code = localStorage.getItem(KEY);
    } catch {}
    if (!code) return;
    api("/referrals/claim", { method: "POST", token, body: { code } }).then((res) => {
      if (res.status === 401 || res.status === 0) return; // try again next time
      try {
        localStorage.removeItem(KEY);
      } catch {}
      if (res.ok) {
        try {
          sessionStorage.setItem("hb_welcome", JSON.stringify({ code: res.data.coupon, amount: res.data.amount }));
        } catch {}
        window.dispatchEvent(new Event("hb-welcome"));
      }
    });
  }, [ready, token]);

  return null;
}
