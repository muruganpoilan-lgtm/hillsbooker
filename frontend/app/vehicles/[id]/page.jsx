import { notFound } from "next/navigation";
import PhotoGallery from "../../../components/PhotoGallery";
import VehicleBooking from "../../../components/VehicleBooking";
import { api, money } from "../../../lib/api";
import { SITE_URL, jsonLd } from "../../../lib/seo";
import { KIND_LABEL, vehicleLine } from "../../../lib/vehicles";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const res = await api(`/vehicles/${id}`);
  if (!res.ok) return { title: "Vehicle" };
  const v = res.data;
  const title = `${v.name}: ${KIND_LABEL[v.kind] || "vehicle"} for hire in ${v.city}`;
  const description = `Hire the ${v.name} (${v.seats} seats${v.ac ? ", AC" : ""}) in ${v.city} from ${money(v.price_per_day)} a day, with a driver. Book and pay online on Hill Booker.`;
  const url = `${SITE_URL}/vehicles/${id}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: "website", images: v.photos && v.photos[0] ? [v.photos[0].url] : undefined } };
}

export default async function VehiclePage({ params }) {
  const { id } = await params;
  const res = await api(`/vehicles/${id}`);
  if (!res.ok && res.status === 404) notFound();
  if (!res.ok) {
    return (
      <main className="page">
        <div className="empty" role="alert">
          <h2>We couldn't load this vehicle</h2>
          <p>{res.error}</p>
        </div>
      </main>
    );
  }
  const v = res.data;
  const photos = (v.photos || []).map((p) => p.url);
  const ld = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: v.name,
    description: v.description || vehicleLine(v),
    image: photos.length ? photos : undefined,
    offers: { "@type": "Offer", priceCurrency: "INR", price: Number(v.price_per_day), availability: "https://schema.org/InStock", url: `${SITE_URL}/vehicles/${v.id}` },
  };
  return (
    <main className="page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
      <div className="prop-head">
        <p className="meta">{vehicleLine(v)}</p>
        <h1>{v.name}</h1>
        <p className="meta">Run by {v.operator}</p>
      </div>
      <PhotoGallery photos={photos} name={v.name} seed={v.id} />
      <div className="prop-body">
        <div>
          {v.description && (
            <section className="prop-section">
              <h2>About this vehicle</h2>
              <p className="prose">{v.description}</p>
            </section>
          )}
          <p className="meta">
            {v.km_per_day ? `${v.km_per_day} km included per day.` : "Unlimited kilometres."}
            {v.km_per_day && v.extra_km_rate != null ? ` Extra kilometres ${money(v.extra_km_rate)} each.` : ""} Driver included. Fuel and tolls as agreed with the operator.
          </p>
        </div>
      </div>
      <section className="prop-section">
        <h2>Book this vehicle</h2>
        <VehicleBooking vehicle={v} />
      </section>
    </main>
  );
}
