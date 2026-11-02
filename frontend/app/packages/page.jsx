import Link from "next/link";
import Ridge from "../../components/Ridge";
import { api, money } from "../../lib/api";
import { getT } from "../../lib/lang";
import { SITE_URL } from "../../lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("pkg.title"), description: t("pkg.metaDesc"), alternates: { canonical: `${SITE_URL}/packages` } };
}

export default async function PackagesPage() {
  const t = await getT();
  const res = await api("/packages");
  const rows = res.ok ? res.data : [];
  return (
    <main className="page">
      <h1 className="result-title">{t("pkg.title")}</h1>
      <p className="prose">{t("pkg.intro")}</p>
      {!res.ok && (
        <p className="form-error" role="alert">
          {res.error}
        </p>
      )}
      {res.ok && rows.length === 0 && (
        <div className="empty">
          <h2>{t("pkg.soon")}</h2>
          <p>{t("pkg.soonText")}</p>
          <p>
            <Link className="btn btn-primary" href="/enquiry?kind=group">
              {t("pkg.enquire")}
            </Link>
          </p>
        </div>
      )}
      <ul className="results">
        {rows.map((p) => (
          <li key={p.id}>
            <Link className="result" href={`/packages/${p.slug}`}>
              <div className="result-photo">{p.photo ? <img src={p.photo} alt={p.title} loading="lazy" /> : <Ridge seed={p.id} />}</div>
              <div className="result-body">
                <p className="meta">
                  {p.destination} · {t("pkg.nd", { nights: p.nights, days: p.days })}
                </p>
                <h2 className="row-name">{p.title}</h2>
                {p.summary && <p className="meta">{p.summary}</p>}
                <p className="meta">{t("pkg.minPeople", { n: p.min_people })}</p>
              </div>
              <div className="price-box">
                <span className="price">{money(p.price_per_person)}</span>
                <span className="price-sub">{t("pkg.perPerson")}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
