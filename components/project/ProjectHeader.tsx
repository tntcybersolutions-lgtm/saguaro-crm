'use client';

/**
 * ProjectHeader — one header per job screen: name, compact status badge,
 * cleanly formatted address (lib/format-address), an honest date line, and
 * the contextual actions aligned on the right. The name appears here and
 * nowhere else on the page.
 */

import React from 'react';
import Link from 'next/link';
import { Badge, type BadgeTone } from '@/components/ui/kit';
import { formatAddress, type AddressParts } from '@/lib/format-address';
import { ProjectTile } from '@/components/ui/ProjectColor';

export interface HeaderAction { href: string; label: string; icon?: React.ReactNode; primary?: boolean }

export default function ProjectHeader({ name, number, status, project, dateText, dateTone, actions = [] }: {
  name: string;
  number?: string | null;
  status: { label: string; tone: BadgeTone };
  project: (AddressParts & { id?: string | null; color?: string | null }) | null | undefined;
  /** "Finish Oct 12 · 8 days left" or "No end date set" — the caller decides, honestly. */
  dateText: React.ReactNode;
  dateTone?: 'bad' | 'warn';
  actions?: HeaderAction[];
}) {
  const address = formatAddress(project);
  return (
    <header className="pj-header">
      <div className="pj-header-main" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <ProjectTile project={project ? { id: project.id, color: project.color } : null} name={name} style={{ marginTop: 2 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
        <div className="pj-header-titleline">
          <h1 className="pj-title">{name}</h1>
          <Badge tone={status.tone} dot>{status.label}</Badge>
          {number && <span className="pj-number">{number}</span>}
        </div>
        <div className="pj-header-sub">
          {address ? <span>{address}</span> : <span className="pj-faint">No address on file</span>}
          <span className={dateTone === 'bad' ? 'pj-bad' : dateTone === 'warn' ? 'pj-warn' : undefined}>{dateText}</span>
        </div>
        </div>
      </div>
      {actions.length > 0 && (
        <div className="pj-header-actions">
          {actions.map((a) => (
            <Link key={a.href + a.label} href={a.href} className={`k-btn ${a.primary ? 'k-btn-primary' : 'k-btn-secondary'}`} data-quick={a.primary ? undefined : 'true'}>{a.icon} {a.label}</Link>
          ))}
        </div>
      )}
    </header>
  );
}
