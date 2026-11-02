"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../components/AuthProvider";
import HeartButton from "../../components/HeartButton";
import Ridge from "../../components/Ridge";
import { api, money } from "../../lib/api";

const TYPE_LABEL = { hotel: "Hotel", homestay: "Homestay", apartment: "Apartment", resort: "Resort" };

export default function SavedPage() {
  const { ready, token } = useAuth();
  const [list, setList] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      window.location.replace("/login?next=/saved");
      return;
    }
    api("/wishlist", { token }).then((res) => {
      if (res.ok) setList(res.data);
      else setError(res.error);
    });
  }, [ready, token]);

  return (
    <main className="page">
      <h1 className="result-title">Saved places</h1>
      {error ? (
        <div className="empty" role="alert"><p>{error}</p></div>
      ) : list === null ? (
        <p className="result-summary">Loading…</p>
      ) : list.length === 0 ? (
        <div className="empty">
          <h2>Nothing saved yet</h2>
          <p>Tap the heart on any place to keep it here for later.</p>
          <p><Link href="/" className="btn btn-small">Find a stay</Link></p>
        </div>
      ) : (
        <ul className="results">
          {list.map((p) => (
            <li key={p.id} className="has-heart">
              <Link className="result" href={`/properties/${p.id}`}>
                <div className="result-photo">{p.photo ? <img src={p.photo} alt="" loading="lazy" /> : <Ridge seed={p.id} />}</div>
                <div className="result-body">
                  <p className="meta">{TYPE_LABEL[p.type] || p.type} in {p.city}</p>
                  <h2 className="row-name">{p.name}</h2>
                  <p className="rating">
                    {p.rating_count > 0 ? <><b className="score">{Number(p.rating_avg).toFixed(1)}</b> from {p.rating_count} {p.rating_count === 1 ? "review" : "reviews"}</> : "New on Hill Booker"}
                  </p>
                </div>
                {p.price_from != null && (
                  <div className="price-box">
                    <span className="price-sub">from</span>
                    <span className="price">{money(p.price_from)}</span>
                    <span className="price-sub">a night</span>
                  </div>
                )}
              </Link>
              <HeartButton id={p.id} name={p.name} className="on-card" />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
