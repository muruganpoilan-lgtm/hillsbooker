import Link from "next/link";
import { getT } from "../lib/lang";

const SOCIAL = [
  { name: "Instagram", href: "https://www.instagram.com/hillbookerbooking/" },
  { name: "Facebook", href: "https://www.facebook.com/profile.php?id=61595981792268" },
  { name: "YouTube", href: "https://www.youtube.com/channel/UCVHdOrRa9Ej6LSA1WKXQx4w" },
  { name: "WhatsApp", href: "https://wa.me/918300841442" },
];

export default async function Footer() {
  const t = await getT();
  return (
    <footer className="site-footer">
      <div className="tiles" aria-hidden="true" />
      <div className="footer-inner">
        <p className="footer-brand"><img src="/logo-mark.png" alt="" className="footer-logo" /> Hill Booker</p>
        <p className="meta">{t("footer.tagline")}</p>
        <nav className="footer-links" aria-label="Popular places">
          {["Munnar", "Ooty", "Valparai", "Kodaikanal", "Alleppey", "Coorg", "Wayanad"].map((c) => (
            <Link key={c} href={`/stays/${c.toLowerCase()}`}>
              {t("footer.staysIn", { city: t(`city.${c}`) })}
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
