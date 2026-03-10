'use client';
import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

const GOLD='#D4A017', RAISED='#1f2c3e', BORDER='#263347', DIM='#8fa3c0', TEXT='#e8edf8';

export default function ContractsPage() {
  const params = useParams();
  const pid = params['projectId'] as string;
  return (
    <div style={{ padding: '32px 28px', maxWidth: 1000, margin: '0 auto' }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: TEXT, marginBottom: 28 }}>Contracts</h2>
      <div style={{ background: RAISED, border: '1px solid ' + BORDER, borderRadius: 12, padding: 48, textAlign: 'center' as const }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 8 }}>Contracts</div>
        <div style={{ fontSize: 13, color: DIM, marginBottom: 24 }}>
          Connect Supabase and deploy to activate this module fully.
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={() => alert('Connect Supabase to activate full functionality.')}
            style={{ padding: '10px 22px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 8, color: '#0d1117', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
          >
            + New Contracts
          </button>
          <Link href={'/app/projects/' + pid + '/overview'} style={{ padding: '10px 18px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 8, color: DIM, fontSize: 13, textDecoration: 'none' }}>
            Back to Overview
          </Link>
        </div>
      </div>
    </div>
  );
}
