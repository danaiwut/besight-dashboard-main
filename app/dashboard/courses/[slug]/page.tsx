import CourseDetailView from "../../../../components/dashboard/CourseDetailView";

/** Courses live in the database (admins manage them in the CRM), so the slug
 *  is resolved at request time instead of pre-rendered. */
export default async function CourseDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CourseDetailView slug={slug} />;
}
