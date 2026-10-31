import Link from "next/link";
import SearchForm from "../components/SearchForm";
import { slugify } from "../lib/seo";

// To use a real photo for a place, add public/cities/<city-slug>.jpg (for example public/cities/munnar.jpg).
// Until the file exists the card shows its coloured background instead.
const TREND_BIG = [
  { city: "Munnar", tag: "Tea hills and cool mornings", from: "#0e6b58", to: "#3f9a7f" },
  { city: "Ooty", tag: "Nilgiri hills and lakes", from: "#2a3a7a", to: "#5a6fb8" },
];
const TREND_SMALL = [
  { city: "Goa", tag: "Beaches", from: "#b3512b", to: "#e89a5a" },
  { city: "Coorg", tag: "Coffee estates", from: "#7a4b1f", to: "#c08a4d" },
  { city: "Alleppey", tag: "Backwaters", from: "#0b5f7a", to: "#4aa7c4" },
];
const MORE = [
  { city: "Kodaikanal", tag: "Lake and mist", from: "#4b3a7a", to: "#8d77c4" },
  { city: "Wayanad", tag: "Forest stays", from: "#1d5c3a", to: "#5aa072" },
  { city: "Valparai", tag: "Quiet hills", from: "#0a5042", to: "#2f8f78" },
  { city: "Thekkady", tag: "Spice and wildlife", from: "#6b4a12", to: "#b98a2e" },
  { city: "Yercaud", tag: "Shevaroy hills", from: "#2f5c2a", to: "#79a35a" },
];
const WHY = [
  ["Pay only 30% to book", "Pay a small advance online and the rest at the property."],
  ["Rooms that are really free", "Every result is open on all of your nights."],
  ["Room held for you", "We hold it for 10 minutes while you pay."],
  ["Safe online payment", "UPI, cards and net banking, secured by Razorpay."],
];

function Card({ d, className }) {
  return (
    <Link
      href={`/stays/${slugify(d.city)}`}
      className={`hb-card ${className}`}
      style={{ backgroundImage: `url(/cities/${slugify(d.city)}.jpg), linear-gradient(160deg, ${d.from}, ${d.to})` }}
    >
      <span className="hb-card-shade" aria-hidden="true" />
      <span className="hb-card-name">{d.city}</span>
      <span className="hb-card-tag">{d.tag}</span>
    </Link>
  );
}

export default function Home() {
  return (
    <main>
      <section className="hb-hero">
        <div className="hb-hero-in">
          <h1>Find your next stay</h1>
          <p>Hill stations, backwaters and beaches across South India. Rooms and homestays from hosts you can book in minutes.</p>
        </div>
      </section>
      <div className="hb-search">
        <SearchForm />
      </div>

      <section className="page hb-section">
        <h2 className="hb-title">Offers</h2>
        <p className="hb-lead">Simple ways to book with Hill Booker</p>
        <div className="hb-offers">
          <Link href="/search" className="hb-offer hb-offer-a">
            <span>
              <b>Book with just 30%</b>
              <i>Pay a small advance to confirm. Pay the rest when you reach the stay.</i>
              <u>Find a stay</u>
            </span>
          </Link>
          <Link href="/vehicles" className="hb-offer hb-offer-b">
            <span>
              <b>Need a ride too?</b>
              <i>Need a car, van or bus with a driver? Tell us your trip and we will arrange it.</i>
              <u>Cars and vans</u>
            </span>
          </Link>
        </div>
      </section>

      <section className="page hb-section">
        <h2 className="hb-title">Group and corporate tours</h2>
        <p className="hb-lead">Travelling with a big group or your team? Tell us what you need and we will call you with a quote.</p>
        <div className="hb-tours">
          <Link href="/enquiry?kind=group" className="btn btn-primary">Group tour</Link>
          <Link href="/enquiry?kind=corporate" className="btn btn-primary">Corporate tour</Link>
        </div>
      </section>

      <section className="page hb-section">
        <h2 className="hb-title">Trending destinations</h2>
        <p className="hb-lead">Popular places to stay</p>
        <div className="hb-grid-big">
          {TREND_BIG.map((d) => (
            <Card key={d.city} d={d} className="hb-card-big" />
          ))}
        </div>
        <div className="hb-grid-small">
          {TREND_SMALL.map((d) => (
            <Card key={d.city} d={d} className="hb-card-mid" />
          ))}
        </div>
      </section>

      <section className="page hb-section">
        <h2 className="hb-title">More places to explore</h2>
        <div className="hb-row">
          {MORE.map((d) => (
            <Card key={d.city} d={d} className="hb-card-sm" />
          ))}
        </div>
      </section>

      <section className="page hb-section">
        <h2 className="hb-title">Why book with Hill Booker</h2>
        <div className="hb-why">
          {WHY.map(([t, text]) => (
            <div key={t}>
              <span aria-hidden="true">✓</span>
              <b>{t}</b>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="host-band">
        <div className="host-inner">
          <h2>Own a hotel or homestay?</h2>
          <p>Add your rooms and photos, open the nights you want to sell, and set your own prices.</p>
          <Link href="/register" className="btn btn-gold">
            List your property
          </Link>
        </div>
      </section>
    </main>
  );
}
