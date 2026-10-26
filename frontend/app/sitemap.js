import { api } from "../lib/api";
import { SITE_URL, slugify } from "../lib/seo";

export const dynamic = "force-dynamic";

export default async function sitemap() {
  const now = new Date();
  const res = await api("/seo/properties");
  const props = res.ok ? res.data : [];
  const vres = await api("/vehicles");
  const vehicles = vres.ok ? vres.data : [];

  // Only cities that have at least one place; an empty city page is kept out of search results.
  const cities = new Map();
  for (const p of props) cities.set(slugify(p.city), p.city);

  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    ...[...cities.keys()].map((slug) => ({ url: `${SITE_URL}/stays/${slug}`, lastModified: now, changeFrequency: "daily", priority: 0.8 })),
    { url: `${SITE_URL}/vehicles`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    ...vehicles.map((v) => ({ url: `${SITE_URL}/vehicles/${v.id}`, lastModified: now, changeFrequency: "weekly", priority: 0.6 })),
    ...props.map((p) => ({ url: `${SITE_URL}/properties/${p.id}`, lastModified: new Date(p.created_at), changeFrequency: "weekly", priority: 0.7 })),
  ];
}
