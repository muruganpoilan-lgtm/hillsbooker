import Link from "next/link";
import SearchForm from "../components/SearchForm";
import HelpVideos from "../components/HelpVideos";
import { slugify } from "../lib/seo";
import { getT } from "../lib/lang";

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
const WHY = [1, 2, 3, 4];

// Festive holiday banner: shows from 1 Dec to 2 Jan (India time), then hides by itself until next season.
const FESTIVE_CITIES = ["Ooty", "Munnar", "Kodaikanal", "Valparai"];
function festiveOn() {
  const [m, d] = new Date()
    .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    .split("-")
    .slice(1)
    .map(Number);
  return m === 12 || (m === 1 && d <= 2);
}

function Card({ d, className, t }) {
  return (
    <Link
      href={`/stays/${slugify(d.city)}`}
      className={`hb-card ${className}`}
      style={{ backgroundImage: `url(/cities/${slugify(d.city)}.jpg), linear-gradient(160deg, ${d.from}, ${d.to})` }}
    >
      <span className="hb-card-shade" aria-hidden="true" />
      <span className="hb-card-name">{t(`city.${d.city}`)}</span>
      <span className="hb-card-tag">{t(`tag.${d.city}`)}</span>
    </Link>
  );
}

export default async function Home() {
  const t = await getT();
  return (
    <main>
      <section className="hb-hero">
        <div className="hb-hero-in">
          <h1>{t("home.title")}</h1>
          <p>{t("home.sub")}</p>
        </div>
      </section>
      <div className="hb-search">
        <SearchForm />
      </div>

      {festiveOn() && (
        <section className="page hb-section">
          <div className="hb-festive">
            <span className="hb-festive-lamps" aria-hidden="true">🪔 ✨ 🎄</span>
            <h2>{t("home.festive.title")}</h2>
            <p>{t("home.festive.text")}</p>
            <div className="hb-festive-cities">
              {FESTIVE_CITIES.map((c) => (
                <Link key={c} href={`/stays/${slugify(c)}`}>{t(`city.${c}`)}</Link>
              ))}
            </div>
            <Link href="/search" className="hb-festive-cta">{t("home.festive.cta")}</Link>
          </div>
        </section>
      )}

      <section className="page hb-section">
        <h2 className="hb-title">{t("home.offers")}</h2>
        <p className="hb-lead">{t("home.offersLead")}</p>
        <div className="hb-offers">
          <Link href="/search" className="hb-offer hb-offer-a">
            <span>
              <b>{t("home.offer1.title")}</b>
              <i>{t("home.offer1.text")}</i>
              <u>{t("home.offer1.cta")}</u>
            </span>
          </Link>
          <Link href="/vehicles" className="hb-offer hb-offer-b">
            <span>
              <b>{t("home.offer2.title")}</b>
              <i>{t("home.offer2.text")}</i>
              <u>{t("home.offer2.cta")}</u>
            </span>
          </Link>
        </div>
      </section>

      <section className="page hb-section">
        <h2 className="hb-title">{t("home.tours")}</h2>
        <p className="hb-lead">{t("home.toursLead")}</p>
        <div className="hb-tours">
          <Link href="/enquiry?kind=group" className="btn btn-primary">{t("home.groupTour")}</Link>
          <Link href="/enquiry?kind=corporate" className="btn btn-primary">{t("home.corpTour")}</Link>
        </div>
      </section>

      <section className="page hb-section">
        <h2 className="hb-title">{t("home.trending")}</h2>
        <p className="hb-lead">{t("home.trendingLead")}</p>
        <div className="hb-grid-big">
          {TREND_BIG.map((d) => (
            <Card key={d.city} d={d} className="hb-card-big" t={t} />
          ))}
        </div>
        <div className="hb-grid-small">
          {TREND_SMALL.map((d) => (
            <Card key={d.city} d={d} className="hb-card-mid" t={t} />
          ))}
        </div>
      </section>

      <section className="page hb-section">
        <h2 className="hb-title">{t("home.more")}</h2>
        <div className="hb-row">
          {MORE.map((d) => (
            <Card key={d.city} d={d} className="hb-card-sm" t={t} />
          ))}
        </div>
      </section>

      <section className="page hb-section">
        <h2 className="hb-title">{t("home.why")}</h2>
        <div className="hb-why">
          {WHY.map((n) => (
            <div key={n}>
              <span aria-hidden="true">✓</span>
              <b>{t(`home.why${n}.t`)}</b>
              <p>{t(`home.why${n}.d`)}</p>
            </div>
          ))}
        </div>
      </section>

      <HelpVideos />

      <section className="host-band">
        <div className="host-inner">
          <h2>{t("home.host.title")}</h2>
          <p>{t("home.host.text")}</p>
          <Link href="/register" className="btn btn-gold">
            {t("home.host.cta")}
          </Link>
        </div>
      </section>
    </main>
  );
}
