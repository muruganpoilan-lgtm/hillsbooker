import PlanTrip from "../../components/PlanTrip";
import { getT } from "../../lib/lang";
import { SITE_URL } from "../../lib/seo";

export async function generateMetadata() {
  const t = await getT();
  return {
    title: t("trip.metaTitle"),
    description: t("trip.metaDesc"),
    alternates: { canonical: `${SITE_URL}/plan-trip` },
  };
}

export default async function PlanTripPage() {
  const t = await getT();
  return (
    <main className="page trip-page">
      <h1 className="section-title">{t("trip.h1")}</h1>
      <p className="hb-lead">{t("trip.lead")}</p>
      <PlanTrip />
    </main>
  );
}
