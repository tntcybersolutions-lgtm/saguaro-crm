'use client';
import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#1a8a4a',RED='#c03030';

interface ChecklistItem {
  id: string;
  label: string;
  category: string;
  status: 'pending' | 'complete';
}

const CHECKLIST_TEMPLATE: ChecklistItem[] = [
  // Financial
  { id: 'final_pay_app',     label: 'Final Payment Application (AIA G702)',            category: 'Financial',    status: 'pending' },
  { id: 'retainage_release', label: 'Retainage Release Processed',                     category: 'Financial',    status: 'pending' },
  { id: 'final_lien_sub',    label: 'Final Unconditional Lien Waivers — All Subs',     category: 'Financial',    status: 'pending' },
  { id: 'final_lien_gc',     label: 'Final Unconditional Lien Waiver — GC',            category: 'Financial',    status: 'pending' },
  { id: 'cost_reconcile',    label: 'Project Cost Reconciliation Complete',             category: 'Financial',    status: 'pending' },
  // Legal
  { id: 'final_contract',    label: 'Final Contract Executed & Filed',                 category: 'Legal',        status: 'pending' },
  { id: 'change_orders',     label: 'All Change Orders Signed & Closed',               category: 'Legal',        status: 'pending' },
  { id: 'warranties',        label: 'Warranty Documents Collected from All Subs',      category: 'Legal',        status: 'pending' },
  { id: 'bonds_closed',      label: 'Performance & Payment Bonds Closed',              category: 'Legal',        status: 'pending' },
  // Compliance
  { id: 'prevailing_wage',   label: 'Certified Payroll / Prevailing Wage Submitted',   category: 'Compliance',   status: 'pending' },
  { id: 'insurance_closed',  label: 'Insurance COIs Filed & Closed',                   category: 'Compliance',   status: 'pending' },
  { id: 'osha_logs',         label: 'OSHA 300 Log Updated & Filed',                    category: 'Compliance',   status: 'pending' },
  { id: 'permits_closed',    label: 'All Permits Closed',                               category: 'Compliance',   status: 'pending' },
  // Documents
  { id: 'as_builts',         label: 'As-Built Drawings Submitted to Owner',            category: 'Documents',    status: 'pending' },
  { id: 'om_manuals',        label: 'O&M Manuals Delivered',                           category: 'Documents',    status: 'pending' },
  { id: 'attic_stock',       label: 'Attic Stock & Spare Materials Delivered',         category: 'Documents',    status: 'pending' },
  { id: 'training_docs',     label: 'Equipment Training Records Provided',             category: 'Documents',    status: 'pending' },
  { id: 'photos',            label: 'Final Project Photo Documentation Complete',       category: 'Documents',    status: 'pending' },
  // Inspections
  { id: 'punch_list',        label: 'Punch List 100% Complete',                        category: 'Inspections',  status: 'pending' },
  { id: 'substantial_comp',  label: 'Certificate of Substantial Completion (G704)',    category: 'Inspections',  status: 'pending' },
  { id: 'co',                label: 'Certificate of Occupancy Issued',                  category: 'Inspections',  status: 'pending' },
  { id: 'final_inspection',  label: 'Final Building Inspection Passed',                category: 'Inspections',  status: 'pending' },
  { id: 'owner_walkthrough', label: 'Owner Final Walkthrough Completed',               category: 'Inspections',  status: 'pending' },
];

const CATEGORIES = ['Financial', 'Legal', 'Compliance', 'Documents', 'Inspections'];

const CAT_ICONS: Record<string, string> = {
  Financial: '💰', Legal: '⚖️', Compliance: '📋', Documents: '📁', Inspections: '🔍',
};

interface GeneratedDoc {
  type: string;
  url: string;
  label: string;
}

export default function CloseoutPage() {
  const params = useParams();
  const pid = params['projectId'] as string;

  const [items, setItems] = useState<ChecklistItem[]>(CHECKLIST_TEMPLATE);
  const [generating, setGenerating] = useState<string | null>(null);
  const [generatedDocs, setGeneratedDocs] = useState<GeneratedDoc[]>([]);
  const [toast, setToast] = useState<{ msg: string; color: string } | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());

  // Load saved state from DB on mount
  useEffect(() => { loadSavedState(); }, [pid]);

  function showToast(msg: string, color = '#1db954') {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 4000);
  }

  async function loadSavedState() {
    try {
      const r = await fetch(`/api/projects/${pid}/closeout`);
      if (!r.ok) return;
      const d = await r.json() as any;
      if (d.items && Array.isArray(d.items)) {
        setItems(prev => prev.map(item => {
          const saved = d.items.find((s: any) => s.id === item.id);
          return saved ? { ...item, status: saved.status } : item;
        }));
      }
    } catch { /* use defaults */ }
  }

  async function toggle(id: string) {
    const newItems = items.map(i => i.id === id ? { ...i, status: (i.status === 'pending' ? 'complete' : 'pending') as 'pending' | 'complete' } : i);
    setItems(newItems);
    // Persist
    try {
      await fetch(`/api/projects/${pid}/closeout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: newItems.map(i => ({ id: i.id, status: i.status })) }),
      });
    } catch { /* non-fatal */ }
  }

  function toggleCategory(cat: string) {
    setCollapsedCats(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }

  async function generateDoc(type: string, label: string) {
    setGenerating(type);
    try {
      let endpoint = '';
      if (type === 'closeout') endpoint = '/api/documents/closeout';
      else if (type === 'g704') endpoint = '/api/documents/g704';
      else if (type === 'g706') endpoint = '/api/documents/g706';
      else endpoint = '/api/documents/closeout';

      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: pid, tenantId: pid }),
      });
      const d = await r.json() as any;
      const url = d.url || d.pdfUrl || d.downloadUrl || '';
      if (url) {
        setGeneratedDocs(prev => [...prev.filter(doc => doc.type !== type), { type, url, label }]);
        showToast(`${label} generated!`);
      } else if (d.documentId) {
        setGeneratedDocs(prev => [...prev.filter(doc => doc.type !== type), { type, url: `/api/documents/${d.documentId}/download`, label }]);
        showToast(`${label} generated!`);
      } else {
        showToast(`${label} queued. Check Documents when ready.`, GOLD);
      }
    } catch {
      showToast(`${label} request sent. Check Documents.`, GOLD);
    } finally {
      setGenerating(null);
    }
  }

  const done = items.filter(i => i.status === 'complete').length;
  const total = items.length;
  const pct = Math.round((done / total) * 100);
  const isComplete = pct === 100;

  return (
    <div style={{ background: DARK, minHeight: '100%' }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 24, zIndex: 9999, background: RAISED, border: `1px solid ${toast.color}`, borderRadius: 10, padding: '12px 20px', color: toast.color, fontSize: 14, fontWeight: 700, boxShadow: '0 4px 24px rgba(0,0,0,.4)' }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '18px 24px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: DARK }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Project Closeout</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>{done}/{total} items complete — {pct}%</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => generateDoc('g704', 'AIA G704')}
            disabled={!!generating}
            style={{ padding: '8px 14px', background: 'rgba(212,160,23,.1)', border: '1px solid rgba(212,160,23,.3)', borderRadius: 7, color: GOLD, fontSize: 12, fontWeight: 700, cursor: generating ? 'wait' : 'pointer', opacity: generating ? 0.7 : 1 }}>
            {generating === 'g704' ? 'Generating...' : '📄 G704'}
          </button>
          <button
            onClick={() => generateDoc('g706', 'AIA G706')}
            disabled={!!generating}
            style={{ padding: '8px 14px', background: 'rgba(212,160,23,.1)', border: '1px solid rgba(212,160,23,.3)', borderRadius: 7, color: GOLD, fontSize: 12, fontWeight: 700, cursor: generating ? 'wait' : 'pointer', opacity: generating ? 0.7 : 1 }}>
            {generating === 'g706' ? 'Generating...' : '📄 G706'}
          </button>
          <button
            onClick={() => generateDoc('closeout', 'Closeout Package')}
            disabled={!!generating || !isComplete}
            title={!isComplete ? 'Complete all items first' : 'Generate closeout package'}
            style={{ padding: '8px 16px', background: isComplete ? `linear-gradient(135deg,${GOLD},#F0C040)` : 'rgba(255,255,255,.06)', border: 'none', borderRadius: 7, color: isComplete ? DARK : DIM, fontSize: 13, fontWeight: 800, cursor: (isComplete && !generating) ? 'pointer' : 'not-allowed', opacity: generating ? 0.7 : 1 }}>
            {generating === 'closeout' ? 'Generating...' : '📦 Generate Closeout Package'}
          </button>
        </div>
      </div>

      {/* Generated Docs Banner */}
      {generatedDocs.length > 0 && (
        <div style={{ margin: '0 24px', marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {generatedDocs.map(doc => (
            <div key={doc.type} style={{ background: 'rgba(26,138,74,.08)', border: '1px solid rgba(26,138,74,.25)', borderRadius: 10, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 24 }}>✅</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: '#1db954' }}>{doc.label} Generated</div>
              </div>
              <a href={doc.url} target="_blank" rel="noopener noreferrer" style={{ padding: '7px 16px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, borderRadius: 7, color: DARK, fontSize: 12, fontWeight: 800, textDecoration: 'none' }}>Download</a>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: 24 }}>

        {/* Progress Bar */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Closeout Progress</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: pct === 100 ? '#1db954' : GOLD }}>{pct}%</span>
          </div>
          <div style={{ height: 10, background: 'rgba(255,255,255,.06)', borderRadius: 5 }}>
            <div style={{ height: '100%', width: pct + '%', background: pct === 100 ? 'linear-gradient(90deg,#1a8a4a,#1db954)' : `linear-gradient(90deg,${GOLD},#F0C040)`, borderRadius: 5, transition: 'width .4s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: DIM }}>
            <span>{done} of {total} complete</span>
            {isComplete && <span style={{ color: '#1db954', fontWeight: 700 }}>✓ Ready for closeout package</span>}
          </div>
        </div>

        {/* Checklist grouped by category */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {CATEGORIES.map(cat => {
            const catItems = items.filter(i => i.category === cat);
            const catDone = catItems.filter(i => i.status === 'complete').length;
            const catPct = Math.round((catDone / catItems.length) * 100);
            const collapsed = collapsedCats.has(cat);

            return (
              <div key={cat} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
                {/* Category header */}
                <button
                  onClick={() => toggleCategory(cat)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 18 }}>{CAT_ICONS[cat]}</span>
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 15, color: TEXT }}>{cat}</span>
                  <span style={{ fontSize: 12, color: catPct === 100 ? '#1db954' : DIM, fontWeight: 600 }}>{catDone}/{catItems.length}</span>
                  <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,.08)', borderRadius: 2, marginLeft: 8 }}>
                    <div style={{ height: '100%', width: catPct + '%', background: catPct === 100 ? '#1db954' : GOLD, borderRadius: 2, transition: 'width .3s' }} />
                  </div>
                  <span style={{ color: DIM, fontSize: 14, marginLeft: 8 }}>{collapsed ? '▶' : '▼'}</span>
                </button>

                {/* Items */}
                {!collapsed && (
                  <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {catItems.map(item => (
                      <div
                        key={item.id}
                        onClick={() => toggle(item.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: item.status === 'complete' ? 'rgba(26,138,74,.06)' : 'rgba(255,255,255,.02)', border: `1px solid ${item.status === 'complete' ? 'rgba(26,138,74,.25)' : BORDER}`, borderRadius: 8, cursor: 'pointer', transition: 'all .15s' }}>
                        <div style={{ width: 22, height: 22, borderRadius: 5, border: `2px solid ${item.status === 'complete' ? '#1db954' : BORDER}`, background: item.status === 'complete' ? '#1db954' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s' }}>
                          {item.status === 'complete' && <span style={{ color: DARK, fontSize: 12, fontWeight: 800 }}>✓</span>}
                        </div>
                        <div style={{ flex: 1, fontSize: 13, color: item.status === 'complete' ? '#1db954' : TEXT, textDecoration: item.status === 'complete' ? 'line-through' : 'none', textDecorationColor: 'rgba(26,138,74,.5)' }}>
                          {item.label}
                        </div>
                        <div style={{ fontSize: 11, color: DIM, flexShrink: 0 }}>
                          {item.status === 'complete' ? <span style={{ color: '#1db954', fontWeight: 700 }}>Complete</span> : 'Pending'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom action strip */}
        <div style={{ marginTop: 24, padding: '16px 20px', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: 13, color: DIM }}>
            {isComplete
              ? <span style={{ color: '#1db954', fontWeight: 700 }}>✓ All closeout items complete — ready to generate final package</span>
              : <span>{total - done} items remaining before closeout package can be generated</span>
            }
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => generateDoc('g704', 'AIA G704')}
              disabled={!!generating}
              style={{ padding: '9px 16px', background: 'rgba(212,160,23,.1)', border: '1px solid rgba(212,160,23,.3)', borderRadius: 7, color: GOLD, fontSize: 13, fontWeight: 700, cursor: generating ? 'wait' : 'pointer' }}>
              Generate G704
            </button>
            <button
              onClick={() => generateDoc('g706', 'AIA G706')}
              disabled={!!generating}
              style={{ padding: '9px 16px', background: 'rgba(212,160,23,.1)', border: '1px solid rgba(212,160,23,.3)', borderRadius: 7, color: GOLD, fontSize: 13, fontWeight: 700, cursor: generating ? 'wait' : 'pointer' }}>
              Generate G706
            </button>
            <button
              onClick={() => generateDoc('closeout', 'Closeout Package')}
              disabled={!!generating || !isComplete}
              style={{ padding: '9px 20px', background: isComplete ? `linear-gradient(135deg,${GOLD},#F0C040)` : 'rgba(255,255,255,.06)', border: 'none', borderRadius: 7, color: isComplete ? DARK : DIM, fontSize: 13, fontWeight: 800, cursor: (isComplete && !generating) ? 'pointer' : 'not-allowed', opacity: generating ? 0.7 : 1 }}>
              {generating === 'closeout' ? 'Generating...' : 'Generate Closeout Package'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
