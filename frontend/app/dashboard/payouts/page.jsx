"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../components/AuthProvider";
import Guard from "../../../components/dashboard/Guard";
import { api, money, prettyDate } from "../../../lib/api";

function Payouts() {
  const { token, role, logout } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState("");
  const [ref, setRef] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  const load = useCallback(async () => {
    const res = await api("/admin/payouts", { token });
    if (res.status === 401) return logout();
    if (!res.ok) return setError(res.error);
    setError("");
    setData(res.data);
  }, [token, logout]);

  useEffect(() => {
    if (role === "admin") load();
  }, [load, role]);

  if (role !== "admin") {
    return (
      <>
        <p className="meta">
          <Link href="/dashboard/payments">← Payments</Link>
        </p>
        <p className="empty">Only the Hill Booker admin can open this page.</p>
      </>
    );
  }

  function start(host) {
    setOpen(host.host_id);
    setRef("");
    setFormError("");
    setDone("");
  }

  async function save(host) {
    setFormError("");
    const r = ref.trim();
    if (!/^[A-Za-z0-9]{6,30}$/.test(r)) {
      setFormError("Enter the UPI reference of your transfer first (6 to 30 letters or numbers).");
      return;
    }
    setBusy(true);
    const res = await api("/admin/payouts", { method: "POST", token, body: { host_id: host.host_id, reference: r, expected_amount: host.amount } });
    setBusy(false);
    if (res.status === 401) return logout();
    if (!res.ok) {
      setFormError(res.error);
      if (res.status === 409) load();
      return;
    }
    setOpen("");
    setDone(`Saved: ${money(res.data.amount)} paid to ${host.host_name}.`);
    load();
  }

  return (
    <>
      <p className="meta">
        <Link href="/dashboard/payments">← Payments</Link>
      </p>
      <h1 className="section-title">Pay hosts</h1>
      <p className="meta">
        Guests' advances are paid to your account. Once a guest has checked in, the host's share (advance minus Hill Booker's fee) is due. Send it to the host's UPI ID from your own UPI app, then record it here.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="ok" role="status">
          {done}
        </p>
      )}
      {!data && !error && <p className="empty">Loading…</p>}
      {data && (
        <>
          <div className="pay-summary">
            <div className="pay-stat">
              <span className="meta">Due to hosts now</span>
              <b className="price">{money(data.due_total)}</b>
            </div>
            <div className="pay-stat">
              <span className="meta">Paid out so far</span>
              <b className="price">{money(data.paid_total)}</b>
            </div>
          </div>

          <section className="prop-section">
            <h2>Due now</h2>
            {data.hosts.length === 0 && <p className="meta">Nothing is due. Bookings appear here after the guest's check-in date.</p>}
            <ul className="rows">
              {data.hosts.map((h) => (
                <li key={h.host_id} className="plain-row" style={{ display: "block" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                    <div>
                      <p className="row-name">{h.host_name}</p>
                      <p className="meta">{h.upi_id ? <>UPI ID: <b>{h.upi_id}</b></> : "This host has not saved a UPI ID yet. Ask them to add it on their Payments page."}</p>
                      {h.phone && <p className="meta">Phone: {h.phone}</p>}
                    </div>
                    <div className="right">
                      <p className="price">{money(h.amount)}</p>
                      <p className="meta">
                        {h.items.length} booking{h.items.length !== 1 ? "s" : ""}
                      </p>
                      {open !== h.host_id && (
                        <button type="button" className="btn btn-primary btn-small" onClick={() => start(h)}>
                          Mark as paid
                        </button>
                      )}
                    </div>
                  </div>
                  <ul style={{ margin: "0.6rem 0 0", paddingLeft: "1.1rem" }}>
                    {h.items.map((i, n) => (
                      <li key={n} className="meta">
                        {i.item} · {i.guest} · {prettyDate(i.start_date)} · {money(i.share)}
                      </li>
                    ))}
                  </ul>
                  {open === h.host_id && (
                    <div className="narrow" style={{ marginTop: "0.8rem" }}>
                      <p className="meta">
                        After you have sent <b>{money(h.amount)}</b> to {h.upi_id || "the host"}, enter the UPI reference (UTR) shown in your UPI app.
                      </p>
                      <label className="field">
                        <span>UPI reference</span>
                        <input
                          value={ref}
                          onChange={(e) => {
                            setRef(e.target.value);
                            setFormError("");
                          }}
                          placeholder="e.g. 412345678901"
                          autoCapitalize="none"
                          autoComplete="off"
                        />
                      </label>
                      {formError && (
                        <p className="form-error" role="alert">
                          {formError}
                        </p>
                      )}
                      <div className="actions">
                        <button type="button" className="btn btn-primary btn-small" aria-busy={busy} onClick={() => save(h)}>
                          Save payout
                        </button>
                        <button type="button" className="btn btn-small" onClick={() => setOpen("")}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="prop-section">
            <h2>Paid out</h2>
            {data.history.length === 0 && <p className="meta">No payouts recorded yet.</p>}
            <ul className="rows">
              {data.history.map((p) => (
                <li key={p.id} className="plain-row">
                  <div>
                    <p className="row-name">{p.host_name}</p>
                    <p className="meta">
                      {prettyDate(p.paid_at)} · reference {p.reference}
                      {p.upi_id ? ` · to ${p.upi_id}` : ""}
                    </p>
                  </div>
                  <div className="right">
                    <p className="price">{money(p.amount)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}

export default function PayoutsPage() {
  return (
    <Guard>
      <Payouts />
    </Guard>
  );
}
