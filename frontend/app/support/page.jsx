import SupportForm from "../../components/SupportForm";
import { getT } from "../../lib/lang";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("sup.title"), description: t("sup.metaDesc"), alternates: { canonical: "/support" } };
}

export default function SupportPage() {
  return (
    <main className="page">
      <SupportForm />
    </main>
  );
}
