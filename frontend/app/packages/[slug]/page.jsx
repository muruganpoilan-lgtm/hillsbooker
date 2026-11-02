import Link from "next/link";
import { notFound } from "next/navigation";
import PackageEnquiry from "../../../components/PackageEnquiry";
import PhotoGallery from "../../../components/PhotoGallery";
import { api, money } from "../../../lib/api";
import { getT } from "../../../lib/lang";
import { SITE_URL, jsonLd } from "../../../lib/seo";

export const dynamic = "force-dynamic";

const lines = (s) => (s || "").split("\n").map((x) => x.trim()).filter(Boolean);

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const res = await api(`/packages/${slug}`);
  if (!res.ok) return { title: "Trip package" };
  const p = res.data;
  const url = `${SITE_URL}/packages/${p.slug}`;
  const description = (p.summary || `${p.title}, ${p.nights} nights in ${p.destination}.`).slice(0, 300);
  return { title: p.title, description, alternates: { canonical: url }, openGraph: { title: p.title, description, url, type: "website", images: p.photos && p.photos[0] ? [p.photos[0].url] : undefined } };
}

export default async function PackagePage({ params }) {
  const { slug } = await params;
  const t = await getT();
  const res = await api(`/packages/${slug}`);
  if (!res.ok && res.status === 404) notFound();
  if (!res.ok) {
    return (
      <main className="page">
        <div className="empty" role="alert">
          <h2>{t("pkg.loadFail")}</h2>
          <p>{res.error}</p>
        </div>
      </main>
    );
  }
  const p = res.data;
  const photos = (p.photos || []).map((x) => x.url);
  const ld = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: p.title,
    description: p.summary || undefined,
    image: photos.length ? photos : undefined,
    offers: { "@type": "Offer", priceCurrency: "INR", price: Number(p.price_per_person), url: `${SITE_URL}/packages/${p.slug}` },
  };
  const itinerary = lines(p.itinerary);
  const includes = lines(p.includes);
  const excludes = lines(p.excludes);
  return (
    <main className="page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
      <p className="meta">
        <Link href="/packages">← {t("pkg.back")}</Link>
      </p>
      <div className="prop-head">
        <p className="meta">
          {p.destination} · {t("pkg.nd", { nights: p.nights, days: p.days })}
        </p>
        <h1>{p.title}</h1>
        <p className="rating">
          <span className="price">{money(p.price_per_person)}</span> <span className="meta">{t("pkg.perPerson")} · {t("pkg.minPeople", { n: p.min_people })}</span>
        </p>
      </div>

      <PhotoGallery photos={photos} name={p.title} seed={p.id} />

      <div className="prop-body">
        <div>
          {p.summary && <p className="prose">{p.summary}</p>}
          {itinerary.length > 0 && (
            <section className="prop-section">
              <h2>{t("pkg.itinerary")}</h2>
              <ul className="amenity-list" style={{ display: "grid", gap: "0.5rem" }}>
                {itinerary.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </section>
          )}
          {includes.length > 0 && (
            <section className="prop-section">
              <h2>{t("pkg.includes")}</h2>
              <ul className="amenity-list">
                {includes.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </section>
          )}
          {excludes.length > 0 && (
            <section className="prop-section">
              <h2>{t("pkg.excludes")}</h2>
              <ul className="amenity-list">
                {excludes.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </section>
          )}
          <p className="meta">{t("pkg.priceNote")}</p>
        </div>
      </div>

      <section className="prop-section">
        <PackageEnquiry slug={p.slug} minPeople={p.min_people} />
      </section>
    </main>
  );
}
