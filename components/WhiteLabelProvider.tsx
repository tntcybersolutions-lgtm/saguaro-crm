'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';

const GOLD = '#C8960F';

interface WhiteLabelBranding {
  logoUrl: string;
  primaryColor: string;
  companyName: string;
  customCss: string;
}

const defaults: WhiteLabelBranding = {
  logoUrl: '',
  primaryColor: GOLD,
  companyName: '',
  customCss: '',
};

const WhiteLabelContext = createContext<WhiteLabelBranding>(defaults);

export function useWhiteLabel(): WhiteLabelBranding {
  return useContext(WhiteLabelContext);
}

interface WhiteLabelProviderProps {
  children: React.ReactNode;
}

export default function WhiteLabelProvider({ children }: WhiteLabelProviderProps) {
  const [branding, setBranding] = useState<WhiteLabelBranding>(defaults);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/branding/tenant');
        if (!res.ok) return;
        const data = await res.json();

        if (cancelled) return;

        const next: WhiteLabelBranding = {
          logoUrl: data.logo_url || '',
          primaryColor: data.primary_color || GOLD,
          companyName: data.name || '',
          customCss: data.custom_css || '',
        };

        setBranding(next);

        // Apply CSS variable for brand color
        document.documentElement.style.setProperty('--brand-color', next.primaryColor);
      } catch {
        // Silently fall back to defaults
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return (
    <WhiteLabelContext.Provider value={branding}>
      {branding.customCss && <style>{branding.customCss}</style>}
      {children}
    </WhiteLabelContext.Provider>
  );
}
