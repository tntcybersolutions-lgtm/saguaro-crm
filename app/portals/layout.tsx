'use client';
/**
 * Portal Layout — Wraps ALL /portals/* pages with consistent header + branding.
 */
import React from 'react';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FB', color: '#111827', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", system-ui, sans-serif' }}>
      {children}
    </div>
  );
}
