import ActivityDetailView from "../../../../components/dashboard/ActivityDetailView";

/** Activities live in the database, so the slug is resolved at request time. */
export default async function ActivityDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ActivityDetailView slug={slug} />;
}
