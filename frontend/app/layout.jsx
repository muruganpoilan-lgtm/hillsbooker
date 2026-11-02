import "./globals.css";
import { Bricolage_Grotesque, Albert_Sans } from "next/font/google";
import { AuthProvider } from "../components/AuthProvider";
import { LangProvider } from "../components/LangProvider";
import { getLang } from "../lib/lang";
import Header from "../components/Header";
import Footer from "../components/Footer";
import ChatBot from "../components/ChatBot";
import ReferralClaim from "../components/ReferralClaim";
import WelcomeToast from "../components/WelcomeToast";
import { SITE_NAME, SITE_URL, jsonLd } from "../lib/seo";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const body = Albert_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" });

const DESCRIPTION =
  "Book hotels and homestays in Munnar, Ooty, Kodaikanal, Valparai, Alleppey and more. See only the rooms that are free on every night of your stay.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Hill Booker: hotels and homestays in the hills and by the sea", template: "%s | Hill Booker" },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "Hill Booker: hotels and homestays in the hills and by the sea",
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "en_IN",
    images: [{ url: "/logo.png", alt: "Hill Booker" }],
  },
  twitter: { card: "summary", title: "Hill Booker", description: DESCRIPTION, images: ["/logo.png"] },
};

const SITE_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
      sameAs: [
        "https://www.instagram.com/hillbookerbooking/",
        "https://www.facebook.com/profile.php?id=61595981792268",
        "https://www.youtube.com/channel/UCVHdOrRa9Ej6LSA1WKXQx4w",
      ],
    },
    { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
  ],
};

export const viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }) {
  const lang = await getLang();
  return (
    <html lang={lang}>
      <body className={`${display.variable} ${body.variable}`}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(SITE_LD) }} />
        <LangProvider initial={lang}>
        <AuthProvider>
          <Header />
          {children}
          <Footer />
          <ChatBot />
          <ReferralClaim />
          <WelcomeToast />
        </AuthProvider>
        </LangProvider>
      </body>
    </html>
  );
}
