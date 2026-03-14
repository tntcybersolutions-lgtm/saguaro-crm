import type { Metadata } from 'next';
import { INDUSTRIES, INDUSTRY_SLUGS } from '@/lib/industries';
import IndustryLandingPage from '@/components/IndustryLandingPage';
import { notFound } from 'next/navigation';

export async function generateStaticParams() {
  return INDUSTRY_SLUGS.map(vertical => ({ vertical }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ vertical: string }> }
): Promise<Metadata> {
  const { vertical } = await params;
  const data = INDUSTRIES.find(i => i.slug === vertical);
  if (!data) return { title: 'Saguaro CRM' };
  return {
    title: data.metaTitle,
    description: data.metaDescription,
    keywords: data.searchKeywords,
    openGraph: {
      title: data.metaTitle,
      description: data.metaDescription,
      url: `https://saguarocontrol.net/industry/${vertical}`,
    },
    alternates: { canonical: `https://saguarocontrol.net/industry/${vertical}` },
  };
}

export default async function Page({ params }: { params: Promise<{ vertical: string }> }) {
  const { vertical } = await params;
  const data = INDUSTRIES.find(i => i.slug === vertical);
  if (!data) notFound();
  return <IndustryLandingPage industry={data} />;
}
