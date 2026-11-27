// Signed-in or one-off page: kept out of Google so it does not show up as "alternate" or "duplicate" in Search Console.
export const metadata = { robots: { index: false, follow: true } };

export default function Layout({ children }) {
  return children;
}
