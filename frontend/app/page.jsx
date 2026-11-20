import Link from "next/link";
import SearchForm from "../components/SearchForm";
import HelpVideos from "../components/HelpVideos";
import HomeRow from "../components/HomeRow";
import { api, money } from "../lib/api";
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

// "Explore the hills" row. Each region opens the stays page of its main town; the photo comes from public/cities.
const REGIONS = [
  { key: "nilgiris", city: "Ooty", photo: "ooty", towns: ["Ooty", "Coonoor", "Kotagiri"] },
  { key: "keralaHills", city: "Munnar", photo: "munnar", towns: ["Munnar", "Wayanad", "Thekkady"] },
  { key: "anamalai", city: "Valparai", photo: "valparai", towns: ["Valparai", "Kodaikanal"] },
  { key: "coorg", city: "Coorg", photo: "coorg", towns: ["Coorg", "Chikmagalur"] },
  { key: "shevaroy", city: "Yercaud", photo: "yercaud", towns: ["Yercaud", "Kolli Hills"] },
  { key: "backwaters", city: "Alleppey", photo: "alleppey", towns: ["Alleppey", "Kumarakom"] },
];

// "Browse by property type" row. Shows a photo from a real listing of that type; until one exists, a hill photo.
const TYPES = [
  { type: "hotel", fallback: "thekkady" },
  { type: "homestay", fallback: "wayanad" },
  { type: "resort", fallback: "alleppey" },
  { type: "apartment", fallback: "kodaikanal" },
];

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
  const show = await api("/home/showcase");
  const sc = show.ok ? show.data : { cities: {}, types: {}, stays: [] };
  const town = (c) => (t(`city.${c}`) === `city.${c}` ? c : t(`city.${c}`));
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
        <Link href="/plan-trip" className="trip-band">
          <span className="trip-band-icon" aria-hidden="true">✈</span>
          <span>
            <b>{t("home.planTitle")}</b>
            <i>{t("home.planText")}</i>
          </span>
          <u>{t("home.planCta")}</u>
        </Link>
      </section>

      <section className="page hb-section">
        <h2 className="hb-title">{t("home.regions")}</h2>
        <p className="hb-lead">{t("home.regionsLead")}</p>
        <HomeRow label={t("home.regions")}>
          {REGIONS.map((r) => {
            const n = r.towns.reduce((sum, c) => sum + (sc.cities[c.toLowerCase()] || 0), 0);
            // Open the town in this region that has the most stays, so a guest never lands on an empty page.
            const best = r.towns.reduce((a, c) => ((sc.cities[c.toLowerCase()] || 0) > (sc.cities[a.toLowerCase()] || 0) ? c : a), r.city);
            return (
              <Link key={r.key} href={`/stays/${slugify(best)}`} className="hr-card" role="listitem">
                <img src={`/cities/${r.photo}.jpg`} alt="" loading="lazy" className="hr-img" />
                <b className="hr-name">{t(`region.${r.key}`)}</b>
                <span className="hr-sub">
                  {r.towns.map(town).join(" • ")}
                  {n > 0 ? ` · ${t.n("unit.stay", n)}` : ""}
                </span>
              </Link>
            );
          })}
        </HomeRow>
      </section>

      <section className="page hb-section">
        <h2 className="hb-title">{t("home.byType")}</h2>
        <HomeRow label={t("home.byType")}>
          {TYPES.map((x) => {
            const info = sc.types[x.type];
            return (
              <Link key={x.type} href={`/search?type=${x.type}`} className="hr-card" role="listitem">
                <img src={(info && info.photo) || `/cities/${x.fallback}.jpg`} alt="" loading="lazy" className="hr-img" />
                <b className="hr-name">{t(`types.${x.type}`)}</b>
                {info && info.count > 0 && <span className="hr-sub">{t.n("unit.stay", info.count)}</span>}
              </Link>
            );
          })}
        </HomeRow>
      </section>

      {sc.stays.length > 0 && (
        <section className="page hb-section">
          <h2 className="hb-title">{t("home.loved")}</h2>
          <p className="hb-lead">{t("home.lovedLead")}</p>
          <HomeRow label={t("home.loved")}>
            {sc.stays.map((p) => (
              <Link key={p.id} href={`/properties/${p.id}`} className="hr-card" role="listitem">
                <img src={p.photo || `/cities/${slugify(p.city)}.jpg`} alt="" loading="lazy" className="hr-img" />
                <b className="hr-name">{p.name}</b>
                <span className="hr-sub">{t("type.in", { type: t(`type.${p.type}`), city: town(p.city) })}</span>
                <span className="hr-meta">
                  {p.rating_count > 0 ? (
                    <>
                      <i className="score">{Number(p.rating_avg).toFixed(1)}</i> {t.n("unit.review", p.rating_count)}
                    </>
                  ) : (
                    <i className="hr-new">{t("prop.new")}</i>
                  )}
                </span>
                {Number(p.price_from) > 0 && <span className="hr-price">{t("home.priceFrom", { amt: money(p.price_from) })}</span>}
              </Link>
            ))}
          </HomeRow>
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
