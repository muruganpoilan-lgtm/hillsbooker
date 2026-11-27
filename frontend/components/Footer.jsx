import Link from "next/link";
import { getT } from "../lib/lang";
import { API_BASE } from "../lib/api";
import { slugify } from "../lib/seo";

const SOCIAL = [
  { name: "Instagram", href: "https://www.instagram.com/hillbookerbooking/" },
  { name: "Facebook", href: "https://www.facebook.com/profile.php?id=61595981792268" },
  { name: "YouTube", href: "https://www.youtube.com/channel/UCVHdOrRa9Ej6LSA1WKXQx4w" },
  { name: "WhatsApp", href: "https://wa.me/918300841442" },
];

// Fallback when the API can't be reached: cities that currently have stays.
const FALLBACK_CITIES = ["Munnar", "Ooty", "Valparai", "Wayanad", "Madikeri", "Kotagiri", "Nelliyampathy"];

// The footer is on every page, so it must only link to city pages that have stays.
// Empty city pages are noindex, and linking to them from every page filled Search Console with
// "Excluded by noindex". Same source as the sitemap; cached for an hour so it is one request, not one per page.
async function liveCities() {
  try {
    const res = await fetch(`${API_BASE}/seo/properties`, { next: { revalidate: 3600 } });
    if (!res.ok) return FALLBACK_CITIES;
    const counts = new Map();
    for (const p of await res.json()) counts.set(p.city, (counts.get(p.city) || 0) + 1);
    const list = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 8);
    return list.length ? list : FALLBACK_CITIES;
  } catch {
    return FALLBACK_CITIES;
  }
}

export default async function Footer() {
  const t = await getT();
  const cities = await liveCities();
  const or = (key, fallback) => (t(key) === key ? fallback : t(key)); // new cities may not have a translation yet
  return (
    <footer className="site-footer">
      <div className="tiles" aria-hidden="true" />
      <div className="footer-inner">
        <p className="footer-brand"><img src="/logo-mark.png" alt="" className="footer-logo" width="80" height="30" loading="lazy" /> Hill Booker</p>
        <p className="meta">{t("footer.tagline")}</p>
        <nav className="footer-links" aria-label="Popular places">
          {cities.map((c) => (
            <Link key={c} href={`/stays/${slugify(c)}`}>
              {t("footer.staysIn", { city: or(`city.${c}`, c) })}
            </Link>
          ))}
        </nav>
        <nav className="footer-links" aria-label="Footer">
          <Link href="/">{t("footer.search")}</Link>
          <Link href="/register">{t("footer.list")}</Link>
          <Link href="/bookings">{t("nav.myBookings")}</Link>
        </nav>
        <nav className="footer-links" aria-label="About and policies">
          <Link href="/about">{t("footer.about")}</Link>
          <Link href="/contact">{t("footer.contact")}</Link>
          <Link href="/support">{t("footer.support")}</Link>
          <Link href="/terms">{t("footer.terms")}</Link>
          <Link href="/privacy">{t("footer.privacy")}</Link>
          <Link href="/refund-policy">{t("footer.refund")}</Link>
        </nav>
        <nav className="social-links" aria-label="Follow Hill Booker">
          <span>{t("footer.follow")}</span>
          {SOCIAL.map((x) => (
            <a key={x.name} href={x.href} target="_blank" rel="noopener noreferrer" aria-label={`Hill Booker on ${x.name}`}>
              {x.name}
            </a>
          ))}
        </nav>
        <address className="footer-contact">
          <p>
            <b>{t("footer.office")}</b> Hillbooker, No: 105A, Villagio, Green Groove, Jeyam Nagar, Kanchivakkam, Sriperumbudur, Chennai - 601301
          </p>
          <p>
            <b>{t("footer.email")}</b> <a href="mailto:info@hillbooker.com">info@hillbooker.com</a>
          </p>
          <p>
            <b>{t("footer.care")}</b> <a href="tel:+918300841442">+91 83008 41442</a> · <a href="tel:+919345777130">+91 93457 77130</a> ·{" "}
            <a href="https://wa.me/918300841442" target="_blank" rel="noopener noreferrer">
              {t("footer.whatsappUs")}
            </a>
          </p>
        </address>
        <p className="meta footer-copy">
          {t("footer.copy", { year: new Date().getFullYear() })} {t("footer.seeCopy")}
          <Link href="/terms#copyright">{t("footer.copyNotice")}</Link>
          {t("footer.seeCopyEnd")}
        </p>
      </div>
    </footer>
  );
}
