import AdminShell from "../../components/dashboard/AdminShell";

// Signed-in page: kept out of Google so it does not show up as "alternate" or "duplicate" in Search Console.
export const metadata = { robots: { index: false, follow: true } };

export default function OperatorLayout({ children }) {
  return <AdminShell>{children}</AdminShell>;
}
