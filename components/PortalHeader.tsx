'use client';
/**
 * PortalHeader — Consistent header for ALL external portal pages.
 * Shows Saguaro logo + portal name + optional back button.
 * Used on: client portal, sub portal, sign portal, W-9, owner portal.
 */
import React from 'react';
import Link from 'next/link';
import { colors, font, radius, shadow } from '../lib/design-tokens';

interface PortalHeaderProps {
  portalName: string;
  subtitle?: string;
  showBackToPortals?: boolean;
}

export default function PortalHeader({ portalName, subtitle, showBackToPortals = true }: PortalHeaderProps) {
  return (
    <header
      style={{
        background: colors.white,
        borderBottom: `1px solid ${colors.border}`,
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: shadow.sm,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/portals" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <img
            src="/logo-full.jpg"
            alt="Saguaro Control Systems"
            style={{
              height: 36,
              width: 36,
              objectFit: 'contain',
              borderRadius: radius.md,
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <span style={{
              fontWeight: font.weight.black,
              fontSize: font.size.lg,
              letterSpacing: 1,
              color: colors.gold,
            }}>
              SAGUARO
            </span>
            <span style={{
              fontSize: font.size.xs,
              color: colors.textDim,
              fontWeight: font.weight.semibold,
            }}>
              {portalName}
            </span>
          </div>
        </Link>
        {subtitle && (
          <>
            <div style={{ width: 1, height: 24, background: colors.border, margin: '0 4px' }} />
            <span style={{ fontSize: font.size.md, color: colors.textMuted, fontWeight: font.weight.medium }}>{subtitle}</span>
          </>
        )}
      </div>

      {showBackToPortals && (
        <Link
          href="/portals"
          style={{
            fontSize: font.size.sm,
            color: colors.textMuted,
            textDecoration: 'none',
            padding: '6px 12px',
            borderRadius: radius.md,
            border: `1px solid ${colors.border}`,
            fontWeight: font.weight.medium,
            transition: 'all .15s',
          }}
        >
          ← All Portals
        </Link>
      )}
    </header>
  );
}
