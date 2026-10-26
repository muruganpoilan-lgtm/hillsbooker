import Link from "next/link";
import { notFound } from "next/navigation";
import Ridge from "../../../components/Ridge";
import SearchForm from "../../../components/SearchForm";
import { api, money } from "../../../lib/api";
import { CITY_INFO, SITE_URL, jsonLd, slugify } from "../../../lib/seo";

export const dynamic = "force-dynamic";

const TYPE_LABEL = { hotel: "Hotel", homestay: "Homestay", apartment: "Apartment", resort: "Resort" };

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
  const { city } = await params;
  const { info, props, name } = await load(city);
  if (!name) notFound();

  const ld = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Stays in ${name}`,
    itemListElement: props.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE_URL}/properties/${p.id}`, name: p.name })),
  };

  return (
    <main className="page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
      <h1 className="result-title">Hotels and homestays in {name}</h1>
      {info && <p className="prose">{info.blurb}</p>}
      <SearchForm compact initial={{ city: name }} />

      {props.length === 0 ? (
        <div className="empty">
          <h2>No places listed in {name} yet</h2>
          <p>New places are added every week. Try another city, or list your own property.</p>
          <p>
            <Link href="/register" className="btn btn-small">List your property</Link>
          </p>
        </div>
      ) : (
        <>
          <p className="result-summary">{props.length} {props.length === 1 ? "place" : "places"} to stay in {name}. Add your dates to see which rooms are free.</p>
          <ul className="results">
            {props.map((p) => (
              <li key={p.id}>
                <Link className="result" href={`/properties/${p.id}`}>
                  <div className="result-photo">{p.photo ? <img src={p.photo} alt={`${p.name}, ${name}`} loading="lazy" /> : <Ridge seed={p.id} />}</div>
                  <div className="result-body">
                    <p className="meta">{TYPE_LABEL[p.type] || p.type} in {p.city}</p>
                    <h2 className="row-name">{p.name}</h2>
                    <p className="rating">
                      {p.rating_count > 0 ? (
                        <>
                          <b className="score">{Number(p.rating_avg).toFixed(1)}</b> from {p.rating_count} {p.rating_count === 1 ? "review" : "reviews"}
                        </>
                      ) : (
                        "New on Hill Booker"
                      )}
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
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
