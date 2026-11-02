import Link from "next/link";
import Ridge from "../../components/Ridge";
import { api, money } from "../../lib/api";
import { SITE_URL } from "../../lib/seo";
import { KINDS, kindName, vehicleLine } from "../../lib/vehicles";
import { getT } from "../../lib/lang";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }) {
  const sp = await searchParams;
  const t = await getT();
  const city = (Array.isArray(sp.city) ? sp.city[0] : sp.city) || "";
  const title = city ? t("veh.titleIn", { city }) : t("veh.title");
  const description = t("veh.metaDesc", { inCity: city ? t("veh.metaIn", { city }) : "" });
  return { title, description, alternates: { canonical: `${SITE_URL}/vehicles` }, robots: city ? { index: false, follow: true } : undefined };
}

export default async function VehiclesPage({ searchParams }) {
  const sp = await searchParams;
  const t = await getT();
  const get = (k) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) || "";
  const city = get("city").trim();
  const kind = KINDS.some(([k]) => k === get("kind")) ? get("kind") : "";
  const qs = new URLSearchParams();
  if (city) qs.set("city", city);
  if (kind) qs.set("kind", kind);
  const res = await api(`/vehicles${qs.toString() ? `?${qs}` : ""}`);
  const rows = res.ok ? res.data : [];

  return (
    <main className="page">
      <h1 className="result-title">{city ? t("veh.titleIn", { city }) : t("veh.title")}</h1>
      <p className="prose">{t("veh.intro")}</p>
      <form className="dates-bar" method="get" action="/vehicles">
        <label className="field">
          <span>{t("veh.city")}</span>
          <input type="text" name="city" defaultValue={city} placeholder={t("veh.cityHolder")} />
        </label>
        <label className="field">
          <span>{t("veh.type")}</span>
          <select name="kind" defaultValue={kind}>
            <option value="">{t("type.any")}</option>
            {KINDS.map(([k]) => (
              <option key={k} value={k}>
                {kindName(k, t)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-small">
          {t("veh.search")}
        </button>
      </form>

      {!res.ok && (
        <p className="form-error" role="alert">
          {res.error}
        </p>
      )}
      {res.ok && rows.length === 0 && !city && !kind && (
        <div className="empty">
          <h2>{t("veh.arrange")}</h2>
          <p>
            {t("veh.arrangeText")}
          </p>
          <p>
            <a
              className="btn btn-primary"
              href={`https://wa.me/918300841442?text=${encodeURIComponent(t("veh.waText"))}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("veh.wa")}
            </a>{" "}
            <Link className="btn" href="/enquiry?kind=group">
              {t("veh.enquiry")}
            </Link>
          </p>
        </div>
      )}
      {res.ok && rows.length === 0 && (city || kind) && (
        <div className="empty">
          <h2>{t("veh.none")}</h2>
          <p>{t("veh.noneHint")}</p>
        </div>
      )}
      <ul className="results">
        {rows.map((v) => (
          <li key={v.id}>
            <Link className="result" href={`/vehicles/${v.id}`}>
              <div className="result-photo">{v.photo ? <img src={v.photo} alt={`${v.name}, ${v.city}`} loading="lazy" /> : <Ridge seed={v.id} />}</div>
              <div className="result-body">
                <p className="meta">{vehicleLine(v, t)}</p>
                <h2 className="row-name">{v.name}</h2>
                {v.trip_from != null && <p className="rating">{t("veh.tripsFrom", { amt: money(v.trip_from) })}</p>}
              </div>
              <div className="price-box">
                <span className="price">{money(v.price_per_day)}</span>
                <span className="price-sub">{t("veh.perDay")}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
