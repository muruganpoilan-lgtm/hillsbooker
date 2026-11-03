import Link from "next/link";
import Ridge from "../../components/Ridge";
import { api } from "../../lib/api";
import { getT } from "../../lib/lang";
import { SITE_URL } from "../../lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("blog.title"), description: t("blog.metaDesc"), alternates: { canonical: `${SITE_URL}/blog` } };
}

export default async function BlogPage() {
  const t = await getT();
  const res = await api("/blog");
  const rows = res.ok ? res.data : [];
  return (
    <main className="page">
      <h1 className="result-title">{t("blog.title")}</h1>
      <p className="prose">{t("blog.intro")}</p>
      {!res.ok && (
        <p className="form-error" role="alert">
          {res.error}
        </p>
      )}
      {res.ok && rows.length === 0 && (
        <div className="empty">
          <h2>{t("blog.soon")}</h2>
          <p>{t("blog.soonText")}</p>
        </div>
      )}
      <ul className="results">
        {rows.map((p) => (
          <li key={p.id}>
            <Link className="result" href={`/blog/${p.slug}`}>
              <div className="result-photo">{p.photo ? <img src={p.photo} alt={p.title} loading="lazy" /> : <Ridge seed={p.id} />}</div>
              <div className="result-body">
                {p.city && <p className="meta">{p.city}</p>}
                <h2 className="row-name">{p.title}</h2>
                {p.summary && <p className="meta">{p.summary}</p>}
                <p className="meta">{t("blog.read")} →</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
