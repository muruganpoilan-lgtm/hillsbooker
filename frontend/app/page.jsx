import Link from "next/link";
import SearchForm from "../components/SearchForm";

const WHY = [
  ["Pay only 30% to book", "Pay a small advance online and the rest at the property."],
  ["Rooms that are really free", "Every result is open on all of your nights."],
  ["Room held for you", "We hold it for 10 minutes while you pay."],
  ["Safe online payment", "UPI, cards and net banking, secured by Razorpay."],
];

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
              <i>Hire a car, van or bus with a driver by the day, or pick a fixed-price trip.</i>
              <u>See vehicles</u>
            </span>
          </Link>
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
