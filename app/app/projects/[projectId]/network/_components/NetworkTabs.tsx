'use client';
/**
 * The Network tool's sub-nav — one kit Tabs strip shared by every page under
 * /app/projects/:id/network, so moving between Devices, VLANs, Cables and the
 * rest reads as one tool. Each tab is a page; selecting one navigates.
 */
import React from 'react';
import { useRouter } from 'next/navigation';
import { Tabs } from '@/components/ui/kit';

export type NetworkTab = 'overview' | 'devices' | 'vlans' | 'cables' | 'firewall' | 'wifi' | 'config' | 'wizard' | 'reports';

const TABS: { key: NetworkTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'devices', label: 'Devices' },
  { key: 'vlans', label: 'VLANs' },
  { key: 'cables', label: 'Cables' },
  { key: 'firewall', label: 'Firewall' },
  { key: 'wifi', label: 'WiFi' },
  { key: 'config', label: 'Config' },
  { key: 'wizard', label: 'AI Wizard' },
  { key: 'reports', label: 'Reports' },
];

export const networkHref = (projectId: string, tab: NetworkTab = 'overview') =>
  tab === 'overview' ? `/app/projects/${projectId}/network` : `/app/projects/${projectId}/network/${tab}`;

/** Crumbs for a Network page: Projects › Job › Network › <page>. */
export function networkCrumbs(projectId: string, jobName: string | undefined, page?: string) {
  const base = `/app/projects/${projectId}`;
  const crumbs: { label: string; href?: string }[] = [
    { label: 'Projects', href: '/app/projects' },
    { label: jobName || 'Project', href: `${base}/overview` },
  ];
  if (page) {
    crumbs.push({ label: 'Network', href: networkHref(projectId) });
    crumbs.push({ label: page });
  } else {
    crumbs.push({ label: 'Network' });
  }
  return crumbs;
}

export default function NetworkTabs({ projectId, value }: { projectId: string; value: NetworkTab }) {
  const router = useRouter();
  return (
    <Tabs
      tabs={TABS}
      value={value}
      onChange={(k) => { if (k !== value) router.push(networkHref(projectId, k as NetworkTab)); }}
    />
  );
}
