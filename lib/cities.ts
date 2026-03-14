export interface City {
  slug: string;
  name: string;
  state: string;
  stateAbbr: string;
  region: string;
  constructionNotes: string; // Local construction market note
  population: string;
  latitude: number;
  longitude: number;
}

export const CITIES: City[] = [
  { slug: 'phoenix-az', name: 'Phoenix', state: 'Arizona', stateAbbr: 'AZ', region: 'Southwest', constructionNotes: 'Phoenix is one of the fastest-growing construction markets in the US, with over $8B in annual building permits.', population: '1.6M', latitude: 33.4484, longitude: -112.0740 },
  { slug: 'scottsdale-az', name: 'Scottsdale', state: 'Arizona', stateAbbr: 'AZ', region: 'Southwest', constructionNotes: 'Scottsdale\'s luxury residential and commercial development market demands precision estimating and compliance.', population: '258K', latitude: 33.4942, longitude: -111.9261 },
  { slug: 'dallas-tx', name: 'Dallas', state: 'Texas', stateAbbr: 'TX', region: 'Southwest', constructionNotes: 'Dallas-Fort Worth is the #1 construction market in the country by permit volume, with over $20B in annual activity.', population: '1.3M', latitude: 32.7767, longitude: -96.7970 },
  { slug: 'houston-tx', name: 'Houston', state: 'Texas', stateAbbr: 'TX', region: 'South', constructionNotes: 'Houston\'s energy and industrial construction sector drives billions in annual commercial and industrial projects.', population: '2.3M', latitude: 29.7604, longitude: -95.3698 },
  { slug: 'austin-tx', name: 'Austin', state: 'Texas', stateAbbr: 'TX', region: 'Southwest', constructionNotes: 'Austin\'s tech boom has created an unprecedented residential and commercial construction surge since 2019.', population: '978K', latitude: 30.2672, longitude: -97.7431 },
  { slug: 'san-antonio-tx', name: 'San Antonio', state: 'Texas', stateAbbr: 'TX', region: 'Southwest', constructionNotes: 'San Antonio\'s steady military and healthcare construction drives consistent project pipeline for GCs.', population: '1.4M', latitude: 29.4241, longitude: -98.4936 },
  { slug: 'denver-co', name: 'Denver', state: 'Colorado', stateAbbr: 'CO', region: 'Mountain West', constructionNotes: 'Denver\'s Front Range construction market features complex prevailing wage requirements and rapid growth.', population: '715K', latitude: 39.7392, longitude: -104.9903 },
  { slug: 'las-vegas-nv', name: 'Las Vegas', state: 'Nevada', stateAbbr: 'NV', region: 'Southwest', constructionNotes: 'Las Vegas\'s hospitality and entertainment construction sector requires precision lien waiver and compliance management.', population: '641K', latitude: 36.1699, longitude: -115.1398 },
  { slug: 'atlanta-ga', name: 'Atlanta', state: 'Georgia', stateAbbr: 'GA', region: 'Southeast', constructionNotes: 'Atlanta is the Southeast\'s largest construction market, with a booming commercial and multifamily sector.', population: '498K', latitude: 33.7490, longitude: -84.3880 },
  { slug: 'charlotte-nc', name: 'Charlotte', state: 'North Carolina', stateAbbr: 'NC', region: 'Southeast', constructionNotes: 'Charlotte\'s financial sector expansion is driving record commercial construction and renovation activity.', population: '874K', latitude: 35.2271, longitude: -80.8431 },
  { slug: 'tampa-fl', name: 'Tampa', state: 'Florida', stateAbbr: 'FL', region: 'Southeast', constructionNotes: 'Tampa\'s post-hurricane rebuild cycle and coastal development keep GCs busy year-round.', population: '392K', latitude: 27.9506, longitude: -82.4572 },
  { slug: 'nashville-tn', name: 'Nashville', state: 'Tennessee', stateAbbr: 'TN', region: 'Southeast', constructionNotes: 'Nashville\'s explosive growth has made it one of the top 5 fastest-growing construction markets in the US.', population: '689K', latitude: 36.1627, longitude: -86.7816 },
  { slug: 'orlando-fl', name: 'Orlando', state: 'Florida', stateAbbr: 'FL', region: 'Southeast', constructionNotes: 'Orlando\'s tourism, healthcare, and residential sectors keep its construction market among Florida\'s most active.', population: '309K', latitude: 28.5383, longitude: -81.3792 },
  { slug: 'los-angeles-ca', name: 'Los Angeles', state: 'California', stateAbbr: 'CA', region: 'West Coast', constructionNotes: 'LA\'s complex prevailing wage requirements, lien law nuances, and scale make smart software essential for GCs.', population: '3.9M', latitude: 34.0522, longitude: -118.2437 },
  { slug: 'chicago-il', name: 'Chicago', state: 'Illinois', stateAbbr: 'IL', region: 'Midwest', constructionNotes: 'Chicago\'s union-heavy construction market demands certified payroll compliance and precise lien management.', population: '2.7M', latitude: 41.8781, longitude: -87.6298 },
  { slug: 'seattle-wa', name: 'Seattle', state: 'Washington', stateAbbr: 'WA', region: 'West Coast', constructionNotes: 'Seattle\'s tech-driven construction boom and complex prevailing wage rules make compliance software critical.', population: '737K', latitude: 47.6062, longitude: -122.3321 },
  { slug: 'miami-fl', name: 'Miami', state: 'Florida', stateAbbr: 'FL', region: 'Southeast', constructionNotes: 'Miami\'s luxury residential and commercial tower market demands precision contract management.', population: '442K', latitude: 25.7617, longitude: -80.1918 },
  { slug: 'minneapolis-mn', name: 'Minneapolis', state: 'Minnesota', stateAbbr: 'MN', region: 'Midwest', constructionNotes: 'Minneapolis\'s strong union environment and seasonal construction cycles require smart project management.', population: '429K', latitude: 44.9778, longitude: -93.2650 },
  { slug: 'portland-or', name: 'Portland', state: 'Oregon', stateAbbr: 'OR', region: 'West Coast', constructionNotes: 'Portland\'s progressive building codes and sustainability requirements add complexity GCs need software to manage.', population: '652K', latitude: 45.5051, longitude: -122.6750 },
  { slug: 'san-diego-ca', name: 'San Diego', state: 'California', stateAbbr: 'CA', region: 'West Coast', constructionNotes: 'San Diego\'s military and biotech construction sectors, combined with California\'s strict lien laws, demand sophisticated tools.', population: '1.4M', latitude: 32.7157, longitude: -117.1611 },
];

export const CITY_SLUGS = CITIES.map(c => c.slug);
