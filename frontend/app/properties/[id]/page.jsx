import { notFound } from "next/navigation";
import AvailabilityCalendar from "../../../components/AvailabilityCalendar";
import HeartButton from "../../../components/HeartButton";
import PhotoGallery from "../../../components/PhotoGallery";
import RoomList from "../../../components/RoomList";
import PropertyMap, { mapPoint } from "../../../components/PropertyMap";
import { api, isISODate, nightsBetween } from "../../../lib/api";
import { getT } from "../../../lib/lang";
import { readOccupancy } from "../../../lib/occupancy";
import { SITE_URL, jsonLd } from "../../../lib/seo";

const TYPE_LABEL = { hotel: "Hotel", homestay: "Homestay", apartment: "Apartment", resort: "Resort" };

export async function generateMetadata({ params }) {
  const { id } = await params;
  const t = await getT();
  const res = await api(`/properties/${id}`);
  if (!res.ok) return { title: "Property" };
  const p = res.data;
  const kind = TYPE_LABEL[p.type] || "Stay";
  const title = t("prop.metaTitle", { name: p.name, city: p.city, kind: t.lang === "en" ? kind : (t(`type.${p.type}`) || kind) });
  const base = p.description ? p.description.replace(/\s+/g, " ").trim() : `${kind} in ${p.city}.`;
  const description = `${base.slice(0, 150)}${base.length > 150 ? "…" : ""} Book rooms at ${p.name} on Hill Booker.`.slice(0, 300);
  const url = `${SITE_URL}/properties/${id}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", images: p.photos && p.photos[0] ? [p.photos[0]] : undefined },
  };
}

export default async function PropertyPage({ params, searchParams }) {
  const { id } = await params;
  const t = await getT();
  const sp = await searchParams;
  const get = (k) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) || "";

  const ci = isISODate(get("check_in")) ? get("check_in") : "";
  const co = isISODate(get("check_out")) ? get("check_out") : "";
  const hasDates = Boolean(ci && co && co > ci);
  const occ = readOccupancy(get);
  const guests = occ.adults + occ.ages.length;
  const children = occ.ages.length;

  const qs = hasDates ? `?${new URLSearchParams({ check_in: ci, check_out: co }).toString()}` : "";
  const res = await api(`/properties/${id}${qs}`);

  if (!res.ok && res.status === 404) notFound();
  if (!res.ok) {
    return (
      <main className="page">
        <div className="empty" role="alert">
          <h2>{t("prop.loadFail")}</h2>
          <p>{res.error}</p>
        </div>
      </main>
    );
  }

  const p = res.data;
  const prices = p.room_types.map((r) => Number(r.base_price)).filter((n) => n > 0);
  const ld = {
    "@context": "https://schema.org",
    "@type": p.type === "hotel" || p.type === "resort" ? "Hotel" : "LodgingBusiness",
    name: p.name,
    url: `${SITE_URL}/properties/${p.id}`,
    description: p.description || undefined,
    image: p.photos && p.photos.length ? p.photos : undefined,
    address: { "@type": "PostalAddress", streetAddress: p.address || undefined, addressLocality: p.city, addressCountry: "IN" },
    geo: (() => {
      const pt = mapPoint(p);
      if (!pt) return undefined;
      const [la, lo] = pt.split(",");
      return { "@type": "GeoCoordinates", latitude: Number(la), longitude: Number(lo) };
    })(),
    amenityFeature: p.amenities.map((a) => ({ "@type": "LocationFeatureSpecification", name: a, value: true })),
    priceRange: prices.length ? `from INR ${Math.min(...prices)}` : undefined,
    aggregateRating:
      p.rating_count > 0 ? { "@type": "AggregateRating", ratingValue: Number(p.rating_avg).toFixed(1), reviewCount: p.rating_count } : undefined,
  };
  return (
    <main className="page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
      <div className="prop-head">
        <p className="meta">{t("prop.in", { type: TYPE_LABEL[p.type] ? t(`type.${p.type}`) : p.type, city: p.city })}</p>
        <h1>{p.name} <HeartButton id={p.id} name={p.name} className="in-title" /></h1>
        <p className="rating">
          {p.rating_count > 0 ? (
            <>
              <b className="score">{Number(p.rating_avg).toFixed(1)}</b> {t("prop.reviewsFrom", { reviews: t.n("unit.review", p.rating_count) })}
            </>
          ) : (
            t("prop.new")
          )}
          {p.address ? <span className="meta"> &nbsp;{p.address}</span> : null}
        </p>
      </div>

      <PhotoGallery photos={p.photos} name={p.name} seed={p.id} />

      <div className="prop-body">
        <div>
          {p.description && (
            <section className="prop-section">
              <h2>{t("prop.about")}</h2>
              <p className="prose">{p.description}</p>
            </section>
          )}
          {p.amenities.length > 0 && (
            <section className="prop-section">
              <h2>{t("prop.included")}</h2>
              <ul className="amenity-list">
                {p.amenities.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <section className="prop-section">
        <h2>{t("prop.rooms")}</h2>
        <AvailabilityCalendar propertyId={p.id} checkIn={hasDates ? ci : ""} checkOut={hasDates ? co : ""} guests={guests} children={children} />
        <RoomList
          key={`${hasDates ? ci : ""}|${hasDates ? co : ""}|${guests}|${occ.ages.join(",")}|${occ.rooms}`}
          rooms={p.room_types}
          checkIn={hasDates ? ci : ""}
          checkOut={hasDates ? co : ""}
          guests={guests}
          children={children}
          ages={occ.ages}
          roomsWanted={occ.rooms}
          nights={hasDates ? nightsBetween(ci, co) : 0}
          advancePercent={p.advance_percent || 100}
          tooSoon={Boolean(p.too_soon)}
          earliest={p.earliest_check_in || ""}
        />
      </section>

      <PropertyMap p={p} t={t} />
    </main>
  );
}
