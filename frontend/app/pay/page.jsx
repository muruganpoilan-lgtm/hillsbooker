"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthProvider";
import UpiPay from "../../components/UpiPay";
import PhoneBox from "../../components/PhoneBox";
import { api, money, nightsBetween, prettyDate } from "../../lib/api";
import { useLang } from "../../components/LangProvider";
import { payForBooking } from "../../lib/pay";

// Counts down to the end of the hold, then reloads so the page shows the booking as expired.
function HoldTimer({ until, onExpire }) {
  const { t } = useLang();
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
  return <p className="scarce">{left > 0 ? (hours >= 1 ? t("pay.held", { h: hours, m: mins % 60 }) : t("pay.heldM", { m: mins, s: secs })) : t("bk.holdEnd")}</p>;
}

// The payment page a guest lands on right after reserving a room or vehicle: /pay?kind=stay|vehicle&id=...
export default function PayPage() {
  const router = useRouter();
  const { ready, token, logout } = useAuth();
  const { t } = useLang();
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
  const what = t(kind === "vehicle" ? "pay.whatVehicle" : "pay.whatRoom");

  async function pay() {
    setError("");
    setNotice("");
    setBusy(true);
    const res = await payForBooking({ bookingId: b.id, token, description: kind === "vehicle" ? b.vehicle : `${b.property}, ${b.room_type}`, kind });
    setBusy(false);
    if (res.dismissed) return;
    if (res.status === 401) return logout();
    if (!res.ok) return setError(res.error);
    if (res.data.status === "refunded") setNotice(t("pay.lateRefund", { what }));
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
          <h2>{t("pay.loginTitle")}</h2>
          <p>
            <Link href={`/login?next=${encodeURIComponent(`/pay?kind=${kind}&id=${id}`)}`}>{t("bk.login")}</Link>
          </p>
        </div>
      </main>
    );
  }
  if (missing || !id) {
    return (
      <main className="page">
        <div className="empty">
          <h2>{t("pay.notFound")}</h2>
          <p>
            <Link href={listHref}>{t("pay.goList")}</Link>
          </p>
        </div>
      </main>
    );
  }
  if (!b) {
    return (
      <main className="page">
        {error ? <p className="form-error" role="alert">{error}</p> : <p className="empty">{t("saved.loading")}</p>}
      </main>
    );
  }

  const name = kind === "vehicle" ? `${b.vehicle}${b.count > 1 ? ` × ${b.count}` : ""}` : b.property;
  const detail =
    kind === "vehicle"
      ? t("pay.vehDetail", { trip: b.trip || t("pay.byDay"), pax: t.n("unit.passenger", b.passengers), city: b.city })
      : t("pay.stayDetail", { room: b.room_type, rooms: t.n("unit.room", b.rooms), adults: t.n("unit.adult", b.guests - (b.children || 0)), kids: b.children > 0 ? `, ${t.n("unit.child", b.children)}` : "", city: b.city });
  const when =
    kind === "vehicle"
      ? b.start_date === b.end_date
        ? prettyDate(b.start_date)
        : t("bk.dates", { a: prettyDate(b.start_date), b: prettyDate(b.end_date), n: "" }).replace(" ()", "")
      : t("bk.dates", { a: prettyDate(b.check_in), b: prettyDate(b.check_out), n: t.n("unit.night", nightsBetween(b.check_in, b.check_out)) });
  const hasBalance = Number(b.balance_due) > 0;

  return (
    <main className="page">
      <div className="narrow">
        <h1 className="section-title">
          {b.status === "confirmed" ? t("pay.titleConfirmed") : b.status === "held" ? t("pay.titleHeld") : t("pay.titleOther")}
        </h1>
        <ol className="pay-steps" aria-label={t("pay.progress")}>
          <li className={b.status === "confirmed" ? "done" : "now"}>{t("pay.step1")}</li>
          <li className={b.status === "confirmed" ? "now" : ""}>{t("pay.step2")}</li>
        </ol>

        <article className="booking">
          <h2 className="booking-name">{name}</h2>
          <p className="meta">{detail}</p>
          <p>{when}</p>
          <p>
            {t("pay.total")} <span className="price">{money(b.total_amount)}</span>
          </p>
          {hasBalance && (
            <p className="meta">
              {t(kind === "vehicle" ? "pay.balanceVeh" : "pay.balanceStay", { adv: money(b.advance_amount), bal: money(b.balance_due) })}
            </p>
          )}
        </article>

        <PhoneBox token={token} compact />

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
                {t("pay.upiSent")} <Link href={listHref}>{t("bk.title")}</Link>.
              </p>
            ) : (
              <>
                {!payOn && <p className="meta">{t("pay.testMode")}</p>}
                <div className="booking-actions">
                  <button type="button" className="btn btn-primary" aria-busy={busy} onClick={payOn ? pay : () => act("confirm")}>
                    {t(payOn ? "pay.btn" : "pay.btnTest", { amt: money(b.advance_amount) })}
                  </button>
                </div>
                {b.host_upi && <UpiPay kind={kind} bookingId={b.id} token={token} amount={b.advance_amount} onDone={load} />}
                <p>
                  <button type="button" className="link-btn" onClick={() => act("cancel")}>
                    {t("pay.release", { what })}
                  </button>
                </p>
              </>
            )}
          </>
        )}

        {b.status === "confirmed" && (
          <>
            <p className="ok">{t("pay.received", { what })}</p>
            <div className="booking-actions">
              {kind !== "vehicle" && (
                <button type="button" className="btn" onClick={openInvoice}>
                  {t("pay.invoice")}
                </button>
              )}
              <Link href={listHref} className="btn btn-primary">
                {t("pay.goList")}
              </Link>
            </div>
          </>
        )}

        {(b.status === "expired" || b.status === "cancelled") && (
          <p className="empty">
            {t(b.status === "expired" ? "pay.ended" : "pay.cancelled")} <Link href="/">{t("pay.searchAgain")}</Link>.
          </p>
        )}
      </div>
    </main>
  );
}
