import type { Metadata } from 'next';
import { CITIES, CITY_SLUGS } from '@/lib/cities';
import CityLandingPage from '@/components/CityLandingPage';
import { notFound } from 'next/navigation';

export async function generateStaticParams() {
  return CITY_SLUGS.map(city => ({ city }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ city: string }> }
): Promise<Metadata> {
  const { city } = await params;
  const data = CITIES.find(c => c.slug === city);
  if (!data) return { title: 'Construction Software | Saguaro CRM' };
  return {
    title: `Construction Software for ${data.name}, ${data.stateAbbr} | Saguaro CRM`,
    description: `The best construction management software for general contractors in ${data.name}, ${data.state}. AI blueprint takeoff, lien waivers, certified payroll, field app. Start free.`,
    keywords: [
      `construction software ${data.name}`,
      `general contractor software ${data.name} ${data.stateAbbr}`,
      `construction CRM ${data.name}`,
      `construction estimating software ${data.name}`,
      `contractor management software ${data.state}`,
    ],
    openGraph: {
      title: `Construction Software for ${data.name}, ${data.stateAbbr} — Saguaro CRM`,
      description: `AI takeoff, lien waivers, certified payroll — built for GCs in ${data.name}. Start free, no credit card.`,
      url: `https://saguarocontrol.net/local/${city}`,
    },
    alternates: { canonical: `https://saguarocontrol.net/local/${city}` },
  };
}

export default async function Page({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  const data = CITIES.find(c => c.slug === city);
  if (!data) notFound();
  return <CityLandingPage city={data} />;
}
