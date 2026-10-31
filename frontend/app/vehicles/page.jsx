import Link from "next/link";
import Ridge from "../../components/Ridge";
import { api, money } from "../../lib/api";
import { SITE_URL } from "../../lib/seo";
import { KINDS, vehicleLine } from "../../lib/vehicles";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }) {
  const sp = await searchParams;
  const city = (Array.isArray(sp.city) ? sp.city[0] : sp.city) || "";
  const title = city ? `Cars, vans and buses for hire in ${city}` : "Cars, vans and buses for hire";
  const description = `Hire a car, van, tempo traveller or bus with a driver${city ? ` in ${city}` : ""}. Pay by the day or choose a fixed-price trip, and book online on Hill Booker.`;
  return { title, description, alternates: { canonical: `${SITE_URL}/vehicles` }, robots: city ? { index: false, follow: true } : undefined };
}

export default async function VehiclesPage({ searchParams }) {
  const sp = await searchParams;
  const get = (k) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) || "";
  const city = get("city").trim();
  const kind = KINDS.some(([k]) => k === get("kind")) ? get("kind") : "";
  const qs = new URLSearchParams();
  if (city) qs.set("city", city);
  if (kind) qs.set("kind", kind);
  const res = await api(`/vehicles${qs.toString() ? `?${qs}` : ""}`);
  const rows = res.ok ? res.data : [];

  return (
    <main className="page">
      <h1 className="result-title">Cars, vans and buses for hire{city ? ` in ${city}` : ""}</h1>
      <p className="prose">Every vehicle comes with a driver. Hire by the day, or pick a fixed-price trip set by the operator.</p>
      <form className="dates-bar" method="get" action="/vehicles">
        <label className="field">
          <span>City</span>
          <input type="text" name="city" defaultValue={city} placeholder="Munnar, Ooty, Valparai" />
        </label>
        <label className="field">
          <span>Type</span>
          <select name="kind" defaultValue={kind}>
            <option value="">Any</option>
            {KINDS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-small">
          Search vehicles
        </button>
      </form>

      {!res.ok && (
        <p className="form-error" role="alert">
          {res.error}
        </p>
      )}
      {res.ok && rows.length === 0 && !city && !kind && (
        <div className="empty">
          <h2>We will arrange your car or van</h2>
          <p>
            Online vehicle listings are coming soon. Meanwhile, tell us where and when you are travelling, and our team will arrange a car, van, tempo traveller or bus with a driver
            and call you with the price.
          </p>
          <p>
            <a
              className="btn btn-primary"
              href={`https://wa.me/918300841442?text=${encodeURIComponent("Hi Hill Booker, I need a vehicle with a driver. Pickup place: , Destination: , Date: , Number of people: ")}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp us
            </a>{" "}
            <Link className="btn" href="/enquiry?kind=group">
              Send an enquiry
            </Link>
          </p>
        </div>
      )}
      {res.ok && rows.length === 0 && (city || kind) && (
        <div className="empty">
          <h2>No vehicles found</h2>
          <p>Try another city, or remove the type filter.</p>
        </div>
      )}
      <ul className="results">
        {rows.map((v) => (
          <li key={v.id}>
            <Link className="result" href={`/vehicles/${v.id}`}>
              <div className="result-photo">{v.photo ? <img src={v.photo} alt={`${v.name}, ${v.city}`} loading="lazy" /> : <Ridge seed={v.id} />}</div>
              <div className="result-body">
                <p className="meta">{vehicleLine(v)}</p>
                <h2 className="row-name">{v.name}</h2>
                {v.trip_from != null && <p className="rating">Fixed trips from {money(v.trip_from)}</p>}
              </div>
              <div className="price-box">
                <span className="price">{money(v.price_per_day)}</span>
                <span className="price-sub">per day</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
