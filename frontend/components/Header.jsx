"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { useLang } from "./LangProvider";
import { LANGS } from "../lib/i18n";

export default function Header() {
  const { ready, token, role, logout } = useAuth();
  const router = useRouter();
  const { t, lang, setLang } = useLang();

  return (
    <header className="site-header">
      <Link href="/" className="brand">
        <img src="/logo-mark.png" alt="" className="brand-logo" />
        Hill Booker
      </Link>
      <nav className="nav" aria-label="Main">
        <Link href="/vehicles">{t("nav.cars")}</Link>
        <Link href="/packages">{t("nav.packages")}</Link>
        <Link href="/blog">{t("nav.blog")}</Link>
        {ready && token ? (
          <>
            {(role === "owner" || role === "operator" || role === "admin") && <Link href="/dashboard">{t("nav.myProperties")}</Link>}
            {(role === "owner" || role === "operator" || role === "admin") && <Link href="/operator">{t("nav.myVehicles")}</Link>}
            {(role === "owner" || role === "operator" || role === "admin") && <Link href="/dashboard/payments">{t("nav.payments")}</Link>}
            {(role === "owner" || role === "operator" || role === "admin") && <Link href="/dashboard/reports">{t("nav.reports")}</Link>}
            {role === "admin" && <Link href="/dashboard/overview">{t("nav.overview")}</Link>}
            {role === "admin" && <Link href="/dashboard/enquiries">{t("nav.enquiries")}</Link>}
            {role === "admin" && <Link href="/dashboard/coupons">{t("nav.coupons")}</Link>}
            {role === "admin" && <Link href="/dashboard/packages">{t("nav.packagesAdmin")}</Link>}
            {role === "admin" && <Link href="/dashboard/blog">{t("nav.blogAdmin")}</Link>}
            {role === "admin" && <Link href="/dashboard/support">{t("nav.supportAdmin")}</Link>}
            {role === "guest" && <Link href="/dashboard">{t("nav.becomeHost")}</Link>}
            <Link href="/saved">{t("nav.saved")}</Link>
            <Link href="/invite">{t("nav.invite")}</Link>
            <Link href="/bookings">{t("nav.myBookings")}</Link>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                logout();
                router.push("/");
              }}
            >
              {t("nav.logout")}
            </button>
          </>
        ) : ready ? (
          <>
            <Link href="/login">{t("nav.login")}</Link>
            <Link href="/register" className="btn btn-small">
              {t("nav.signup")}
            </Link>
          </>
        ) : null}
        <span className="lang-switch" role="group" aria-label={t("lang.label")}>
          {LANGS.map(([code, label]) => (
            <button key={code} type="button" className={lang === code ? "on" : ""} aria-pressed={lang === code} lang={code} onClick={() => setLang(code)}>
              {label}
            </button>
          ))}
        </span>
      </nav>
    </header>
  );
}
