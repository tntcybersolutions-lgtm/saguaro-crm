import React from 'react';
import Script from 'next/script';
import type { Metadata } from 'next';
import './globals.css';
import 'react-datepicker/dist/react-datepicker.css';
import { ToastProvider } from '../components/Toast';
import MarketingChatWrapper from '../components/MarketingChatWrapper';

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://saguarocontrol.net'),

  title: {
    default: 'Saguaro CRM — AI-Powered Construction Management',
    template: '%s | Saguaro CRM',
  },

  description: 'The CRM built for General Contractors. AI blueprint takeoff, AIA pay applications, lien waivers, bid intelligence, and certified payroll — all in one platform.',

  keywords: [
    'construction CRM',
    'general contractor software',
    'AI blueprint takeoff',
    'AIA G702 pay application',
    'lien waiver software',
    'construction bid management',
    'certified payroll WH-347',
    'construction project management',
    'Saguaro CRM',
  ],

  authors: [{ name: 'Saguaro Control Systems', url: 'https://saguarocontrol.net' }],

  creator: 'Saguaro Control Systems',
  publisher: 'Saguaro Control Systems',

  icons: {
    icon: [
      { url: '/favicon-32x32.png',     sizes: '32x32',   type: 'image/png' },
      { url: '/favicon-16x16.png',     sizes: '16x16',   type: 'image/png' },
      { url: '/icons/icon-96x96.png',  sizes: '96x96',   type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png',   sizes: '180x180', type: 'image/png' },
      { url: '/icons/icon-167x167.png', sizes: '167x167', type: 'image/png' },
      { url: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
      { url: '/icons/icon-120x120.png', sizes: '120x120', type: 'image/png' },
    ],
    shortcut: '/icons/icon-192x192.png',
  },

  openGraph: {
    type: 'website',
    url: 'https://saguarocontrol.net',
    siteName: 'Saguaro CRM',
    title: 'Saguaro CRM — AI-Powered Construction Management',
    description: 'AI blueprint takeoff, AIA pay applications, lien waivers, bid intelligence. Built for General Contractors.',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Saguaro CRM — AI-Powered Construction Management',
        type: 'image/jpeg',
      },
    ],
    locale: 'en_US',
  },

  verification: {
    other: {
      'msvalidate.01': 'EE20D7D11C69CE8D4C2AB59DF3D6ADB5',
    },
  },

  twitter: {
    card: 'summary_large_image',
    site: '@saguarocrm',
    creator: '@saguarocrm',
    title: 'Saguaro CRM — AI-Powered Construction Management',
    description: 'AI blueprint takeoff, AIA pay applications, lien waivers, bid intelligence. Built for General Contractors.',
    images: ['/og-image.jpg'],
  },

  alternates: {
    canonical: 'https://saguarocontrol.net',
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  manifest: '/site.webmanifest',
};

const GA_ID     = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const PH_KEY    = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const PH_HOST   = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        {/* PWA / Mobile App — iOS, Android, Desktop */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Saguaro Field" />
        <meta name="application-name" content="Saguaro Field" />
        <meta name="theme-color" content="#D4A017" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#D4A017" />
        {/* Apple touch icons — PNG, multiple sizes for iPhone/iPad/Mac */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="120x120" href="/icons/icon-120x120.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icons/icon-167x167.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        {/* Microsoft Tiles */}
        <meta name="msapplication-TileColor" content="#D4A017" />
        <meta name="msapplication-TileImage" content="/icons/icon-144x144.png" />
        <meta name="msapplication-config" content="none" />
        {/* Service Worker registration */}
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js').catch(function() {});
            });
          }
        `}} />
        {/* Google Analytics 4 */}
        {GA_ID && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
            <Script id="ga4-init" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_ID}', { page_path: window.location.pathname });
            `}} />
          </>
        )}

        {/* PostHog */}
        {PH_KEY && (
          <Script id="posthog-init" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `
            !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]);t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+" (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys getNextSurveyStep onSessionId setPersonPropertiesForFlags".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
            posthog.init('${PH_KEY}', { api_host: '${PH_HOST}', person_profiles: 'identified_only', capture_pageview: true });
          `}} />
        )}

        {/* Meta Pixel */}
        {process.env.NEXT_PUBLIC_META_PIXEL_ID && (
          <>
            <Script id="meta-pixel" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${process.env.NEXT_PUBLIC_META_PIXEL_ID}');
              fbq('track', 'PageView');
            `}} />
            <noscript dangerouslySetInnerHTML={{ __html: `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${process.env.NEXT_PUBLIC_META_PIXEL_ID}&ev=PageView&noscript=1"/>` }} />
          </>
        )}

        {/* Google Ads */}
        {process.env.NEXT_PUBLIC_GOOGLE_ADS_ID && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GOOGLE_ADS_ID}`} strategy="afterInteractive" />
            <Script id="google-ads-init" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${process.env.NEXT_PUBLIC_GOOGLE_ADS_ID}');
            `}} />
          </>
        )}
      </head>
      <body style={{ margin: 0, padding: 0, background: '#0d1117', color: '#e8edf8' }}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "Saguaro CRM",
              "url": "https://saguarocontrol.net",
              "logo": "https://saguarocontrol.net/logo-full.jpg",
              "image": "https://saguarocontrol.net/og-image.jpg",
              "description": "AI-powered construction CRM for general contractors. Blueprint takeoff, pay applications, lien waivers, bid intelligence.",
              "applicationCategory": "BusinessApplication",
              "operatingSystem": "Web",
              "offers": {
                "@type": "Offer",
                "price": "199",
                "priceCurrency": "USD",
                "priceSpecification": {
                  "@type": "UnitPriceSpecification",
                  "price": "199",
                  "priceCurrency": "USD",
                  "unitText": "MONTH"
                }
              },
              "aggregateRating": {
                "@type": "AggregateRating",
                "ratingValue": "4.9",
                "reviewCount": "47"
              },
              "publisher": {
                "@type": "Organization",
                "name": "Saguaro Control Systems",
                "url": "https://saguarocontrol.net",
                "logo": "https://saguarocontrol.net/logo-full.jpg",
                "address": {
                  "@type": "PostalAddress",
                  "addressLocality": "Phoenix",
                  "addressRegion": "AZ",
                  "addressCountry": "US"
                }
              }
            })
          }}
        />
        <ToastProvider>
          {children}
        </ToastProvider>
        <MarketingChatWrapper />
      </body>
    </html>
  );
}
