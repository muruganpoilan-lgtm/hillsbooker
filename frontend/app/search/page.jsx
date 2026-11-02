import Link from "next/link";
import HeartButton from "../../components/HeartButton";
import Ridge from "../../components/Ridge";
import NearMeButton from "../../components/NearMeButton";
import SearchForm from "../../components/SearchForm";
import { addDays, api, isISODate, money, nightsBetween, todayISO } from "../../lib/api";
import { getT } from "../../lib/lang";

export const metadata = { title: "Search stays", robots: { index: false, follow: true } };

const TYPES = ["hotel", "homestay", "apartment", "resort"];

export default async function SearchPage({ searchParams }) {
  const t = await getT();
  const sp = await searchParams;
  const get = (k) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) || "";

  const checkIn = isISODate(get("check_in")) ? get("check_in") : addDays(todayISO(), 2);
  const checkOutRaw = isISODate(get("check_out")) ? get("check_out") : "";
  const checkOut = checkOutRaw && checkOutRaw > checkIn ? checkOutRaw : addDays(checkIn, 1);
  const guests = Math.min(Math.max(Number(get("guests")) || 2, 1), 40);
  const children = Math.min(Math.max(Number(get("children")) || 0, 0), guests - 1);
  const city = get("city");
  const nearLat = Number(get("near_lat"));
  const nearLng = Number(get("near_lng"));
  const hasNear = get("near_lat") !== "" && get("near_lng") !== "" && Math.abs(nearLat) <= 90 && Math.abs(nearLng) <= 180;
  const sortRaw = get("sort");
  const sort = sortRaw === "rating" ? "rating" : sortRaw === "near" && hasNear ? "near" : "price";
  const minPrice = Number(get("min_price")) > 0 ? get("min_price") : "";
  const minRating = ["3", "4", "4.5"].includes(get("min_rating")) ? get("min_rating") : "";
  const pickedList = Array.isArray(sp.amenity) ? sp.amenity : sp.amenity ? [sp.amenity] : [];
  const type = TYPES.includes(get("type")) ? get("type") : "";
  const maxPrice = Number(get("max_price")) > 0 ? get("max_price") : "";
  const nights = nightsBetween(checkIn, checkOut);

  const q = new URLSearchParams({ check_in: checkIn, check_out: checkOut, guests: String(guests), sort });
  if (city) q.set("city", city);
  if (type) q.set("property_type", type);
  if (maxPrice) q.set("max_price", maxPrice);
  if (minPrice) q.set("min_price", minPrice);
  if (minRating) q.set("min_rating", minRating);
  const amenRes = await api("/amenities");
  const allAmenities = amenRes.ok ? amenRes.data.map((a) => a.name) : [];
  const picked = pickedList.filter((a) => allAmenities.includes(a)).slice(0, 12);
  picked.forEach((a) => q.append("amenity", a));
  if (hasNear) {
    q.set("near_lat", String(nearLat));
    q.set("near_lng", String(nearLng));
  }
  const res = await api(`/search?${q.toString()}`);
  const activeFilters = [type, maxPrice, minPrice, minRating, picked.length ? "x" : "", sort === "near" ? "x" : ""].filter(Boolean).length;
  const clearParams = new URLSearchParams({ check_in: checkIn, check_out: checkOut, guests: String(guests) });
  if (city) clearParams.set("city", city);
  if (children > 0) clearParams.set("children", String(children));

  const detailParams = new URLSearchParams({ check_in: checkIn, check_out: checkOut, guests: String(guests) });
  if (children > 0) detailParams.set("children", String(children));
  const detailQuery = detailParams.toString();

  return (
    <main className="page">
      <SearchForm compact initial={{ city, check_in: checkIn, check_out: checkOut, guests, children }} />

      <div className="results-layout">
        <form className="filters" method="get" action="/search">
          <h2 className="mini-title">{t("filters.title")}</h2>
          <input type="hidden" name="city" value={city} />
          <input type="hidden" name="check_in" value={checkIn} />
          <input type="hidden" name="check_out" value={checkOut} />
          <input type="hidden" name="guests" value={guests} />
          <input type="hidden" name="children" value={children} />
          <fieldset className="radios">
            <legend>{t("filters.type")}</legend>
            {[["", t("type.any")], ...TYPES.map((k) => [k, t(`type.${k}`)])].map(([v, label]) => (
              <label key={v || "any"} className="check">
                <input type="radio" name="type" value={v} defaultChecked={type === v} />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          <div className="field-pair">
            <label className="field">
              <span>{t("filters.minPrice")}</span>
              <input type="number" name="min_price" min="0" step="100" defaultValue={minPrice} placeholder="0" />
            </label>
            <label className="field">
              <span>{t("filters.maxPrice")}</span>
              <input type="number" name="max_price" min="0" step="100" defaultValue={maxPrice} placeholder={t("filters.noLimit")} />
            </label>
          </div>
          <label className="field">
            <span>{t("filters.rating")}</span>
            <select name="min_rating" defaultValue={minRating}>
              <option value="">{t("type.any")}</option>
              <option value="3">{t("filters.r3")}</option>
              <option value="4">{t("filters.r4")}</option>
              <option value="4.5">{t("filters.r45")}</option>
            </select>
          </label>
          {allAmenities.length > 0 && (
            <fieldset className="radios">
              <legend>{t("filters.mustHave")}</legend>
              {allAmenities.map((a) => (
                <label key={a} className="check">
                  <input type="checkbox" name="amenity" value={a} defaultChecked={picked.includes(a)} />
                  <span>{a}</span>
                </label>
              ))}
            </fieldset>
          )}
          <label className="field">
            <span>{t("filters.sort")}</span>
            <select name="sort" defaultValue={sort}>
              <option value="price">{t("filters.sortPrice")}</option>
              <option value="rating">{t("filters.sortRating")}</option>
              <option value="near" disabled={!hasNear}>{t("filters.sortNear")}</option>
            </select>
          </label>
          <NearMeButton lat={hasNear ? String(nearLat) : ""} lng={hasNear ? String(nearLng) : ""} />
          <button type="submit" className="btn btn-primary btn-small">
            {t("filters.apply")}
          </button>
          {activeFilters > 0 && (
            <Link href={`/search?${clearParams.toString()}`} className="meta">
              {t.n("filters.clear", activeFilters)}
            </Link>
          )}
        </form>

        <div>
          {!res.ok ? (
            <div className="empty" role="alert">
              <h2>{t("search.cantLoad")}</h2>
              <p>{res.error}</p>
            </div>
          ) : res.data.results.length === 0 ? (
            <div className="empty">
              <h2>{t("search.noneFree", { nights: t.n("unit.night", nights) })}</h2>
              <p>{t("search.noneHelp")}</p>
            </div>
          ) : (
            <>
              <h1 className="result-title">
                {city ? t("search.staysIn", { city }) : t("search.staysAcross")}
              </h1>
              <p className="result-summary">
                {t("search.summary", { places: t.n("unit.place", res.data.results.length), nights: t.n("unit.nightFor", nights) })}
              </p>
              <ul className="results">
                {res.data.results.map((p) => {
                  const perNight = Number(p.price_per_night);
                  return (
                    <li key={p.id} className="has-heart">
                      <Link className="result" href={`/properties/${p.id}?${detailQuery}`}>
                        <div className="result-photo">
                          {p.photo ? <img src={p.photo} alt="" loading="lazy" /> : <Ridge seed={p.id} />}
                        </div>
                        <div className="result-body">
                          <p className="meta">{t("type.in", { type: TYPES.includes(p.type) ? t(`type.${p.type}`) : p.type, city: p.city })}</p>
                          <h3 className="row-name">{p.name}</h3>
                          <p className="rating">
                            {p.rating_count > 0 ? (
                              <>
                                {t("search.ratingFrom", { score: Number(p.rating_avg).toFixed(1), reviews: t.n("unit.review", p.rating_count) })}
                              </>
                            ) : (
                              t("search.new")
                            )}
                          </p>
                          {p.distance_km != null && (
                            <p className="meta">{Number(p.distance_km) < 1 ? t("search.kmLess") : t("search.km", { n: Math.round(Number(p.distance_km)) })}</p>
                          )}
                        </div>
                        <div className="price-box">
                          <span className="price">{money(perNight)}</span>
                          <span className="price-sub">{t("search.aNight")}</span>
                          <span className="price-sub">{t("search.forNights", { amount: money(perNight * nights), nights: t.n("unit.nightFor", nights) })}</span>
                        </div>
                      </Link>
                      <HeartButton id={p.id} name={p.name} className="on-card" />
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
