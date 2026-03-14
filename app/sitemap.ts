import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://saguarocontrol.net';
  const now = new Date();

  return [
    { url: base, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/compare/procore`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/switch-from-procore`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/roi-calculator`, lastModified: now, changeFrequency: 'monthly', priority: 0.85 },
    { url: `${base}/field-app`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/get-the-app`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/sandbox`, lastModified: now, changeFrequency: 'monthly', priority: 0.85 },
    { url: `${base}/signup`, lastModified: now, changeFrequency: 'yearly', priority: 0.7 },
    { url: `${base}/login`, lastModified: now, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
