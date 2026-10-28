"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";

const SDK = "https://sdk.cashfree.com/js/v3/cashfree.js";

function loadSdk() {
  if (window.Cashfree) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SDK;
    s.onload = resolve;
    s.onerror = () => reject(new Error("load"));
    document.body.appendChild(s);
  });
}

// Two jobs in one address, both used only for Cashfree payments:
//  /pay/cashfree?session=...&order_id=...&mode=...  opens Cashfree's payment page for the order.
//  /pay/cashfree?order_id=...                        is where Cashfree sends the guest back. The server asks Cashfree whether it was paid.
export default function CashfreePage() {
  const [state, setState] = useState("loading"); // loading | paying | checking | confirmed | refunded | pending | error
  const [error, setError] = useState("");
  const [info, setInfo] = useState({ kind: "stay", booking_id: "" });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const q = new URLSearchParams(window.location.search);
    const session = q.get("session");
    const orderId = q.get("order_id");

    async function check(tries) {
      setState("checking");
      const res = await api(`/payments/cashfree/confirm?order_id=${encodeURIComponent(orderId)}`);
      if (!res.ok) {
        setError(res.error);
        return setState("error");
      }
      setInfo({ kind: res.data.kind, booking_id: res.data.booking_id });
      // A bank can take a few seconds to report back: look again before saying it is still pending.
      if (res.data.status === "pending" && tries > 0) {
        await new Promise((r) => setTimeout(r, 3000));
        return check(tries - 1);
      }
      setState(res.data.status);
    }

    if (session) {
      setState("paying");
      loadSdk()
        .then(() => {
          const cashfree = window.Cashfree({ mode: q.get("mode") === "production" ? "production" : "sandbox" });
          cashfree.checkout({ paymentSessionId: session, redirectTarget: "_self" });
        })
        .catch(() => {
          setError("Couldn't load the payment page. Check your internet connection and try again.");
          setState("error");
        });
    } else if (orderId) {
      check(3);
    } else {
      setError("This payment link is not complete.");
      setState("error");
    }
  }, []);

  const payHref = `/pay?kind=${info.kind}&id=${info.booking_id}`;
  const listHref = info.kind === "vehicle" ? "/bookings/vehicles" : "/bookings";

  return (
    <main className="page">
      <div className="narrow">
        {state === "loading" || state === "paying" ? <p className="empty">Opening the secure payment page…</p> : null}
        {state === "checking" ? <p className="empty">Checking your payment…</p> : null}
        {state === "confirmed" ? (
          <div className="empty">
            <h2>Payment received. Your booking is confirmed.</h2>
            <p><Link href={payHref}>See your booking</Link> · <Link href={listHref}>My bookings</Link></p>
          </div>
        ) : null}
        {state === "refunded" ? (
          <div className="empty">
            <h2>Your payment arrived after the booking was released</h2>
            <p>The room or vehicle was gone, so your money is being refunded in full.</p>
            <p><Link href={listHref}>My bookings</Link></p>
          </div>
        ) : null}
        {state === "pending" ? (
          <div className="empty">
            <h2>We haven't received your payment yet</h2>
            <p>If you paid, wait a minute and open My bookings. It will show as confirmed once the bank reports it. Otherwise you can try again while your room is still held.</p>
            <p>{info.booking_id ? <Link href={payHref}>Try payment again</Link> : null} · <Link href={listHref}>My bookings</Link></p>
          </div>
        ) : null}
        {state === "error" ? (
          <div className="empty">
            <h2>Something went wrong</h2>
            <p className="form-error" role="alert">{error}</p>
            <p><Link href="/bookings">My bookings</Link></p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
