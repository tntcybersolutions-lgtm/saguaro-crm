'use client';
/**
 * /app — the role-based home (docs/SPEC-dashboard-2026-10-03.md).
 * The previous dashboard lives on at /app/classic as the recovery path; a
 * tenant with settings.features.classic_home = true is sent there.
 */
import HomeV2 from '@/components/home/HomeV2';

export default function AppHome() {
  return <HomeV2 />;
}
