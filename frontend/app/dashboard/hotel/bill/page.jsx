"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../../components/AuthProvider";
import Guard from "../../../../components/dashboard/Guard";
import { api, money, plural, prettyDate } from "../../../../lib/api";

const day = (v) => String(v).slice(0, 10);

// A guest's bill, laid out to print on one sheet: the room, each extra, what was paid and the balance.
function Bill() {
  const { token, logout } = useAuth();
  const [b, setB] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const kind = q.get("kind");
    const id = q.get("id") || "";
    if (!/^[0-9a-f-]{36}$/i.test(id) || (kind !== "walkin" && kind !== "hillbooker")) return setError("This bill link is not complete. Open the bill from the Guest register.");
    api(kind === "walkin" ? `/hotel/guests/${id}/bill` : `/hotel/bookings/${id}/bill`, { token }).then((res) => {
      if (res.status === 401) return logout();
      if (!res.ok) return setError(res.error);
      setB(res.data);
    });
  }, [token, logout]);

  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (!b) return <p className="empty">Loading…</p>;
  const balance = Number(b.balance);

  return (
    <>
      <div className="actions mh-noprint" style={{ marginBottom: "1rem" }}>
        <Link href="/dashboard/hotel/guests" className="btn btn-small">
          ← Guest register
        </Link>
        <button type="button" className="btn btn-small btn-primary" onClick={() => window.print()}>
          Print bill
        </button>
      </div>
      <article className="mh-bill">
        <header>
          <div>
            <h1>{b.hotel}</h1>
            <p className="meta">{[b.hotel_address, b.city].filter(Boolean).join(", ")}</p>
          </div>
          <div className="right">
            <b>Guest bill</b>
            <p className="meta">{prettyDate(day(b.today))}</p>
            {b.invoice_no && <p className="meta">Booking invoice {b.invoice_no}</p>}
          </div>
        </header>
        <div className="mh-bill-who">
          <div>
            <p className="meta">Guest</p>
            <b>{b.name}</b>
            {b.phone && <p className="meta">{b.phone}</p>}
            {b.address && <p className="meta">{b.address}</p>}
          </div>
          <div>
            <p className="meta">Stay</p>
            <b>
              {prettyDate(day(b.check_in))} to {prettyDate(day(b.check_out))}
            </b>
            <p className="meta">
              {plural(b.nights, "night")} · {plural(b.people, "guest")} · {b.room || b.room_type || "Room"}
            </p>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Details</th>
              <th className="n">Qty</th>
              <th className="n">Rate</th>
              <th className="n">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                Room charge{b.room_type ? `, ${b.room_type}` : ""}
                <span className="meta">{plural(b.nights, "night")}</span>
              </td>
              <td className="n"></td>
              <td className="n"></td>
              <td className="n">{money(b.room_total)}</td>
            </tr>
            {b.charges.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.name}
                  <span className="meta">{prettyDate(day(c.charged_on))}</span>
                </td>
                <td className="n">{c.qty}</td>
                <td className="n">{money(c.unit_price)}</td>
                <td className="n">{money(c.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Total</td>
              <td className="n">{money(b.total)}</td>
            </tr>
            {Number(b.paid_online) > 0 && (
              <tr className="sub">
                <td colSpan={3}>Paid online through Hill Booker</td>
                <td className="n">− {money(b.paid_online)}</td>
              </tr>
            )}
            {Number(b.paid_here) > 0 && (
              <tr className="sub">
                <td colSpan={3}>Paid at the property</td>
                <td className="n">− {money(b.paid_here)}</td>
              </tr>
            )}
            <tr className="due">
              <td colSpan={3}>{balance > 0 ? "Balance to pay" : balance < 0 ? "To return to the guest" : "Balance"}</td>
              <td className="n">{balance === 0 ? "Nil" : money(Math.abs(balance))}</td>
            </tr>
          </tfoot>
        </table>
        <p className="meta mh-bill-foot">Thank you for staying with us.</p>
      </article>
    </>
  );
}

export default function Page() {
  return (
    <Guard>
      <Bill />
    </Guard>
  );
}
