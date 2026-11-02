// Google map and nearby attractions for a property. No Google key is needed: the map is Google's own embed.
export function mapPoint(p) {
  if (p.lat != null && p.lng != null) return `${p.lat},${p.lng}`;
  const u = p.map_url || "";
  const m = u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || u.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || u.match(/[?&](?:q|query)=(-?\d+\.\d+),(-?\d+\.\d+)/);
  return m ? `${m[1]},${m[2]}` : "";
}

export default function PropertyMap({ p, t }) {
  const query = mapPoint(p) || [p.name, p.address, p.city].filter(Boolean).join(", ");
  const link = p.map_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  const places = (p.nearby || "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 10);
  return (
    <>
      <section className="prop-section">
        <h2>{t("map.location")}</h2>
        {p.address && <p className="meta">{p.address}</p>}
        <div className="prop-map">
          <iframe
            title={t("map.title", { name: p.name })}
            src={`https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
        <p>
          <a href={link} target="_blank" rel="noopener noreferrer" className="btn btn-small">
            {t("map.open")}
          </a>
        </p>
      </section>
      {places.length > 0 && (
        <section className="prop-section">
          <h2>{t("map.nearby")}</h2>
          <ul className="amenity-list">
            {places.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
