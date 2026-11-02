import Link from "next/link";
import { notFound } from "next/navigation";
import HeartButton from "../../../components/HeartButton";
import Ridge from "../../../components/Ridge";
import SearchForm from "../../../components/SearchForm";
import { api, money } from "../../../lib/api";
import { getT } from "../../../lib/lang";
import { CITY_INFO, SITE_URL, jsonLd, slugify } from "../../../lib/seo";

export const dynamic = "force-dynamic";

const TYPES = ["hotel", "homestay", "apartment", "resort"];

async function load(slug) {
  const info = CITY_INFO[slug];
  // Find the city's real spelling from the properties; fall back to the known name.
  const res = await api("/seo/properties");
  const all = res.ok ? res.data : [];
  const props = all.filter((p) => slugify(p.city) === slug);
  const name = props[0]?.city || info?.name || "";
  return { info, props, name };
}

export async function generateMetadata({ params }) {
  const { city } = await params;
  const { props, name, info } = await load(city);
  if (!name) return { title: "Not found" };
  const title = `Hotels and homestays in ${name}: book rooms`;
  const description = `${info ? info.blurb + " " : ""}Compare ${props.length === 1 ? "1 place" : props.length ? `${props.length} places` : "places"} to stay in ${name} and book rooms that are free on every night of your stay.`.slice(0, 300);
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/stays/${city}` },
    openGraph: { title, description, url: `${SITE_URL}/stays/${city}`, type: "website", images: props[0]?.photo ? [props[0].photo] : undefined },
    // A page with no places yet is thin; keep it out of search results until there is something on it.
    robots: props.length ? undefined : { index: false, follow: true },
  };
}

export default async function CityPage({ params }) {
  const t = await getT();
  const { city } = await params;
  const { info, props, name } = await load(city);
  if (!name) notFound();

  const ld = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Stays in ${name}`,
    itemListElement: props.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE_URL}/properties/${p.id}`, name: p.name })),
  };

  const shown = t(`city.${name}`) !== `city.${name}` ? t(`city.${name}`) : name; // the city in the chosen language, when we know it
  return (
    <main className="page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
      <h1 className="result-title">{t("cityPage.h1", { name: shown })}</h1>
      {info && <p className="prose">{info.blurb}</p>}
      <SearchForm compact initial={{ city: name }} />

      {props.length === 0 ? (
        <div className="empty">
          <h2>{t("cityPage.none", { name: shown })}</h2>
          <p>{t("cityPage.noneHelp")}</p>
          <p>
            <Link href="/register" className="btn btn-small">{t("footer.list")}</Link>
          </p>
        </div>
      ) : (
        <>
          <p className="result-summary">{t("cityPage.summary", { places: t.n("unit.place", props.length), name: shown })}</p>
          <ul className="results">
            {props.map((p) => (
              <li key={p.id} className="has-heart">
                <Link className="result" href={`/properties/${p.id}`}>
                  <div className="result-photo">{p.photo ? <img src={p.photo} alt={`${p.name}, ${name}`} loading="lazy" /> : <Ridge seed={p.id} />}</div>
                  <div className="result-body">
                    <p className="meta">{t("type.in", { type: TYPES.includes(p.type) ? t(`type.${p.type}`) : p.type, city: p.city })}</p>
                    <h2 className="row-name">{p.name}</h2>
                    <p className="rating">
                      {p.rating_count > 0 ? (
                        <>
                          {t("search.ratingFrom", { score: Number(p.rating_avg).toFixed(1), reviews: t.n("unit.review", p.rating_count) })}
                        </>
                      ) : (
                        t("search.new")
                      )}
                    </p>
                  </div>
                  {p.price_from != null && (
                    <div className="price-box">
                      <span className="price-sub">{t("cityPage.from")}</span>
                      <span className="price">{money(p.price_from)}</span>
                      <span className="price-sub">{t("search.aNight")}</span>
                    </div>
                  )}
                </Link>
                      <HeartButton id={p.id} name={p.name} className="on-card" />
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
