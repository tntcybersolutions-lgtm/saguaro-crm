'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { deriveTheme, themeToCssVars } from '@/lib/brand-theme';

const SAGUARO_GOLD = '#FFE600'; // Saguaro default brand: neon yellow

export interface WhiteLabelBranding {
  logoUrl: string;
  /** Measured at upload time from the logo's visible pixels. 'dark' means the
   *  artwork is dark and needs a light plate behind it to be readable on the
   *  app's near-black chrome; 'light' needs none. 'unknown' = not measured
   *  (SVG, or a logo uploaded before tone detection existed). */
  logoTone: 'dark' | 'light' | 'unknown';
  primaryColor: string;
  /** Optional page ground. Empty keeps the platform's dark base. */
  surfaceColor: string;
  /** False hides the "Powered by Saguaro" line for this tenant. */
  showSaguaroCredit: boolean;
  companyName: string;
  whiteLabelEnabled: boolean;
}

const defaults: WhiteLabelBranding = {
  logoUrl: '',
  logoTone: 'unknown',
  primaryColor: SAGUARO_GOLD,
  surfaceColor: '',
  showSaguaroCredit: true,
  companyName: '',
  whiteLabelEnabled: false,
};

const WhiteLabelContext = createContext<WhiteLabelBranding>(defaults);

export function useWhiteLabel(): WhiteLabelBranding {
  return useContext(WhiteLabelContext);
}

// Only accept a plain hex color (#rgb / #rrggbb). Anything else is ignored so a
// stored value can never inject arbitrary CSS via setProperty.
function safeHex(v: unknown): string | null {
  return typeof v === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim()) ? v.trim() : null;
}

/**
 * Paint the tenant's theme onto the document.
 *
 * This used to set the accent and nothing else, with the derived shades built
 * by color-mix — which produces a plausible-looking color and knows nothing
 * about whether the text on top of it can be read. Now the whole palette comes
 * from deriveTheme, which measures every pair against WCAG and adjusts what
 * fails. A tenant can pick any color on earth and the words stay legible.
 *
 * Surfaces are applied only when the tenant actually chose a ground. Leaving
 * them alone otherwise keeps the platform's own dark theme exactly as it is
 * for the majority who only ever set an accent.
 */
function applyBrandTheme(primary: string | null, surface: string | null) {
  const theme = deriveTheme({ primary, surface });
  const root = document.documentElement.style;
  const vars = themeToCssVars(theme);
  for (const [k, v] of Object.entries(vars)) {
    /* Without a chosen ground, only the accent family is overridden. */
    if (!surface && k.startsWith('--sg-')) continue;
    root.setProperty(k, v);
  }
  return theme;
}

export default function WhiteLabelProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<WhiteLabelBranding>(defaults);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/branding/tenant');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        const enabled = !!data.white_label_enabled;
        const hex = safeHex(data.primary_color);
        const surfaceHex = safeHex(data.surface_color);

        setBranding({
          logoUrl: typeof data.logo_url === 'string' ? data.logo_url : '',
          logoTone:
            data.logo_tone === 'dark' || data.logo_tone === 'light' ? data.logo_tone : 'unknown',
          primaryColor: hex ?? SAGUARO_GOLD,
          surfaceColor: surfaceHex ?? '',
          showSaguaroCredit: data.show_saguaro_credit !== false,
          companyName: typeof data.name === 'string' ? data.name : '',
          whiteLabelEnabled: enabled,
        });

        // App-chrome reskin is gated to the white-label tier. Without it the app
        // stays fully Saguaro (the :root defaults are untouched).
        if (enabled) applyBrandTheme(hex, surfaceHex);
      } catch {
        // Silently keep Saguaro defaults.
      }
    };
    load();

    // Settings → Branding dispatches this after a successful save/upload so the
    // sidebar lockup refreshes instantly — no hard reload needed.
    const onBrandingUpdated = () => { load(); };
    window.addEventListener('saguaro:branding-updated', onBrandingUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('saguaro:branding-updated', onBrandingUpdated);
    };
  }, []);

  return (
    <WhiteLabelContext.Provider value={branding}>
      {children}
    </WhiteLabelContext.Provider>
  );
}
