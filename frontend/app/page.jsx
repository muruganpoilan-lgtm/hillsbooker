import Link from "next/link";
import SearchForm from "../components/SearchForm";
import HelpVideos from "../components/HelpVideos";
import HomeRow from "../components/HomeRow";
import { api, money, sized } from "../lib/api";
import { CITY_INFO, slugify } from "../lib/seo";
import { getT } from "../lib/lang";

// Photos for places are in public/cities: <city-slug>.webp (640 px, used on cards) and <city-slug>.jpg (960 px, for sharing).
// The hero photo is public/hero/munnar-1200.webp (and -720 for phones).

// "Explore the hills": each region shows its height above sea level (rounded, of the main town) as the big number.
// alt: metres, or 0 for sea level. Each card opens the town in the region that has the most stays.
const REGIONS = [
  { key: "nilgiris", city: "Ooty", photo: "ooty", alt: 2240, towns: ["Ooty", "Coonoor", "Kotagiri"] },
  { key: "keralaHills", city: "Munnar", photo: "munnar", alt: 1600, towns: ["Munnar", "Wayanad", "Thekkady"] },
  { key: "palani", city: "Kodaikanal", photo: "kodaikanal", alt: 2133, towns: ["Kodaikanal"] },
  { key: "anamalai", city: "Valparai", photo: "valparai", alt: 1193, towns: ["Valparai"] },
  { key: "shevaroy", city: "Yercaud", photo: "yercaud", alt: 1515, towns: ["Yercaud", "Kolli Hills"] },
  { key: "coorg", city: "Coorg", photo: "coorg", alt: 1170, towns: ["Coorg", "Chikmagalur"] },
  { key: "backwaters", city: "Alleppey", photo: "alleppey", alt: 0, towns: ["Alleppey", "Kumarakom"] },
];

// "Browse by property type". Shows a photo from a real listing of that type; until one exists, a hill photo.
const TYPES = [
  { type: "homestay", fallback: "wayanad" },
  { type: "hotel", fallback: "thekkady" },
  { type: "resort", fallback: "alleppey" },
  { type: "apartment", fallback: "kodaikanal" },
];

// "Popular towns" links (good for Google). A town shows if it has a city page or any listed stay.
const TOWNS = ["Ooty", "Munnar", "Kodaikanal", "Valparai", "Coonoor", "Kotagiri", "Coorg", "Wayanad", "Yercaud", "Thekkady", "Alleppey", "Goa"];
const WHY = [1, 2, 3, 4];

const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
// Festive holiday banner: shows from 1 Dec to 2 Jan (India time), then hides by itself until next season.
const FESTIVE_CITIES = ["Ooty", "Munnar", "Kodaikanal", "Valparai"];
function festiveOn() {
  const [m, d] = todayIST().split("-").slice(1).map(Number);
  return m === 12 || (m === 1 && d <= 2);
}
// The owner offer line in the strip under the search: shown until this date (inclusive), then hidden.
const OWNER_OFFER_UNTIL = "2026-11-30";

export default async function Home() {
  const t = await getT();
  const show = await api("/home/showcase");
  const sc = show.ok ? show.data : { cities: {}, types: {}, stays: [] };
  const town = (c) => (t(`city.${c}`) === `city.${c}` ? c : t(`city.${c}`));
  const count = (c) => sc.cities[c.toLowerCase()] || 0;
  const popular = [
    ...TOWNS.filter((c) => CITY_INFO[slugify(c)] || count(c) > 0),
    // any other town where an owner has listed, in the order of most stays
    ...Object.entries(sc.cities)
      .filter(([c]) => !TOWNS.some((x) => x.toLowerCase() === c))
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c.replace(/\b\w/g, (ch) => ch.toUpperCase())),
  ];

  return (
    <main>
      <section className="hb-hero hb-hero-photo">
        <img
          src="/hero/munnar-1200.webp"
          srcSet="/hero/munnar-720.webp 720w, /hero/munnar-1200.webp 1200w"
          sizes="100vw"
          alt={t("home.heroAlt")}
          className="hb-hero-img"
          fetchPriority="high"
          decoding="async"
        />
        <div className="hb-hero-in">
          <h1>{t("home.heroTitle")}</h1>
          <p>{t("home.heroSub")}</p>
        </div>
      </section>
      <div className="hb-search">
        <SearchForm />
      </div>

      <div className="hb-owners-wrap">
        <div className="hb-owners">
          <p>
            <b>{t("home.ownersTitle")}</b> {t("home.ownersText")}
            {todayIST() <= OWNER_OFFER_UNTIL ? <span className="hb-owners-deal"> {t("home.ownersDeal")}</span> : null}
          </p>
          <Link href="/register">{t("home.host.cta")}</Link>
        </div>
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
        <h2 className="hb-title">{t("home.regions")}</h2>
        <p className="hb-lead">{t("home.altLead")}</p>
        <HomeRow label={t("home.regions")}>
          {REGIONS.map((r) => {
            const n = r.towns.reduce((sum, c) => sum + count(c), 0);
            const best = r.towns.reduce((a, c) => (count(c) > count(a) ? c : a), r.city);
            return (
              <Link key={r.key} href={`/stays/${slugify(best)}`} className="alt-card" role="listitem">
                <img src={`/cities/${r.photo}.webp`} alt="" loading="lazy" decoding="async" />
                <span className="alt-shade" aria-hidden="true" />
                <span className="alt-m">{r.alt > 0 ? t("home.altM", { m: r.alt.toLocaleString("en-IN") }) : t("home.seaLevel")}</span>
                <span className="alt-name">{t(`region.${r.key}`)}</span>
                <span className="alt-towns">
                  {r.towns.map(town).join(", ")}
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
                <img src={sized(info && info.photo, 640) || `/cities/${x.fallback}.webp`} alt="" loading="lazy" decoding="async" className="hr-img" />
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
                <img src={sized(p.photo, 640) || `/cities/${slugify(p.city)}.webp`} alt="" loading="lazy" decoding="async" className="hr-img" />
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
            <Link href="/search" className="hr-card hr-all" role="listitem">
              <span className="hr-all-box">
                <b>{t("home.seeAll")}</b>
                <span>›</span>
              </span>
            </Link>
          </HomeRow>
        </section>
      )}

      <section className="page hb-section">
        <h2 className="hb-title">{t("home.tripsTitle")}</h2>
        <div className="hb-trips">
          <Link href="/plan-trip" className="hb-trip hb-trip-main">
            <b>{t("home.planTitle")}</b>
            <span>{t("home.planText")}</span>
            <u>{t("home.planCta")}</u>
          </Link>
          <Link href="/vehicles" className="hb-trip">
            <b>{t("home.carsTitle")}</b>
            <span>{t("home.carsText")}</span>
            <u>{t("home.carsCta")}</u>
          </Link>
          <Link href="/enquiry?kind=group" className="hb-trip">
            <b>{t("home.tours")}</b>
            <span>{t("home.toursText")}</span>
            <u>{t("home.toursCta")}</u>
          </Link>
        </div>
      </section>

      <section className="page hb-section">
        <h2 className="hb-title">{t("home.why")}</h2>
        <div className="hb-why hb-why-plain">
          {WHY.map((n) => (
            <div key={n}>
              <b>{t(`home.why${n}.t`)}</b>
              <p>{t(`home.why${n}.d`)}</p>
            </div>
          ))}
        </div>
      </section>

      <HelpVideos />

      {popular.length > 0 && (
        <section className="page hb-section">
          <h2 className="hb-title">{t("home.popular")}</h2>
          <nav className="hb-towns" aria-label={t("home.popular")}>
            {popular.map((c) => (
              <Link key={c} href={`/stays/${slugify(c)}`}>{town(c)}</Link>
            ))}
          </nav>
        </section>
      )}

      <section className="host-band host-band-new">
        <div className="host-inner host-inner-new">
          <div>
            <h2>{t("home.hostTitle")}</h2>
            <p>{t("home.hostText")}</p>
            <Link href="/register" className="btn btn-gold">
              {t("home.host.cta")}
            </Link>
          </div>
          <ul className="host-points">
            {[1, 2, 3, 4].map((n) => (
              <li key={n}>{t(`home.hostP${n}`)}</li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
