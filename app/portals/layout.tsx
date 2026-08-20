'use client';
/**
 * Portal Layout — Wraps ALL /portals/* pages with:
 * - Consistent background + font
 * - Toast notification system (success/error/warning/info)
 */
import React from 'react';
import { ToastProvider } from '../../components/ui/Toast';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div style={{ minHeight: '100vh', background: '#0d1117', color: '#F0F4FF', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", system-ui, sans-serif' }}>
        {children}
      </div>
    </ToastProvider>
  );
}
