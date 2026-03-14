import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Saguaro vs Procore — Feature & Price Comparison 2025',
  description: 'See how Saguaro compares to Procore: AI takeoff, flat pricing, lien waivers in 50 states, certified payroll, 1-day setup vs 6 months. Starting at $199/mo vs $1,850+/mo.',
  keywords: ['saguaro vs procore', 'procore comparison', 'procore alternative 2025', 'procore competitor', 'construction project management software comparison'],
  openGraph: {
    title: 'Saguaro vs Procore: Full Feature & Price Comparison',
    description: 'AI takeoff Procore doesn\'t have. Flat pricing vs per-seat. 1-day setup vs 6 months. See the full comparison.',
    url: 'https://saguarocontrol.net/compare/procore',
  },
  alternates: { canonical: 'https://saguarocontrol.net/compare/procore' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            "name": "Saguaro vs Procore Comparison",
            "description": "Detailed comparison of Saguaro CRM vs Procore construction management software",
            "url": "https://saguarocontrol.net/compare/procore",
            "mainEntity": {
              "@type": "ItemList",
              "name": "Feature Comparison: Saguaro vs Procore",
              "numberOfItems": 20
            }
          })
        }}
      />
      {children}
    </>
  );
}
