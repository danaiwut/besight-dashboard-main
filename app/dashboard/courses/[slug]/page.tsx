import { COURSES } from "../../../../lib/courses";
import CourseDetailView from "../../../../components/dashboard/CourseDetailView";

export function generateStaticParams() {
  return COURSES.map((course) => ({ slug: course.key }));
}

export default async function CourseDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CourseDetailView slug={slug} />;
}
