'use client';
/**
 * Saguaro Field — Saved Views Manager
 * Create, manage, and apply saved filter views across modules.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const BASE = '#F8F9FB';
const CARD = 'rgba(26,31,46,0.7)';
const GOLD = '#C8960F';
const GREEN = '#22C55E';
const BLUE = '#3B82F6';
const RED = '#EF4444';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const BORDER = '#EEF0F3';

const MODULES = [
  { value: 'punch', label: 'Punch List', route: '/field/punch' },
  { value: 'rfis', label: 'RFIs', route: '/field/rfis' },
  { value: 'change_orders', label: 'Change Orders', route: '/field/change-orders' },
  { value: 'invoices', label: 'Invoices', route: '/field/invoices' },
  { value: 'photos', label: 'Photos', route: '/field/photos' },
  { value: 'daily_logs', label: 'Daily Logs', route: '/field/daily-log' },
  { value: 'submittals', label: 'Submittals', route: '/field/submittals' },
  { value: 'inspections', label: 'Inspections', route: '/field/inspect' },
] as const;

const STATUS_OPTIONS = ['open', 'closed', 'pending', 'in_progress', 'approved', 'rejected', 'draft', 'overdue'];

interface SavedView {
  id: string;
  name: string;
  module: string;
  filters: {
    status?: string[];
    date_from?: string;
    date_to?: string;
    assigned_to?: string;
  };
  is_default: boolean;
  created_at: string;
}

function moduleLabel(mod: string): string {
  return MODULES.find(m => m.value === mod)?.label || mod.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function moduleRoute(mod: string): string {
  return MODULES.find(m => m.value === mod)?.route || '/field';
}

function moduleColor(mod: string): string {
  const map: Record<string, string> = {
    punch: RED, rfis: BLUE, change_orders: GOLD,
    invoices: GREEN, photos: '#8B5CF6', daily_logs: '#F97316',
    submittals: '#06B6D4', inspections: '#EC4899',
  };
  return map[mod] || DIM;
}

export default function SavedViewsPage() {
  const router = useRouter();
  const [views, setViews] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Create form state
  const [formName, setFormName] = useState('');
  const [formModule, setFormModule] = useState('punch');
  const [formStatuses, setFormStatuses] = useState<string[]>([]);
  const [formDateFrom, setFormDateFrom] = useState('');
  const [formDateTo, setFormDateTo] = useState('');
  const [formAssigned, setFormAssigned] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchViews = useCallback(async () => {
    try {
      const res = await fetch('/api/saved-views?module=all');
      if (res.ok) {
        const data = await res.json();
        setViews(data.views || data || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchViews(); }, [fetchViews]);

  const createView = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/saved-views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          module: formModule,
          filters: {
            ...(formStatuses.length > 0 && { status: formStatuses }),
            ...(formDateFrom && { date_from: formDateFrom }),
            ...(formDateTo && { date_to: formDateTo }),
            ...(formAssigned.trim() && { assigned_to: formAssigned.trim() }),
          },
        }),
      });
      if (res.ok) {
        await fetchViews();
        setShowCreate(false);
        setFormName('');
        setFormStatuses([]);
        setFormDateFrom('');
        setFormDateTo('');
        setFormAssigned('');
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  const toggleDefault = async (id: string, isDefault: boolean) => {
    try {
      await fetch('/api/saved-views', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_default: !isDefault }),
      });
      setViews(prev => prev.map(v =>
        v.id === id ? { ...v, is_default: !isDefault } : (isDefault ? v : { ...v, is_default: false })
      ));
    } catch {
      // silent
    }
  };

  const deleteView = async (id: string) => {
    try {
      await fetch('/api/saved-views', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setViews(prev => prev.filter(v => v.id !== id));
      setDeleteConfirm(null);
    } catch {
      // silent
    }
  };

  const applyView = (view: SavedView) => {
    const params = new URLSearchParams();
    if (view.filters.status?.length) params.set('status', view.filters.status.join(','));
    if (view.filters.date_from) params.set('from', view.filters.date_from);
    if (view.filters.date_to) params.set('to', view.filters.date_to);
    if (view.filters.assigned_to) params.set('assigned', view.filters.assigned_to);
    const route = moduleRoute(view.module);
    const qs = params.toString();
    router.push(qs ? `${route}?${qs}` : route);
  };

  const toggleStatus = (s: string) => {
    setFormStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  // Group views by module
  const grouped = views.reduce<Record<string, SavedView[]>>((acc, v) => {
    (acc[v.module] = acc[v.module] || []).push(v);
    return acc;
  }, {});

  const filterSummary = (filters: SavedView['filters']): string => {
    const parts: string[] = [];
    if (filters.status?.length) parts.push(`Status: ${filters.status.join(', ')}`);
    if (filters.date_from || filters.date_to) parts.push(`Date: ${filters.date_from || '...'} to ${filters.date_to || '...'}`);
    if (filters.assigned_to) parts.push(`Assigned: ${filters.assigned_to}`);
    return parts.length ? parts.join(' | ') : 'No filters';
  };

  const inputStyle: React.CSSProperties = {
    background: 'rgba(15,20,25,0.6)',
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 14,
    color: TEXT,
    width: '100%',
    outline: 'none',
  };

  return (
    <div style={{ background: BASE, minHeight: '100vh', color: TEXT, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px',
        borderBottom: `1px solid ${BORDER}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>Saved Views</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: DIM }}>Save and apply filter presets across all modules</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={{
            background: showCreate ? 'rgba(239,68,68,0.15)' : GOLD,
            color: showCreate ? RED : '#000',
            border: 'none',
            borderRadius: 10,
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {showCreate ? 'Cancel' : '+ Create View'}
        </button>
      </div>

      <div style={{ padding: '20px 24px', maxWidth: 1000, margin: '0 auto' }}>
        {/* Create View Form */}
        {showCreate && (
          <div style={{
            background: CARD,
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: `1px solid ${BORDER}`,
            borderRadius: 16,
            padding: 24,
            marginBottom: 24,
          }}>
            <h3 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 700, color: GOLD }}>Create New View</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>View Name *</label>
                <input
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. Open RFIs This Month"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>Module *</label>
                <select
                  value={formModule}
                  onChange={e => setFormModule(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  {MODULES.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>Status Filter</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {STATUS_OPTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => toggleStatus(s)}
                      style={{
                        background: formStatuses.includes(s) ? 'rgba(212,160,23,0.15)' : 'rgba(15,20,25,0.4)',
                        color: formStatuses.includes(s) ? GOLD : DIM,
                        border: `1px solid ${formStatuses.includes(s) ? GOLD + '40' : BORDER}`,
                        borderRadius: 6,
                        padding: '4px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                      }}
                    >
                      {s.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>Date From</label>
                <input type="date" value={formDateFrom} onChange={e => setFormDateFrom(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>Date To</label>
                <input type="date" value={formDateTo} onChange={e => setFormDateTo(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>Assigned To</label>
                <input
                  value={formAssigned}
                  onChange={e => setFormAssigned(e.target.value)}
                  placeholder="e.g. John Smith"
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={createView}
                disabled={!formName.trim() || saving}
                style={{
                  background: !formName.trim() ? 'rgba(212,160,23,0.3)' : GOLD,
                  color: !formName.trim() ? DIM : '#000',
                  border: 'none',
                  borderRadius: 10,
                  padding: '10px 28px',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: !formName.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Saving...' : 'Save View'}
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: DIM }}>
            <div style={{ width: 32, height: 32, border: '3px solid #E5E7EB', borderTopColor: GOLD, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            Loading saved views...
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div style={{
            background: CARD,
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: `1px solid ${BORDER}`,
            borderRadius: 16,
            padding: '48px 24px',
            textAlign: 'center',
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth="1.5" style={{ marginBottom: 12 }}>
              <rect x="3" y="3" width="18" height="18" rx="2" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="3" y1="9" x2="21" y2="9" strokeLinecap="round"/>
              <line x1="9" y1="21" x2="9" y2="9" strokeLinecap="round"/>
            </svg>
            <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 4 }}>No Saved Views</div>
            <div style={{ fontSize: 13, color: DIM }}>Create your first saved view to quickly apply filters.</div>
          </div>
        ) : (
          Object.entries(grouped).map(([mod, modViews]) => (
            <div key={mod} style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 6,
                  background: moduleColor(mod) + '18',
                  color: moduleColor(mod),
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}>
                  {moduleLabel(mod)}
                </span>
                <span style={{ fontSize: 12, color: DIM }}>{modViews.length} view{modViews.length !== 1 ? 's' : ''}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {modViews.map(view => (
                  <div
                    key={view.id}
                    style={{
                      background: CARD,
                      backdropFilter: 'blur(16px)',
                      WebkitBackdropFilter: 'blur(16px)',
                      border: `1px solid ${BORDER}`,
                      borderRadius: 16,
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      cursor: 'pointer',
                      transition: 'border-color 0.15s',
                      flexWrap: 'wrap',
                    }}
                    onClick={() => applyView(view)}
                  >
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{view.name}</span>
                        {view.is_default && (
                          <span style={{
                            fontSize: 9,
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: 'rgba(34,197,94,0.12)',
                            color: GREEN,
                            textTransform: 'uppercase',
                          }}>
                            Default
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: DIM }}>{filterSummary(view.filters)}</div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => toggleDefault(view.id, view.is_default)}
                        style={{
                          background: view.is_default ? 'rgba(34,197,94,0.12)' : '#F3F4F6',
                          color: view.is_default ? GREEN : DIM,
                          border: `1px solid ${view.is_default ? 'rgba(34,197,94,0.25)' : BORDER}`,
                          borderRadius: 8,
                          padding: '6px 12px',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {view.is_default ? 'Default' : 'Set Default'}
                      </button>
                      {deleteConfirm === view.id ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            onClick={() => deleteView(view.id)}
                            style={{
                              background: 'rgba(239,68,68,0.15)',
                              color: RED,
                              border: `1px solid rgba(239,68,68,0.3)`,
                              borderRadius: 8,
                              padding: '6px 12px',
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            style={{
                              background: '#F3F4F6',
                              color: DIM,
                              border: `1px solid ${BORDER}`,
                              borderRadius: 8,
                              padding: '6px 12px',
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(view.id)}
                          style={{
                            background: 'rgba(239,68,68,0.08)',
                            color: RED,
                            border: `1px solid rgba(239,68,68,0.15)`,
                            borderRadius: 8,
                            padding: '6px 12px',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
