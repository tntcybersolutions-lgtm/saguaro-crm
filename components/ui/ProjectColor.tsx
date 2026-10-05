'use client';

/**
 * ProjectDot / ProjectTile / ProjectStripe — the only ways a job colour is
 * drawn. Colours come from lib/project-colors (stored swatch, else a stable
 * hash); nothing here or anywhere else carries a hex.
 *
 *   <ProjectDot project={p} />          8px dot before a job name (picker, sidebar)
 *   <ProjectTile project={p} />         36px initials tile (project header)
 *   stripeStyle(p) / <ProjectStripe>    3px left edge on a row or card (lists)
 *   barStyle(p)                         25% fill + 3px edge (schedule / Gantt bars)
 *
 * Always next to the job's name or number. Never a background, never text,
 * never on a button, never to mean status.
 */

import React from 'react';
import { projectColor, jobDotStyle, jobTileStyle, jobStripeStyle, jobBarStyle, jobRowVar } from '@/lib/project-colors';
import { projectMonogram } from '@/lib/project-identity';

type P = { id?: string | null; color?: string | null; name?: string | null } | string | null | undefined;

export function ProjectDot({ project, size = 8, style }: { project: P; size?: number; style?: React.CSSProperties }) {
  const hex = projectColor(project);
  return <span aria-hidden style={{ ...jobDotStyle(hex), width: size, height: size, ...style }} />;
}

export function ProjectTile({ project, name, size = 36, style }: { project: P; name?: string | null; size?: number; style?: React.CSSProperties }) {
  const hex = projectColor(project);
  const label = projectMonogram(name ?? (typeof project === 'object' ? project?.name : null));
  return (
    <span aria-hidden style={{ ...jobTileStyle(hex), width: size, height: size, borderRadius: Math.round(size * 0.28), fontSize: Math.round(size * 0.35), ...style }}>
      {label}
    </span>
  );
}

/** Inline style for a row / card: the 3px left edge in the job colour. */
export const stripeStyle = (project: P): React.CSSProperties => jobStripeStyle(projectColor(project));
/** Inline style for a schedule / Gantt / calendar bar. */
export const barStyle = (project: P): React.CSSProperties => jobBarStyle(projectColor(project));
/** For DataTable rows: pass through `rowStyle` so the kit CSS draws the edge. */
export const rowStripe = (project: P): React.CSSProperties => jobRowVar(projectColor(project));

export function ProjectStripe({ project, children, className, style }: { project: P; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={className} style={{ ...stripeStyle(project), ...style }}>{children}</div>;
}
