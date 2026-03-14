import type { Metadata } from 'next';
import { COMPETITORS, COMPETITOR_SLUGS } from '@/lib/competitors';
import CompetitorComparePage from '@/components/CompetitorComparePage';
import { notFound } from 'next/navigation';

export async function generateStaticParams() {
  return COMPETITOR_SLUGS
    .filter(slug => slug !== 'procore') // procore has its own static page
    .map(slug => ({ competitor: slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ competitor: string }> }
): Promise<Metadata> {
  const { competitor } = await params;
  const data = COMPETITORS[competitor];
  if (!data) return { title: 'Comparison | Saguaro CRM' };
  return {
    title: data.metaTitle,
    description: data.metaDescription,
    keywords: data.searchKeywords,
    openGraph: {
      title: data.metaTitle,
      description: data.metaDescription,
      url: `https://saguarocontrol.net/compare/${competitor}`,
    },
    alternates: { canonical: `https://saguarocontrol.net/compare/${competitor}` },
  };
}

export default async function Page({ params }: { params: Promise<{ competitor: string }> }) {
  const { competitor } = await params;
  const data = COMPETITORS[competitor];
  if (!data) notFound();
  return <CompetitorComparePage competitor={data} />;
}
