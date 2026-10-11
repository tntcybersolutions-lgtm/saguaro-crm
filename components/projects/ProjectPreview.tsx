'use client';
import React from 'react';
import { Folder, MapPin, Buildings, Percent, Scales, Hash } from '@phosphor-icons/react';

/**
 * ProjectPreview — the job assembling itself as the GC types.
 *
 * Setting up a project used to be a form you filled in and hoped about: you
 * typed into fields, pressed Create, and only then found out what you had made.
 * This shows the thing being built while it is being built — the number it will
 * carry, the jurisdiction read out of the address, the retainage the template
 * set, the folders that will exist a second after Create.
 *
 * It also answers "is the system doing anything for me?" without a word of
 * marketing: every value here was filled in by Saguaro, and every one of them
 * stays editable on the form beside it.
 */

const GOLD = 'var(--brand-primary)';
const GOLD_HI = 'var(--brand-primary-strong)';
const TEXT = 'var(--text-primary)';
const DIM = 'var(--text-secondary)';

export interface ProjectPreviewProps {
  name: string;
  address: string;
  projectNumber: string;
  jurisdiction: string;
  retainagePct: number;
  contractType: string;
  templateName: string | null;
  folders: string[];
  divisionCount: number;
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, padding: '7px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <span style={{ display: 'inline-flex', flexShrink: 0, transform: 'translateY(2px)' }}>{icon}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: DIM, minWidth: 92 }}>
        {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, color: TEXT, minWidth: 0, wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

export default function ProjectPreview({
  name, address, projectNumber, jurisdiction, retainagePct,
  contractType, templateName, folders, divisionCount,
}: ProjectPreviewProps) {
  const named = name.trim();

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 16,
        padding: '20px 22px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--brand-primary-18)',
        boxShadow: '0 20px 44px -28px rgba(0,0,0,0.95), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          maskImage: 'radial-gradient(circle at 85% 0%, #000, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(circle at 85% 0%, #000, transparent 70%)',
        }}
      />

      <div style={{ position: 'relative' }}>
        <div style={{ fontSize: 10.5, fontWeight: 900, color: GOLD, marginBottom: 8 }}>
          What You Are Creating
        </div>

        <div
          style={{
            fontSize: named ? 21 : 16,
            fontWeight: 900,
            lineHeight: 1.2,
            letterSpacing: '-0.01em',
            color: named ? TEXT : 'rgba(255,255,255,0.30)',
            marginBottom: 3,
            transition: 'font-size .18s, color .18s',
          }}
        >
          {named || 'Name it above…'}
        </div>
        <div style={{ fontSize: 12.5, color: DIM, marginBottom: 12, minHeight: 18 }}>
          {address.trim() || 'and give it an address'}
        </div>

        <Row icon={<Hash size={13} weight="bold" color={GOLD_HI} />} label="Number" value={projectNumber || '—'} />
        {templateName && (
          <Row icon={<Buildings size={13} weight="duotone" color={GOLD_HI} />} label="Job Type" value={templateName} />
        )}
        <Row icon={<MapPin size={13} weight="duotone" color={GOLD_HI} />} label="Jurisdiction" value={jurisdiction || '—'} />
        <Row icon={<Percent size={13} weight="bold" color={GOLD_HI} />} label="Retainage" value={`${retainagePct}%`} />
        <Row icon={<Scales size={13} weight="duotone" color={GOLD_HI} />} label="Contract" value={contractType || '—'} />

        {folders.length > 0 && (
          <div style={{ marginTop: 13, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <Folder size={13} weight="duotone" color={GOLD_HI} />
              <span style={{ fontSize: 11, fontWeight: 700, color: DIM }}>
                {folders.length} folders · {divisionCount} CSI divisions
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {folders.map((x) => (
                <span
                  key={x}
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    padding: '3px 8px',
                    borderRadius: 6,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    color: 'var(--c-text-2)',
                  }}
                >
                  {x}
                </span>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 13, fontSize: 11.5, lineHeight: 1.5, color: 'var(--c-text-2)' }}>
          Saguaro filled these in. Every one of them is editable on the form, now or later.
        </div>
      </div>
    </div>
  );
}
