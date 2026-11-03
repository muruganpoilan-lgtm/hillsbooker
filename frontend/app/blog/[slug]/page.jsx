import Link from "next/link";
import { notFound } from "next/navigation";
import BlogBody from "../../../components/BlogBody";
import { api } from "../../../lib/api";
import { getT } from "../../../lib/lang";
import { SITE_URL, jsonLd, slugify } from "../../../lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const res = await api(`/blog/${slug}`);
  if (!res.ok) return { title: "Travel guide" };
  const p = res.data;
  const url = `${SITE_URL}/blog/${p.slug}`;
  const description = (p.summary || p.body || "").replace(/\s+/g, " ").slice(0, 160);
  return { title: p.title, description, alternates: { canonical: url }, openGraph: { title: p.title, description, url, type: "article", images: p.photos && p.photos[0] ? [p.photos[0].url] : undefined } };
}

export default async function BlogPost({ params }) {
  const { slug } = await params;
  const t = await getT();
  const res = await api(`/blog/${slug}`);
  if (!res.ok && res.status === 404) notFound();
  if (!res.ok) {
    return (
      <main className="page">
        <div className="empty" role="alert">
          <h2>{t("blog.loadFail")}</h2>
          <p>{res.error}</p>
        </div>
      </main>
    );
  }
  const p = res.data;
  const photos = (p.photos || []).map((x) => x.url);
  const ld = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: p.title,
    description: p.summary || undefined,
    image: photos.length ? photos : undefined,
    datePublished: p.published_at || p.created_at,
    dateModified: p.updated_at,
    author: { "@type": "Organization", name: "Hill Booker" },
    publisher: { "@type": "Organization", name: "Hill Booker" },
    mainEntityOfPage: `${SITE_URL}/blog/${p.slug}`,
  };
  return (
    <main className="page" style={{ maxWidth: "46rem" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
      <p className="meta">
        <Link href="/blog">← {t("blog.back")}</Link>
      </p>
      {p.city && <p className="meta">{p.city}</p>}
      <h1 className="result-title">{p.title}</h1>
      {p.summary && <p className="prose">{p.summary}</p>}
      {photos[0] && <img src={photos[0]} alt={p.title} style={{ width: "100%", borderRadius: "12px", margin: "0.5rem 0 1rem" }} />}
      <BlogBody text={p.body} />
      {photos.slice(1).map((u, i) => (
        <img key={i} src={u} alt={p.title} loading="lazy" style={{ width: "100%", borderRadius: "12px", margin: "0.6rem 0" }} />
      ))}
      <div className="card" style={{ padding: "1rem", margin: "1.5rem 0", display: "grid", gap: "0.6rem" }}>
        <h2 className="mini-title">{t("blog.ctaTitle")}</h2>
        <div className="actions">
          {p.city && (
            <Link className="btn btn-primary" href={`/stays/${slugify(p.city)}`}>
              {t("blog.staysIn", { city: p.city })}
            </Link>
          )}
          <Link className="btn" href="/packages">
            {t("nav.packages")}
          </Link>
        </div>
      </div>
    </main>
  );
}
