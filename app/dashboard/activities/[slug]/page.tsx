import { COMPETITIONS } from "../../../../lib/activities";
import ActivityDetailView from "../../../../components/dashboard/ActivityDetailView";

export function generateStaticParams() {
  return COMPETITIONS.map((c) => ({ slug: c.key }));
}

export default async function ActivityDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ActivityDetailView slug={slug} />;
}
