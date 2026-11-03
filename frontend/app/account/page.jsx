"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../components/AuthProvider";
import { useLang } from "../../components/LangProvider";
import { api, money, prettyDate, todayISO } from "../../lib/api";

const STATUS_KEY = { held: "bk.sWaiting", confirmed: "bk.sConfirmed", cancelled: "bk.sCancelled", expired: "bk.sExpired" };

function Tile({ tone = "", label, value, sub }) {
  return (
    <div className={`ov-tile ${tone}`}>
      <p className="l">{label}</p>
      <p className="v">{value}</p>
      <p className="s">{sub}</p>
    </div>
  );
}

const dayDiff = (a, b) => Math.round((new Date(`${a}T00:00:00`) - new Date(`${b}T00:00:00`)) / 86400000);

export default function AccountPage() {
  const { ready, token, logout } = useAuth();
  const { t } = useLang();
  const [d, setD] = useState(null);

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      window.location.replace("/login?next=/account");
      return;
    }
    Promise.all([
      api("/bookings/mine", { token }),
      api("/vehicle-bookings/mine", { token }),
      api("/wishlist/ids", { token }),
      api("/coupons/mine", { token }),
      api("/referrals/me", { token }),
    ]).then(([stays, rides, saved, coupons, invite]) => {
      if ([stays, rides, saved, coupons, invite].some((r) => r.status === 401)) return logout();
      setD({
        stays: stays.ok ? stays.data : [],
        rides: rides.ok ? rides.data : [],
        saved: saved.ok ? saved.data.ids.length : 0,
        coupons: coupons.ok ? coupons.data : [],
        invite: invite.ok ? invite.data : null,
      });
    });
  }, [ready, token, logout]);

  if (!ready || !d) return <main className="page"><p className="meta">{t("acct.loading")}</p></main>;

  const today = todayISO();
  // One list for stays and vehicle trips, with the first day and the last day of each.
  const trips = [
    ...d.stays.map((b) => ({ id: `s${b.id}`, name: b.property, place: b.city, start: String(b.check_in).slice(0, 10), end: String(b.check_out).slice(0, 10), status: b.status, total: b.total_amount, vehicle: false })),
    ...d.rides.map((b) => ({ id: `v${b.id}`, name: b.vehicle, place: b.city, start: String(b.start_date).slice(0, 10), end: String(b.end_date).slice(0, 10), status: b.status, total: b.total_amount, vehicle: true })),
  ];
  const confirmed = trips.filter((x) => x.status === "confirmed");
  const upcoming = confirmed.filter((x) => x.end >= today).sort((a, b) => a.start.localeCompare(b.start));
  const next = upcoming[0];
  const taken = confirmed.filter((x) => x.end < today).length;
  const recent = trips.filter((x) => x.status !== "expired").sort((a, b) => b.start.localeCompare(a.start)).slice(0, 4);
  const coupon = d.coupons.slice().sort((a, b) => Number(b.value) - Number(a.value))[0];
  const when = (n) => (n <= 0 ? t("acct.today") : n === 1 ? t("acct.tomorrow") : t("acct.inDays", { n }));
  const inv = d.invite;
  const share = inv ? `https://wa.me/?text=${encodeURIComponent(t("acct.shareText", { friend: money(inv.friend_amount), link: inv.link }))}` : "";

  return (
    <main className="page">
      <h1 className="section-title">{t("acct.hello")}</h1>
      <p className="meta">{t("acct.sub")}</p>

      <div className="ov-tiles">
        <Tile tone="green" label={t("acct.next")} value={next ? when(dayDiff(next.start, today)) : t("acct.noTrip")} sub={next ? `${next.place} · ${prettyDate(next.start)}` : t("acct.noTripSub")} />
        <Tile tone="indigo" label={t("acct.taken")} value={taken} sub={t("acct.takenSub")} />
        <Tile
          tone="gold"
          label={t("acct.coupon")}
          value={coupon ? t("acct.couponOff", { amt: money(coupon.value) }) : t("acct.noCoupon")}
          sub={coupon ? (coupon.valid_until ? t("acct.couponSub", { date: prettyDate(String(coupon.valid_until).slice(0, 10)) }) : t("acct.couponSubNoDate")) : t("acct.noCouponSub")}
        />
        <Tile label={t("acct.saved")} value={d.saved} sub={t("acct.savedSub")} />
      </div>

      <div className="ov-row">
        <section className="ov-panel">
          <h2>{t("acct.tripsTitle")}</h2>
          {recent.length === 0 ? (
            <p className="meta">{t("acct.noTrips")}</p>
          ) : (
            <ul className="ov-recent">
              {recent.map((x) => (
                <li key={x.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                  <div>
                    <span className="row-name">{x.name}</span>
                    <p className="meta">
                      {x.place} · {prettyDate(x.start)}
                      {x.end !== x.start ? ` – ${prettyDate(x.end)}` : ""}
                      {x.vehicle ? ` · ${t("acct.vehicle")}` : ""}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span className={`status status-${x.status}`}>{STATUS_KEY[x.status] ? t(STATUS_KEY[x.status]) : x.status}</span>
                    <p className="meta">{money(x.total)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p style={{ marginTop: "0.8rem" }}>
            <Link className="btn btn-small" href="/bookings">{t("acct.seeAll")}</Link>
          </p>
        </section>

        {inv && (
          <section className="ov-panel" style={{ background: "var(--green)", borderColor: "var(--green)", color: "#fff" }}>
            <h2>{t("acct.inviteTitle")}</h2>
            <p style={{ margin: "0.3rem 0 0.8rem" }}>{t("acct.inviteText", { friend: money(inv.friend_amount), you: money(inv.referrer_amount) })}</p>
            <p style={{ background: "rgba(255,255,255,0.14)", borderRadius: "10px", padding: "0.6rem 0.8rem", fontWeight: 800, letterSpacing: "0.04em", wordBreak: "break-all" }}>{inv.code}</p>
            <p style={{ marginTop: "0.8rem" }}>
              <a className="btn btn-small" href={share} target="_blank" rel="noopener noreferrer" style={{ background: "#fff", color: "var(--green-dark)", borderColor: "#fff" }}>
                {t("acct.share")}
              </a>
            </p>
          </section>
        )}
      </div>

      <div className="ov-row even">
        <section className="ov-panel">
          <h2>{t("acct.helpTitle")}</h2>
          <p className="meta">{t("acct.helpText")}</p>
          <p style={{ marginTop: "0.8rem" }}>
            <Link className="btn btn-small btn-primary" href="/support">{t("acct.helpBtn")}</Link>
          </p>
        </section>
        <section className="ov-panel">
          <h2>{t("acct.planTitle")}</h2>
          <p className="meta">{t("acct.planText")}</p>
          <div className="actions" style={{ marginTop: "0.8rem" }}>
            <Link className="btn btn-small btn-primary" href="/">{t("acct.planStays")}</Link>
            <Link className="btn btn-small" href="/packages">{t("nav.packages")}</Link>
            <Link className="btn btn-small" href="/vehicles">{t("nav.cars")}</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
