'use client';
/**
 * "You don't have access" — what a person sees instead of a screen their role
 * cannot open. Flat on the page (no card), one line, and the one way out.
 * No Retry: retrying a refusal cannot help.
 */
import React from 'react';
import { LockSimple, House } from '@phosphor-icons/react';
import { EmptyState, Button } from '@/components/ui/kit';

export default function NoAccess({ what, home = '/app' }: { what?: string; home?: string }) {
  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '64px 16px' }} role="alert">
      <EmptyState
        icon={<LockSimple size={22} weight="duotone" />}
        title="You don't have access"
        text={`Your role doesn't include ${what || 'this screen'}. Ask your company admin if you need it.`}
        action={<Button variant="primary" href={home} icon={<House size={15} />}>Go to Home</Button>}
      />
    </div>
  );
}
