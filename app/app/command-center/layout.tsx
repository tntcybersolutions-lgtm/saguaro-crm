import CommandCenterGate from '@/components/CommandCenterGate';

// Command Center pages are authed, per-tenant dashboards (Rob's franchise rollout et al.).
// They render at request time — never statically prerendered at build — which also avoids
// build-time prerender failures on Vercel. Applies to every /app/command-center/* route.
export const dynamic = 'force-dynamic';

export default function CommandCenterLayout({ children }: { children: React.ReactNode }) {
  return <CommandCenterGate>{children}</CommandCenterGate>;
}
