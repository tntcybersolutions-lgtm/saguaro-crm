'use client';
import React, { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import BidPackageWizard from '../../../../../components/BidPackageWizard';

const GOLD = '#D4A017', DARK = '#0d1117', RAISED = '#1f2c3e', BORDER = '#263347', DIM = '#8fa3c0', TEXT = '#e8edf8';

function Badge({ label, color = '#94a3b8', bg = 'rgba(148,163,184,.12)' }: { label: string; color?: string; bg?: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: bg, color, textTransform: 'uppercase', letterSpacing: 0.3 }}>
      {label}
    </span>
  );
}

function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div style={{ padding: '18px 24px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: DARK }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>{title}</h2>
        {sub && <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>{sub}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 10 }}>{actions}</div>}
    </div>
  );
}

interface DropdownMenuProps {
  packageId: string;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}

function DropdownMenu({ packageId, onClose, anchorRef }: DropdownMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose, anchorRef]);

  const items = [
    { label: 'Edit', icon: '✏️' },
    { label: 'Duplicate', icon: '📋' },
    { label: 'Archive', icon: '📦' },
    { label: 'View Invites', icon: '📧' },
  ];

  return (
    <div ref={menuRef} style={{
      position: 'absolute', right: 0, top: '110%', zIndex: 100,
      background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: 160, overflow: 'hidden',
    }}>
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => {
            console.log(`${item.label} package`, packageId);
            onClose();
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            padding: '10px 16px', background: 'none', border: 'none',
            color: TEXT, fontSize: 13, cursor: 'pointer', textAlign: 'left',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(212,160,23,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <span style={{ fontSize: 14 }}>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  );
}

const INITIAL = [
  { id: 'bp-1', code: 'BP-01', name: 'Electrical Package', status: 'awarded', due: '2025-12-10', subs: 4, awarded: 'Desert Electrical — $385,000' },
  { id: 'bp-2', code: 'BP-02', name: 'Concrete & Foundation', status: 'awarded', due: '2025-12-08', subs: 3, awarded: 'AZ Concrete — $290,000' },
  { id: 'bp-3', code: 'BP-03', name: 'Structural Framing', status: 'awarded', due: '2025-12-12', subs: 5, awarded: 'Rio Framing — $480,000' },
  { id: 'bp-4', code: 'BP-04', name: 'Mechanical HVAC', status: 'awarded', due: '2025-12-14', subs: 3, awarded: 'Pinnacle Mechanical — $340,000' },
  { id: 'bp-5', code: 'BP-05', name: 'Plumbing Rough-In & Trim', status: 'awarded', due: '2025-12-15', subs: 2, awarded: 'Blue River Plumbing — $220,000' },
  { id: 'bp-6', code: 'BP-06', name: 'Roofing — TPO System', status: 'awarded', due: '2025-12-10', subs: 3, awarded: 'Southwest Roofing — $195,000' },
];

export default function BidPackagesPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params['projectId'] as string;

  const [showWizard, setShowWizard] = useState(false);
  const [packages, setPackages] = useState(INITIAL);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const dropdownRefs = useRef<Record<string, React.RefObject<HTMLButtonElement | null>>>({});

  function getDropdownRef(id: string): React.RefObject<HTMLButtonElement | null> {
    if (!dropdownRefs.current[id]) {
      dropdownRefs.current[id] = React.createRef<HTMLButtonElement>();
    }
    return dropdownRefs.current[id];
  }

  async function handleInviteSubs(pkgId: string) {
    setInvitingId(pkgId);
    try {
      await fetch(`/api/bid-packages/${pkgId}/invite-subs`, { method: 'POST' });
    } catch {
      // ignore
    } finally {
      setInvitingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Bid Packages"
        sub="Manage subcontractor bid solicitations"
        actions={
          <button
            onClick={() => setShowWizard(true)}
            style={{
              padding: '8px 16px',
              background: `linear-gradient(135deg,${GOLD},#F0C040)`,
              border: 'none', borderRadius: 7,
              color: '#0d1117', fontSize: 13, fontWeight: 800, cursor: 'pointer',
            }}
          >
            🤖 Create + AI Generate Bid Jacket
          </button>
        }
      />

      <div style={{ padding: 24 }}>
        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { l: 'Total Packages', v: String(packages.length) },
            { l: 'Awarded', v: String(packages.filter(p => p.status === 'awarded').length) },
            { l: 'Total Awarded $', v: '$1,910,000' },
            { l: 'Subs Invited', v: '20' },
          ].map(k => (
            <div key={k.l} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: DIM, marginBottom: 6 }}>{k.l}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: TEXT }}>{k.v}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#0a1117' }}>
              {['Code', 'Package Name', 'Status', 'Bid Due', 'Subs Invited', 'Awarded To', 'Actions'].map(h => (
                <th key={h} style={{
                  padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: 0.5, color: DIM,
                  borderBottom: `1px solid ${BORDER}`,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {packages.map(bp => (
              <tr key={bp.id} style={{ borderBottom: `1px solid rgba(38,51,71,.5)` }}>
                <td style={{ padding: '12px 14px', color: GOLD, fontWeight: 700, fontFamily: 'monospace' }}>{bp.code}</td>
                <td style={{ padding: '12px 14px', color: TEXT, fontWeight: 600 }}>{bp.name}</td>
                <td style={{ padding: '12px 14px' }}>
                  <Badge
                    label={bp.status}
                    color={bp.status === 'awarded' ? '#3dd68c' : GOLD}
                    bg={bp.status === 'awarded' ? 'rgba(26,138,74,.12)' : 'rgba(212,160,23,.12)'}
                  />
                </td>
                <td style={{ padding: '12px 14px', color: DIM }}>{bp.due}</td>
                <td style={{ padding: '12px 14px', color: DIM }}>{bp.subs}</td>
                <td style={{ padding: '12px 14px', color: TEXT }}>{bp.awarded}</td>
                <td style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', position: 'relative' }}>
                    {/* View */}
                    <button
                      onClick={() => router.push(`/app/projects/${projectId}/bid-packages/${bp.id}`)}
                      style={{
                        background: 'none', border: `1px solid ${BORDER}`,
                        borderRadius: 5, color: GOLD, fontSize: 11, padding: '3px 8px', cursor: 'pointer',
                      }}
                    >
                      View
                    </button>

                    {/* Invite Subs */}
                    <button
                      onClick={() => handleInviteSubs(bp.id)}
                      disabled={invitingId === bp.id}
                      style={{
                        background: 'none', border: `1px solid rgba(212,160,23,0.4)`,
                        borderRadius: 5, color: GOLD, fontSize: 11, padding: '3px 8px', cursor: 'pointer',
                        opacity: invitingId === bp.id ? 0.5 : 1,
                      }}
                    >
                      {invitingId === bp.id ? '...' : '📧 Invite Subs'}
                    </button>

                    {/* ⋯ dropdown */}
                    <div style={{ position: 'relative' }}>
                      <button
                        ref={getDropdownRef(bp.id) as React.RefObject<HTMLButtonElement>}
                        onClick={() => setOpenDropdown(openDropdown === bp.id ? null : bp.id)}
                        style={{
                          background: 'none', border: `1px solid ${BORDER}`,
                          borderRadius: 5, color: DIM, fontSize: 11, padding: '3px 8px', cursor: 'pointer',
                        }}
                      >
                        ⋯
                      </button>
                      {openDropdown === bp.id && (
                        <DropdownMenu
                          packageId={bp.id}
                          onClose={() => setOpenDropdown(null)}
                          anchorRef={getDropdownRef(bp.id)}
                        />
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showWizard && (
        <BidPackageWizard
          projectId={projectId}
          onClose={() => setShowWizard(false)}
          onCreated={(id) => {
            setShowWizard(false);
            router.push(`/app/projects/${projectId}/bid-packages/${id}`);
          }}
        />
      )}
    </div>
  );
}
