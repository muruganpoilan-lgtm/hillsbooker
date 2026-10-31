import Link from "next/link";

const SOCIAL = [
  { name: "Instagram", href: "https://www.instagram.com/hillbookerbooking/" },
  { name: "Facebook", href: "https://www.facebook.com/profile.php?id=61595981792268" },
  { name: "YouTube", href: "https://www.youtube.com/channel/UCVHdOrRa9Ej6LSA1WKXQx4w" },
  { name: "WhatsApp", href: "https://wa.me/918300841442" },
];

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="tiles" aria-hidden="true" />
      <div className="footer-inner">
        <p className="footer-brand"><img src="/logo-mark.png" alt="" className="footer-logo" /> Hill Booker</p>
        <p className="meta">Hotels and homestays across India. Rooms are shown only when they are free on every night of your stay.</p>
        <nav className="footer-links" aria-label="Popular places">
          {["Munnar", "Ooty", "Valparai", "Kodaikanal", "Alleppey", "Coorg", "Wayanad"].map((c) => (
            <Link key={c} href={`/stays/${c.toLowerCase()}`}>
              Stays in {c}
            </Link>
          ))}
        </nav>
        <nav className="footer-links" aria-label="Footer">
          <Link href="/">Search rooms</Link>
          <Link href="/register">List your property</Link>
          <Link href="/bookings">My bookings</Link>
        </nav>
        <nav className="footer-links" aria-label="About and policies">
          <Link href="/about">About us</Link>
          <Link href="/contact">Contact us</Link>
          <Link href="/terms">Terms and Conditions</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/refund-policy">Refund and Cancellation Policy</Link>
        </nav>
        <nav className="social-links" aria-label="Follow Hill Booker">
          <span>Follow us</span>
          {SOCIAL.map((x) => (
            <a key={x.name} href={x.href} target="_blank" rel="noopener noreferrer" aria-label={`Hill Booker on ${x.name}`}>
              {x.name}
            </a>
          ))}
        </nav>
        <address className="footer-contact">
          <p>
            <b>Office:</b> Hillbooker, No: 105A, Villagio, Green Groove, Jeyam Nagar, Kanchivakkam, Sriperumbudur, Chennai - 601301
          </p>
          <p>
            <b>Email:</b> <a href="mailto:hillbookerbookings@gmail.com">hillbookerbookings@gmail.com</a>
          </p>
          <p>
            <b>Customer care:</b> <a href="tel:+918300841442">+91 83008 41442</a> · <a href="tel:+919345777130">+91 93457 77130</a> ·{" "}
            <a href="https://wa.me/918300841442" target="_blank" rel="noopener noreferrer">
              WhatsApp us
            </a>
          </p>
        </address>
        <p className="meta footer-copy">
          © {new Date().getFullYear()} Hill Booker. All rights reserved. The Hill Booker name, logo, website, app and the text, design and photos we publish are protected by copyright.
          Photos of a property belong to the host who uploaded them. See our <Link href="/terms#copyright">Copyright notice</Link>.
        </p>
      </div>
    </footer>
  );
}
