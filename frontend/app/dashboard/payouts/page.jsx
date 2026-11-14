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
  const [xBusy, setXBusy] = useState("");
  const [xResults, setXResults] = useState(null);

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
    setOpen(host.key);
    setRef("");
    setFormError("");
    setDone("");
  }

  // Lines for one property's own owner are paid by hand; Razorpay pays only to a host account's own details.
  function canAuto(h) {
    return !h.property_id && Boolean(h.upi_id || h.bank);
  }

  async function payViaRazorpay(hosts) {
    const list = hosts.filter(canAuto);
    if (list.length === 0) return;
    const total = list.reduce((sum, h) => sum + Number(h.amount), 0);
    const names = list.map((h) => `${h.host_name} ${money(h.amount)}`).join("\n");
    if (!window.confirm(`Send ${money(total)} through Razorpay now?\n\n${names}\n\nThis moves real money and cannot be undone.`)) return;
    setXBusy(list.length === 1 ? list[0].host_id : "all");
    setXResults(null);
    setError("");
    setDone("");
    const res = await api("/admin/payouts/razorpayx", {
      method: "POST",
      token,
      body: { items: list.map((h) => ({ host_id: h.host_id, expected_amount: h.amount })) },
    });
    setXBusy("");
    if (res.status === 401) return logout();
    if (!res.ok) return setError(res.error);
    const names2 = Object.fromEntries(list.map((h) => [h.host_id, h.host_name]));
    setXResults(res.data.results.map((r) => ({ ...r, name: names2[r.host_id] || "Host" })));
    load();
  }

  async function checkStatus(id) {
    setXBusy(id);
    setError("");
    const res = await api(`/admin/payouts/${id}/sync`, { method: "POST", token });
    setXBusy("");
    if (res.status === 401) return logout();
    if (!res.ok) setError(res.error);
    load();
  }

  async function releasePayout(id) {
    if (!window.confirm("Only do this if you have checked in RazorpayX that NO money was sent for this payout.\n\nThe amount will become due again. Continue?")) return;
    setXBusy(id);
    setError("");
    const res = await api(`/admin/payouts/${id}/release`, { method: "POST", token, body: { confirm_not_sent: true } });
    setXBusy("");
    if (res.status === 401) return logout();
    if (!res.ok) setError(res.error);
    load();
  }

  async function save(host) {
    setFormError("");
    const r = ref.trim();
    if (!/^[A-Za-z0-9]{6,30}$/.test(r)) {
      setFormError("Enter the UPI reference of your transfer first (6 to 30 letters or numbers).");
      return;
    }
    setBusy(true);
    const res = await api("/admin/payouts", {
      method: "POST",
      token,
      body: { host_id: host.host_id, property_id: host.property_id || null, reference: r, expected_amount: host.amount },
    });
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
            <h2>All hosts</h2>
            {data.all_hosts.length === 0 && <p className="meta">No hosts yet.</p>}
            {data.all_hosts.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left" }}>
                      <th>Host</th>
                      <th>UPI ID</th>
                      <th>Bank</th>
                      <th>Phone</th>
                      <th>Due now</th>
                      <th>Paid out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.all_hosts.map((h) => (
                      <tr key={h.host_id}>
                        <td>{h.host_name}</td>
                        <td>{h.upi_id || <span className="meta">Not added yet</span>}</td>
                        <td>{h.has_bank ? "Added" : <span className="meta">Not added</span>}</td>
                        <td>{h.phone || "-"}</td>
                        <td>{money(h.due)}</td>
                        <td>{money(h.paid_out)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="prop-section">
            <h2>Property owners</h2>
            <p className="meta">Owners you saved on properties you listed for them (edit a property to add or change these).</p>
            {(data.property_owners || []).length === 0 && <p className="meta">No owner details saved on any property yet.</p>}
            {(data.property_owners || []).length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left" }}>
                      <th>Property</th>
                      <th>Owner</th>
                      <th>WhatsApp</th>
                      <th>UPI ID</th>
                      <th>Bank</th>
                      <th>Due now</th>
                      <th>Paid out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.property_owners.map((o) => (
                      <tr key={o.property_id}>
                        <td>
                          <Link href={`/dashboard/properties/${o.property_id}`}>{o.property_name}</Link>
                          <div className="meta">{o.city}</div>
                        </td>
                        <td>{o.owner_name || <span className="meta">Not added</span>}</td>
                        <td>{o.whatsapp || <span className="meta">Not added</span>}</td>
                        <td>{o.upi_id || <span className="meta">Not added</span>}</td>
                        <td>
                          {o.bank ? (
                            <>
                              {o.bank.holder}
                              <div className="meta">
                                A/C {o.bank.account} · IFSC {o.bank.ifsc}
                              </div>
                            </>
                          ) : (
                            <span className="meta">Not added</span>
                          )}
                        </td>
                        <td>{o.upi_id || o.bank ? money(o.due) : <span className="meta">Paid with {o.account_name}</span>}</td>
                        <td>{money(o.paid_out)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="prop-section">
            <h2>Due now</h2>
            {data.razorpayx_enabled && data.hosts.length > 0 && (
              <div style={{ margin: "0.4rem 0 0.8rem" }}>
                <button type="button" className="btn btn-primary" aria-busy={xBusy === "all"} onClick={() => payViaRazorpay(data.hosts)}>
                  Pay all hosts via Razorpay ({data.hosts.filter(canAuto).length} of {data.hosts.length})
                </button>
                {data.hosts.some((h) => !canAuto(h)) && (
                  <p className="meta">
                    Hosts with no UPI ID or bank account are skipped. Ask them to add one on their Payments page. Property owners' lines are paid by hand: use
                    Mark as paid.
                  </p>
                )}
              </div>
            )}
            {xResults && (
              <ul className="rows" style={{ marginBottom: "1rem" }}>
                {xResults.map((r) => (
                  <li key={r.host_id} className="plain-row">
                    <div>
                      <p className="row-name">{r.name}</p>
                      <p className={r.ok === true ? "ok" : r.ok === false ? "form-error" : "meta"}>{r.message}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {data.hosts.length === 0 && <p className="meta">Nothing is due. Bookings appear here after the guest's check-in date.</p>}
            <ul className="rows">
              {data.hosts.map((h) => (
                <li key={h.key} className="plain-row" style={{ display: "block" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                    <div>
                      <p className="row-name">{h.host_name}</p>
                      {h.property_id && <p className="meta">Owner of <b>{h.property_name}</b></p>}
                      <p className="meta">
                        {h.upi_id ? (
                          <>
                            UPI ID: <b>{h.upi_id}</b>
                          </>
                        ) : h.property_id ? (
                          "No UPI ID saved for this owner."
                        ) : (
                          "This host has not saved a UPI ID yet. Ask them to add it on their Payments page."
                        )}
                      </p>
                      {h.bank && (
                        <p className="meta">
                          Bank: <b>{h.bank.holder}</b> · A/C <b>{h.bank.account}</b> · IFSC <b>{h.bank.ifsc}</b>
                        </p>
                      )}
                      {h.phone && <p className="meta">{h.property_id ? "WhatsApp" : "Phone"}: {h.phone}</p>}
                    </div>
                    <div className="right">
                      <p className="price">{money(h.amount)}</p>
                      <p className="meta">
                        {h.items.length} booking{h.items.length !== 1 ? "s" : ""}
                      </p>
                      {open !== h.key && (
                        <div className="actions">
                          {data.razorpayx_enabled && canAuto(h) && (
                            <button type="button" className="btn btn-primary btn-small" aria-busy={xBusy === h.host_id} onClick={() => payViaRazorpay([h])}>
                              Pay via Razorpay
                            </button>
                          )}
                          <button type="button" className="btn btn-small" onClick={() => start(h)}>
                            Mark as paid
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <ul style={{ margin: "0.6rem 0 0", paddingLeft: "1.1rem" }}>
                    {h.items.map((i, n) => (
                      <li key={n} className="meta">
                        {i.item}
                        {i.owner_name ? ` (owner ${i.owner_name}, no UPI or bank saved)` : ""} · {i.guest} · {prettyDate(i.start_date)} · {money(i.share)}
                      </li>
                    ))}
                  </ul>
                  {open === h.key && (
                    <div className="narrow" style={{ marginTop: "0.8rem" }}>
                      <p className="meta">
                        After you have sent <b>{money(h.amount)}</b> to {h.upi_id || (h.bank ? `A/C ${h.bank.account}` : "the host")}, enter the transfer reference (UTR) from your UPI app or bank.
                      </p>
                      <label className="field">
                        <span>Transfer reference</span>
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
                      {prettyDate(p.paid_at)}
                      {p.method === "razorpayx" ? " · via Razorpay" : " · by hand"}
                      {p.status === "paid" && ` · reference ${p.reference}`}
                      {p.destination ? ` · to ${p.destination}` : p.upi_id ? ` · to ${p.upi_id}` : ""}
                    </p>
                    {p.status === "processing" && (
                      <p className="meta">
                        <b>On its way.</b> {p.failure_reason || "Razorpay is still sending it."}
                      </p>
                    )}
                    {p.status === "failed" && (
                      <p className="form-error">
                        Not sent. {p.failure_reason || ""} The amount is due again.
                      </p>
                    )}
                    {p.status === "processing" && p.method === "razorpayx" && (
                      <div className="actions">
                        <button type="button" className="btn btn-small" aria-busy={xBusy === p.id} onClick={() => checkStatus(p.id)}>
                          Check status
                        </button>
                        <button type="button" className="btn btn-danger btn-small" onClick={() => releasePayout(p.id)}>
                          Money was not sent
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="right">
                    <p className="price" style={p.status === "failed" ? { textDecoration: "line-through" } : undefined}>
                      {money(p.amount)}
                    </p>
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
