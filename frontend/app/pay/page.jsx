"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthProvider";
import UpiPay from "../../components/UpiPay";
import { api, money, nightsBetween, plural, prettyDate } from "../../lib/api";
import { payForBooking } from "../../lib/pay";

// Counts down to the end of the hold, then reloads so the page shows the booking as expired.
function HoldTimer({ until, onExpire }) {
  const [left, setLeft] = useState(() => Math.max(0, new Date(until).getTime() - Date.now()));
  const fired = useRef(false);
  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, new Date(until).getTime() - Date.now());
      setLeft(remaining);
      if (remaining === 0 && !fired.current) {
        fired.current = true;
        onExpire();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [until, onExpire]);
  const mins = Math.floor(left / 60000);
  const secs = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
  const hours = Math.floor(mins / 60);
  return <p className="scarce">{left > 0 ? (hours >= 1 ? `Held for you for ${hours}h ${mins % 60}m` : `Held for you for ${mins}:${secs}`) : "Hold ended"}</p>;
}

// The payment page a guest lands on right after reserving a room or vehicle: /pay?kind=stay|vehicle&id=...
export default function PayPage() {
  const router = useRouter();
  const { ready, token, logout } = useAuth();
  const [kind, setKind] = useState("");
  const [id, setId] = useState("");
  const [b, setB] = useState(null);
  const [missing, setMissing] = useState(false);
  const [payOn, setPayOn] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setKind(q.get("kind") === "vehicle" ? "vehicle" : "stay");
    setId(q.get("id") || "");
    api("/payments/config").then((res) => res.ok && setPayOn(Boolean(res.data.enabled)));
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    const res = await api(kind === "vehicle" ? "/vehicle-bookings/mine" : "/bookings/mine", { token });
    if (res.status === 401) return logout();
    if (!res.ok) return setError(res.error);
    const row = res.data.find((r) => String(r.id) === id);
    if (row) setB(row);
    else setMissing(true);
  }, [kind, id, token, logout]);

  useEffect(() => {
    if (!(ready && token && kind)) return;
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [ready, token, kind, load]);

  const base = kind === "vehicle" ? "vehicle-bookings" : "bookings";
  const listHref = kind === "vehicle" ? "/bookings/vehicles" : "/bookings";
  const what = kind === "vehicle" ? "vehicle" : "room";

  async function pay() {
    setError("");
    setNotice("");
    setBusy(true);
    const res = await payForBooking({ bookingId: b.id, token, description: kind === "vehicle" ? b.vehicle : `${b.property}, ${b.room_type}`, kind });
    setBusy(false);
    if (res.dismissed) return;
    if (res.status === 401) return logout();
    if (!res.ok) return setError(res.error);
    if (res.data.status === "refunded") setNotice(`Your payment arrived after the ${what} was released, and it was gone. Your money is being refunded in full.`);
    load();
  }

  async function act(action) {
    setError("");
    setNotice("");
    setBusy(true);
    const res = await api(`/${base}/${b.id}/${action}`, { method: "POST", token });
    setBusy(false);
    if (res.status === 401) return logout();
    if (!res.ok) return setError(res.error);
    if (action === "cancel") {
      router.push(listHref);
      return;
    }
    load();
  }

  async function openInvoice() {
    const res = await api(`/bookings/${b.id}/invoice-link`, { token });
    if (!res.ok) setError(res.error);
    else window.open(res.data.url, "_blank");
  }

  if (!ready) return <main className="page" />;
  if (!token) {
    return (
      <main className="page">
        <div className="empty">
          <h2>Log in to pay for your booking</h2>
          <p>
            <Link href={`/login?next=${encodeURIComponent(`/pay?kind=${kind}&id=${id}`)}`}>Log in</Link>
          </p>
        </div>
      </main>
    );
  }
  if (missing || !id) {
    return (
      <main className="page">
        <div className="empty">
          <h2>We couldn't find that booking</h2>
          <p>
            <Link href={listHref}>Go to My bookings</Link>
          </p>
        </div>
      </main>
    );
  }
  if (!b) {
    return (
      <main className="page">
        {error ? <p className="form-error" role="alert">{error}</p> : <p className="empty">Loading…</p>}
      </main>
    );
  }

  const name = kind === "vehicle" ? `${b.vehicle}${b.count > 1 ? ` × ${b.count}` : ""}` : b.property;
  const detail =
    kind === "vehicle"
      ? `${b.trip || "Hire by the day"} · ${plural(b.passengers, "passenger")} · ${b.city}`
      : `${b.room_type}, ${plural(b.rooms, "room")}, ${plural(b.guests, "guest")} · ${b.city}`;
  const when =
    kind === "vehicle"
      ? b.start_date === b.end_date
        ? prettyDate(b.start_date)
        : `${prettyDate(b.start_date)} to ${prettyDate(b.end_date)}`
      : `${prettyDate(b.check_in)} to ${prettyDate(b.check_out)} (${plural(nightsBetween(b.check_in, b.check_out), "night")})`;
  const hasBalance = Number(b.balance_due) > 0;

  return (
    <main className="page">
      <div className="narrow">
        <h1 className="section-title">
          {b.status === "confirmed" ? "Booking confirmed" : b.status === "held" ? "Complete your payment" : "Booking"}
        </h1>

        <article className="booking">
          <h2 className="booking-name">{name}</h2>
          <p className="meta">{detail}</p>
          <p>{when}</p>
          <p>
            Total <span className="price">{money(b.total_amount)}</span>
          </p>
          {hasBalance && (
            <p className="meta">
              Pay <b>{money(b.advance_amount)}</b> now to confirm. The balance of {money(b.balance_due)} is paid {kind === "vehicle" ? "to the operator" : "at the property"}.
            </p>
          )}
        </article>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}

        {b.status === "held" && (
          <>
            {b.hold_expires_at && <HoldTimer until={b.hold_expires_at} onExpire={load} />}
            {b.upi_pending ? (
              <p className="notice" role="status">
                You sent a UPI payment. The host will check it and confirm your booking, usually within a few hours. You can leave this page. You'll see the booking as confirmed in <Link href={listHref}>My bookings</Link>.
              </p>
            ) : (
              <>
                {!payOn && <p className="meta">Online payments aren't switched on yet, so the button below only confirms the booking for testing.</p>}
                <div className="booking-actions">
                  <button type="button" className="btn btn-primary" aria-busy={busy} onClick={payOn ? pay : () => act("confirm")}>
                    {payOn ? `Pay ${money(b.advance_amount)}${hasBalance ? " now" : ""}` : "Confirm booking (test)"}
                  </button>
                </div>
                {b.host_upi && <UpiPay kind={kind} bookingId={b.id} token={token} amount={b.advance_amount} onDone={load} />}
                <p>
                  <button type="button" className="link-btn" onClick={() => act("cancel")}>
                    Cancel and release the {what}
                  </button>
                </p>
              </>
            )}
          </>
        )}

        {b.status === "confirmed" && (
          <>
            <p className="ok">Payment received. Your {kind === "vehicle" ? "vehicle" : "room"} is booked.</p>
            <div className="booking-actions">
              {kind !== "vehicle" && (
                <button type="button" className="btn" onClick={openInvoice}>
                  Invoice
                </button>
              )}
              <Link href={listHref} className="btn btn-primary">
                Go to My bookings
              </Link>
            </div>
          </>
        )}

        {(b.status === "expired" || b.status === "cancelled") && (
          <p className="empty">
            This booking is {b.status === "expired" ? "no longer held" : "cancelled"}. <Link href="/">Search again</Link>.
          </p>
        )}
      </div>
    </main>
  );
}
