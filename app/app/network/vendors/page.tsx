'use client';
import React, { useState, useEffect, useCallback } from 'react';

// ─── Theme tokens (match heatmap/page.tsx) ─────���───────────────────────────────
const GOLD = '#D4A017', DARK = '#0d1117', CARD = '#161b22', CARD2 = '#1c2129',
  BORDER = '#30363d', DIM = '#8b949e', TEXT = '#e6edf3', HOVER = '#1c2129';

// ─── Interfaces (matched to real DB schema) ──────────���─────────────────────────
interface GuideStep {
  step: number;
  title: string;
  detail: string;
}

interface GuideListItem {
  id: string;
  vendor: string;
  model_family: string;
  category: string;
  title: string;
  difficulty: string | null;
  estimated_minutes: number | null;
  tags: string[] | null;
  created_at: string | null;
}

interface GuideDetail extends GuideListItem {
  content: string;
  steps: GuideStep[] | null;
}

type ViewMode = 'grid' | 'detail';
type DetailTab = 'overview' | 'steps';

// ─── Constants ─────────────────────────────────────────────────────────────────
const VENDOR_COLORS: Record<string, string> = {
  'Ubiquiti': '#0066cc',
  'Cisco Meraki': '#00bceb',
  'Aruba': '#ff8300',
  'SonicWall': '#ff6600',
  'Fortinet': '#ee3124',
  'Netgear': '#dd2222',
  'Ruckus': '#007dc6',
  'TP-Link': '#1eb3e0',
  'APC': '#1a5276',
  'CyberPower': '#2e86c1',
  'Cradlepoint': '#7d3c98',
  'Peplink': '#27ae60',
  'Generic': '#6e7681',
  'Default': '#6e7681',
};

const CATEGORY_LABELS: Record<string, string> = {
  initial_setup: 'Initial Setup', vlan_config: 'VLAN Config', switch_config: 'Switch Config',
  firewall_setup: 'Firewall', outdoor_setup: 'Outdoor', camera_setup: 'Cameras',
  wifi_setup: 'WiFi', cellular_setup: 'Cellular', ups_setup: 'UPS/Power',
  security_hardening: 'Security', cabling_guide: 'Cabling', poe_config: 'PoE',
  outdoor_mesh: 'Mesh', high_density: 'High Density', iot_sensor: 'IoT/Sensors',
  '5g_setup': '5G', sd_wan_setup: 'SD-WAN', outdoor_ap: 'Outdoor AP',
  switch_10g: '10G Switch', switch_poe: 'PoE Switch', cellular_router: 'Cell Router',
  ruggedized_ap: 'Ruggedized', '5g_mobile': '5G Mobile', electrical_safety: 'Grounding',
  ups_rack: 'Rack UPS',
};

const CATEGORY_ICONS: Record<string, string> = {
  firewall_setup: '\u{1F6E1}\uFE0F', initial_setup: '\u{1F4F6}', switch_config: '\u{1F500}',
  ups_setup: '\u{1F50B}', ups_rack: '\u{1F50B}', vlan_config: '\u{1F310}',
  outdoor_setup: '\u{2600}\uFE0F', outdoor_mesh: '\u{2600}\uFE0F', outdoor_ap: '\u{2600}\uFE0F',
  camera_setup: '\u{1F4F7}', wifi_setup: '\u{1F4F6}', cellular_setup: '\u{1F4F1}',
  cellular_router: '\u{1F4F1}', '5g_setup': '\u{1F4F1}', '5g_mobile': '\u{1F4F1}',
  security_hardening: '\u{1F512}', cabling_guide: '\u{1F527}', poe_config: '\u26A1',
  high_density: '\u{1F3E2}', iot_sensor: '\u{1F4E1}', sd_wan_setup: '\u2601\uFE0F',
  ruggedized_ap: '\u{1F6E1}\uFE0F', electrical_safety: '\u26A1',
};

const DIFF_COLORS: Record<string, string> = {
  beginner: '#22C55E', intermediate: '#3B82F6', advanced: '#F59E0B',
};

function vendorColor(v: string): string {
  return VENDOR_COLORS[v] || VENDOR_COLORS.Default;
}

function vendorInitials(v: string): string {
  const parts = v.split(/\s+/);
  return parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : v.slice(0, 2).toUpperCase();
}

function catLabel(c: string): string {
  return CATEGORY_LABELS[c] || c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function catIcon(c: string): string {
  return CATEGORY_ICONS[c] || '\u{1F5A5}\uFE0F';
}

// ─── Component ��──────────────────────────��─────────────────────────────────────
export default function VendorGuidesPage() {
  // Grid state
  const [guides, setGuides] = useState<GuideListItem[]>([]);
  const [filteredGuides, setFilteredGuides] = useState<GuideListItem[]>([]);
  const [vendors, setVendors] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVendor, setSelectedVendor] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Detail state
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedGuide, setSelectedGuide] = useState<GuideDetail | null>(null);
  const [guideLoading, setGuideLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');

  // Step-by-step state
  const [stepMode, setStepMode] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepProgress, setStepProgress] = useState<Record<string, boolean>>({});
  const [stepNotes, setStepNotes] = useState('');

  // Troubleshoot accordion
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  // Mobile sidebar toggle
  const [showFilters, setShowFilters] = useState(false);

  // Clipboard feedback
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // ─── Data loading ───────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/network/vendor-guides')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setGuides(d.data || []);
        setFilteredGuides(d.data || []);
        setVendors(d.vendors || []);
        setCategories(d.categories || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // ─── Client-side filtering ──────────────────────────────────────────────────
  useEffect(() => {
    let result = guides;
    if (selectedVendor !== 'all') result = result.filter(g => g.vendor === selectedVendor);
    if (selectedCategory !== 'all') result = result.filter(g => g.category === selectedCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(g =>
        g.vendor.toLowerCase().includes(q) ||
        g.model_family.toLowerCase().includes(q) ||
        g.title.toLowerCase().includes(q) ||
        (g.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    setFilteredGuides(result);
  }, [guides, selectedVendor, selectedCategory, searchQuery]);

  // ─── Load guide detail ──────────���───────────────────────────────────────────
  const loadGuide = useCallback(async (id: string) => {
    setGuideLoading(true);
    setViewMode('detail');
    setActiveTab('overview');
    setStepMode(false);
    setCurrentStep(0);
    setStepNotes('');
    setExpandedItems(new Set());
    const saved = localStorage.getItem(`guide-progress-${id}`);
    setStepProgress(saved ? JSON.parse(saved) : {});
    try {
      const r = await fetch(`/api/network/vendor-guides/${id}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setSelectedGuide(d.data);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setGuideLoading(false);
    }
  }, []);

  // ─── Back to grid ───────���───────────────────────────────────────────────────
  const backToGrid = useCallback(() => {
    setViewMode('grid');
    setSelectedGuide(null);
    setStepMode(false);
  }, []);

  // Escape key listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && viewMode === 'detail') backToGrid(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [viewMode, backToGrid]);

  // ─── Step progress helpers ──────────────────────────────────────────────────
  const toggleStepComplete = useCallback((guideId: string, tabKey: string, stepNum: number) => {
    const key = `${guideId}-${tabKey}-${stepNum}`;
    setStepProgress(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(`guide-progress-${guideId}`, JSON.stringify(next));
      return next;
    });
  }, []);

  // ─── Copy to clipboard ────���────────────────────────────────────────────────
  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(text);
    setTimeout(() => setCopiedCmd(null), 2000);
  }, []);

  // ─── Export guide ────────────���──────────────────────────────────────────────
  const exportGuide = useCallback(() => {
    if (!selectedGuide) return;
    const steps = Array.isArray(selectedGuide.steps) ? selectedGuide.steps : [];
    const html = `<html><head>
    <title>${selectedGuide.vendor} ${selectedGuide.model_family} — Setup Guide</title>
    <style>
      body{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:24px;color:#222}
      h1{color:#0066cc}h2{color:#333;border-bottom:1px solid #eee;padding-bottom:8px}
      .step{margin:16px 0;padding:12px;border-left:3px solid #0066cc;background:#f8f9fa}
      .step-num{font-weight:bold;color:#0066cc}
      .meta{color:#666;font-size:14px}
      @media print{.no-print{display:none}}
    </style></head><body>
    <h1>${selectedGuide.vendor} ${selectedGuide.model_family}</h1>
    <p class="meta">${catLabel(selectedGuide.category)} · ${selectedGuide.difficulty || 'N/A'} · ${selectedGuide.estimated_minutes || '?'} min</p>
    <p>${selectedGuide.content || ''}</p>
    ${steps.length > 0 ? '<h2>Setup Steps</h2>' + steps.map(s => `<div class="step"><span class="step-num">Step ${s.step}:</span> <strong>${s.title}</strong><p>${s.detail}</p></div>`).join('') : ''}
    </body></html>`;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.print();
  }, [selectedGuide]);

  // ─── Count helpers ───────���──────────────────────────────────────────────────
  const vendorCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  for (const g of guides) {
    vendorCounts[g.vendor] = (vendorCounts[g.vendor] || 0) + 1;
    categoryCounts[g.category] = (categoryCounts[g.category] || 0) + 1;
  }

  // ─── Shared styles ──────────────────────────────────────────────────────────
  const glass: React.CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14 };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', background: CARD2, border: `1px solid ${BORDER}`,
    borderRadius: 10, color: TEXT, fontSize: 16, outline: 'none', boxSizing: 'border-box' as const,
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // DETAIL VIEW
  // ═════════════════════════════��═════════════════════════════════════════════════
  if (viewMode === 'detail') {
    const guide = selectedGuide;
    const steps: GuideStep[] = guide && Array.isArray(guide.steps) ? guide.steps : [];
    const stepsCompleted = steps.filter(s => guide && stepProgress[`${guide.id}-steps-${s.step}`]).length;

    // ── Step-by-step mode ──────────────────────────────────────────────────────
    if (stepMode && guide && steps.length > 0) {
      const step = steps[currentStep];
      const pct = steps.length > 0 ? Math.round(((currentStep + 1) / steps.length) * 100) : 0;
      return (
        <div style={{ padding: '24px 28px', maxWidth: 700, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Step {currentStep + 1} of {steps.length}
            </span>
            <button onClick={() => setStepMode(false)} style={{ background: 'none', border: 'none', color: DIM, fontSize: 14, cursor: 'pointer', minHeight: 44, minWidth: 44 }}>
              ✕ Exit
            </button>
          </div>
          {/* Progress bar */}
          <div style={{ height: 6, background: BORDER, borderRadius: 4, marginBottom: 24, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: GOLD, borderRadius: 4, transition: 'width 0.3s' }} />
          </div>
          {step && (
            <div style={{ ...glass, padding: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: stepProgress[`${guide.id}-steps-${step.step}`] ? '#22C55E' : GOLD,
                  color: '#fff', fontWeight: 700, fontSize: 16, flexShrink: 0,
                }}>
                  {stepProgress[`${guide.id}-steps-${step.step}`] ? '✓' : step.step}
                </div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TEXT }}>{step.title}</h3>
              </div>
              <p style={{ margin: '0 0 20px', fontSize: 16, color: TEXT, lineHeight: 1.7 }}>{step.detail}</p>
              {/* Notes */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>Notes</label>
                <textarea
                  value={stepNotes}
                  onChange={e => setStepNotes(e.target.value)}
                  placeholder="Add notes for this step..."
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
              {/* Mark Complete */}
              <button
                onClick={() => toggleStepComplete(guide.id, 'steps', step.step)}
                style={{
                  width: '100%', padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${stepProgress[`${guide.id}-steps-${step.step}`] ? '#22C55E' : BORDER}`,
                  background: stepProgress[`${guide.id}-steps-${step.step}`] ? 'rgba(34,197,94,.12)' : CARD2,
                  color: stepProgress[`${guide.id}-steps-${step.step}`] ? '#22C55E' : DIM,
                  minHeight: 44,
                }}
              >
                {stepProgress[`${guide.id}-steps-${step.step}`] ? '✓ Completed' : '☐ Mark Complete'}
              </button>
            </div>
          )}
          {/* Prev / Next */}
          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <button
              disabled={currentStep === 0}
              onClick={() => { setCurrentStep(c => c - 1); setStepNotes(''); }}
              style={{
                flex: 1, padding: '14px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: currentStep === 0 ? 'not-allowed' : 'pointer',
                background: DARK, border: `1px solid ${BORDER}`, color: currentStep === 0 ? BORDER : DIM, minHeight: 52,
              }}
            >
              ← Previous
            </button>
            {currentStep < steps.length - 1 ? (
              <button
                onClick={() => { setCurrentStep(c => c + 1); setStepNotes(''); }}
                style={{
                  flex: 1, padding: '14px', borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: 'pointer',
                  background: `linear-gradient(135deg,#B8860B,${GOLD})`, border: 'none', color: '#fff', minHeight: 52,
                }}
              >
                Next Step →
              </button>
            ) : (
              <button
                onClick={() => setStepMode(false)}
                style={{
                  flex: 1, padding: '14px', borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: 'pointer',
                  background: 'rgba(34,197,94,.15)', border: '1px solid rgba(34,197,94,.3)', color: '#22C55E', minHeight: 52,
                }}
              >
                ✓ Done
              </button>
            )}
          </div>
          {/* Jump-to-step row */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 16, justifyContent: 'center' }}>
            {steps.map((s, i) => (
              <button
                key={i}
                onClick={() => { setCurrentStep(i); setStepNotes(''); }}
                style={{
                  width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  background: i === currentStep ? GOLD : stepProgress[`${guide.id}-steps-${s.step}`] ? 'rgba(34,197,94,.2)' : CARD2,
                  color: i === currentStep ? '#fff' : stepProgress[`${guide.id}-steps-${s.step}`] ? '#22C55E' : DIM,
                }}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      );
    }

    // ── Detail reading mode ────────────────────────────────────────────────────
    return (
      <div style={{ padding: '24px 28px', maxWidth: 900, margin: '0 auto' }}>
        {/* Back button */}
        <button
          onClick={backToGrid}
          style={{ background: 'none', border: 'none', color: GOLD, fontSize: 14, cursor: 'pointer', padding: '0 0 16px', display: 'flex', alignItems: 'center', gap: 6, minHeight: 44 }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}>
            <line x1={19} y1={12} x2={5} y2={12} /><polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Guides
        </button>

        {guideLoading || !guide ? (
          /* Skeleton */
          <div>
            <div style={{ ...glass, padding: 28, marginBottom: 16 }}>
              <div style={{ height: 18, width: '30%', background: CARD2, borderRadius: 6, marginBottom: 12 }} />
              <div style={{ height: 26, width: '70%', background: CARD2, borderRadius: 6, marginBottom: 12 }} />
              <div style={{ height: 14, width: '50%', background: CARD2, borderRadius: 6 }} />
            </div>
            <div style={{ ...glass, padding: 28 }}>
              {[1, 2, 3].map(i => <div key={i} style={{ height: 14, width: `${90 - i * 10}%`, background: CARD2, borderRadius: 6, marginBottom: 12 }} />)}
            </div>
          </div>
        ) : (
          <>
            {/* Header card with vendor gradient */}
            <div style={{
              ...glass,
              padding: 28,
              marginBottom: 16,
              borderLeft: `4px solid ${vendorColor(guide.vendor)}`,
              background: `linear-gradient(135deg, ${vendorColor(guide.vendor)}22, ${CARD})`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: vendorColor(guide.vendor), color: '#fff', fontWeight: 700, fontSize: 20, flexShrink: 0,
                }}>
                  {vendorInitials(guide.vendor)}
                </div>
                <div>
                  <div style={{ fontSize: 13, color: DIM, fontWeight: 600 }}>{guide.vendor} · {guide.model_family}</div>
                  <h1 style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: TEXT }}>{guide.title}</h1>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: `${vendorColor(guide.vendor)}20`, color: vendorColor(guide.vendor), fontWeight: 700 }}>
                  {catIcon(guide.category)} {catLabel(guide.category)}
                </span>
                {guide.difficulty && (
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: `${DIFF_COLORS[guide.difficulty] || DIM}18`, color: DIFF_COLORS[guide.difficulty] || DIM, fontWeight: 600 }}>
                    {guide.difficulty}
                  </span>
                )}
                {guide.estimated_minutes && (
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: `${DIM}18`, color: DIM, fontWeight: 600 }}>
                    ~{guide.estimated_minutes} min
                  </span>
                )}
              </div>
              {guide.tags && guide.tags.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {guide.tags.map(t => (
                    <span key={t} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, background: DARK, color: DIM, border: `1px solid ${BORDER}` }}>{t}</span>
                  ))}
                </div>
              )}
              <button
                onClick={exportGuide}
                style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', color: DIM, fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}
              >
                ⬇ Export Guide
              </button>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${BORDER}`, marginBottom: 20, overflowX: 'auto', scrollbarWidth: 'none' as any, WebkitOverflowScrolling: 'touch' as any }}>
              {(['overview', ...(steps.length > 0 ? ['steps'] : [])] as DetailTab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '12px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    background: 'none', border: 'none', borderBottom: `2px solid ${activeTab === tab ? GOLD : 'transparent'}`,
                    color: activeTab === tab ? GOLD : DIM, whiteSpace: 'nowrap', minHeight: 44,
                  }}
                >
                  {tab === 'overview' ? 'Overview' : `Steps (${steps.length})`}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {activeTab === 'overview' && (
              <div>
                {/* Content text */}
                <div style={{ ...glass, padding: 24, marginBottom: 16 }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: GOLD }}>Overview</h3>
                  <p style={{ margin: 0, fontSize: 15, color: TEXT, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{guide.content}</p>
                </div>
                {/* Quick stats */}
                <div style={{ ...glass, padding: 20, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 11, color: DIM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Steps</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: GOLD }}>{steps.length}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: DIM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Difficulty</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: DIFF_COLORS[guide.difficulty || ''] || DIM }}>{guide.difficulty || 'N/A'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: DIM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Time</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>{guide.estimated_minutes || '?'} min</div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'steps' && steps.length > 0 && (
              <div>
                {/* Progress bar */}
                <div style={{ ...glass, padding: '14px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontSize: 13, color: DIM, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    Completed: {stepsCompleted} / {steps.length}
                  </span>
                  <div style={{ flex: 1, height: 6, background: BORDER, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: steps.length > 0 ? `${(stepsCompleted / steps.length) * 100}%` : '0%', background: '#22C55E', borderRadius: 4, transition: 'width 0.3s' }} />
                  </div>
                  <button
                    onClick={() => { setStepMode(true); setCurrentStep(0); setStepNotes(''); }}
                    style={{
                      padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      background: `linear-gradient(135deg,#B8860B,${GOLD})`, border: 'none', color: '#fff', whiteSpace: 'nowrap', minHeight: 44,
                    }}
                  >
                    Step-by-Step Mode
                  </button>
                </div>
                {/* All steps list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {steps.map(s => {
                    const key = `${guide.id}-steps-${s.step}`;
                    const done = !!stepProgress[key];
                    return (
                      <div key={s.step} style={{ ...glass, padding: '16px 20px', borderLeft: `3px solid ${done ? '#22C55E' : GOLD}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: done ? '#22C55E' : GOLD, color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0,
                          }}>
                            {done ? '✓' : s.step}
                          </div>
                          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT }}>{s.title}</h4>
                        </div>
                        <p style={{ margin: '0 0 10px 40px', fontSize: 15, color: TEXT, lineHeight: 1.6 }}>{s.detail}</p>
                        <button
                          onClick={() => toggleStepComplete(guide.id, 'steps', s.step)}
                          style={{
                            marginLeft: 40, padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            border: `1px solid ${done ? '#22C55E' : BORDER}`, background: done ? 'rgba(34,197,94,.1)' : 'transparent',
                            color: done ? '#22C55E' : DIM, minHeight: 44,
                          }}
                        >
                          {done ? '✓ Completed' : '☐ Mark Complete'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ══════���════════════════════════════════════════════════════════════════════════
  // GRID VIEW
  // ��══════════════���═══════════════════════════════════════════════════════════════
  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 800, color: TEXT }}>Network Vendor Guides</h1>
            <p style={{ margin: 0, fontSize: 14, color: DIM }}>{guides.length} guides across {vendors.length} vendors</p>
          </div>
          {/* Mobile filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{
              display: 'none', padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700,
              background: CARD, border: `1px solid ${BORDER}`, color: DIM, cursor: 'pointer', minHeight: 44,
            }}
            className="filter-toggle-mobile"
          >
            {showFilters ? '✕ Close' : '☰ Filters'}
          </button>
        </div>
        {error && <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, color: '#EF4444', fontSize: 13 }}>{error}</div>}
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {/* ── Left Sidebar ──────────────────────────────────────────────────────── */}
        <div className="filter-sidebar" style={{ width: 280, flexShrink: 0, position: 'sticky' as const, top: 24 }}>
          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 20 }}>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search guides, models, keywords..."
              style={inputStyle}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 16, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Vendor filter */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Vendor</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <button
                onClick={() => setSelectedVendor('all')}
                style={{
                  textAlign: 'left', padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: 'none', borderLeft: `3px solid ${selectedVendor === 'all' ? GOLD : 'transparent'}`,
                  background: selectedVendor === 'all' ? `${GOLD}15` : 'transparent',
                  color: selectedVendor === 'all' ? GOLD : DIM, minHeight: 44, display: 'flex', alignItems: 'center',
                }}
              >
                All Vendors <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}>({guides.length})</span>
              </button>
              {vendors.map(v => (
                <button
                  key={v}
                  onClick={() => setSelectedVendor(selectedVendor === v ? 'all' : v)}
                  style={{
                    textAlign: 'left', padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    border: 'none', borderLeft: `3px solid ${selectedVendor === v ? GOLD : vendorColor(v)}`,
                    background: selectedVendor === v ? `${GOLD}15` : 'transparent',
                    color: selectedVendor === v ? GOLD : TEXT, minHeight: 44, display: 'flex', alignItems: 'center',
                  }}
                >
                  {v} <span style={{ marginLeft: 'auto', fontSize: 11, color: DIM }}>({vendorCounts[v] || 0})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Category filter */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Category</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <button
                onClick={() => setSelectedCategory('all')}
                style={{
                  textAlign: 'left', padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: 'none', borderLeft: `3px solid ${selectedCategory === 'all' ? GOLD : 'transparent'}`,
                  background: selectedCategory === 'all' ? `${GOLD}15` : 'transparent',
                  color: selectedCategory === 'all' ? GOLD : DIM, minHeight: 44, display: 'flex', alignItems: 'center',
                }}
              >
                All Categories <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}>({guides.length})</span>
              </button>
              {categories.map(c => (
                <button
                  key={c}
                  onClick={() => setSelectedCategory(selectedCategory === c ? 'all' : c)}
                  style={{
                    textAlign: 'left', padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    border: 'none', borderLeft: `3px solid ${selectedCategory === c ? GOLD : 'transparent'}`,
                    background: selectedCategory === c ? `${GOLD}15` : 'transparent',
                    color: selectedCategory === c ? GOLD : TEXT, minHeight: 44, display: 'flex', alignItems: 'center',
                  }}
                >
                  {catIcon(c)} {catLabel(c)} <span style={{ marginLeft: 'auto', fontSize: 11, color: DIM }}>({categoryCounts[c] || 0})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Results summary */}
          <div style={{ padding: '10px 14px', background: CARD2, borderRadius: 10, fontSize: 12, color: DIM, textAlign: 'center' }}>
            Showing {filteredGuides.length} of {guides.length} guides
          </div>
        </div>

        {/* ── Right Content: Card Grid ──────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} style={{ ...glass, padding: 20, minHeight: 180 }}>
                  <div style={{ height: 14, width: '40%', background: CARD2, borderRadius: 6, marginBottom: 12 }} />
                  <div style={{ height: 18, width: '80%', background: CARD2, borderRadius: 6, marginBottom: 10 }} />
                  <div style={{ height: 12, width: '100%', background: CARD2, borderRadius: 6, marginBottom: 6 }} />
                  <div style={{ height: 12, width: '70%', background: CARD2, borderRadius: 6 }} />
                  <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}div[style*="CARD2"]{animation:pulse 1.5s ease-in-out infinite}`}</style>
                </div>
              ))}
            </div>
          ) : filteredGuides.length === 0 ? (
            <div style={{ ...glass, padding: '60px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
              <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: TEXT }}>No guides match your search</p>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: DIM }}>Try a different keyword or clear your filters</p>
              <button
                onClick={() => { setSearchQuery(''); setSelectedVendor('all'); setSelectedCategory('all'); }}
                style={{ padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 700, background: CARD2, border: `1px solid ${BORDER}`, color: GOLD, cursor: 'pointer', minHeight: 44 }}
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {filteredGuides.map(g => (
                <div
                  key={g.id}
                  onClick={() => loadGuide(g.id)}
                  onTouchStart={() => {}}
                  style={{
                    ...glass, padding: 0, cursor: 'pointer', overflow: 'hidden', transition: 'border-color 0.15s',
                    borderLeft: `4px solid ${vendorColor(g.vendor)}`,
                  }}
                >
                  <div style={{ padding: '18px 18px 14px' }}>
                    {/* Category badge */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, background: `${vendorColor(g.vendor)}15`, color: vendorColor(g.vendor), fontWeight: 700 }}>
                        {catIcon(g.category)} {catLabel(g.category)}
                      </span>
                      {g.difficulty && (
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, background: `${DIFF_COLORS[g.difficulty] || DIM}18`, color: DIFF_COLORS[g.difficulty] || DIM, fontWeight: 600 }}>
                          {g.difficulty}
                        </span>
                      )}
                      {g.estimated_minutes && (
                        <span style={{ fontSize: 10, color: DIM }}>{g.estimated_minutes}m</span>
                      )}
                    </div>
                    {/* Vendor + title */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: vendorColor(g.vendor), color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0,
                      }}>
                        {vendorInitials(g.vendor)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: DIM, fontWeight: 600 }}>{g.vendor}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {g.model_family}
                        </div>
                      </div>
                    </div>
                    {/* Title */}
                    <div style={{
                      fontSize: 13, color: DIM, lineHeight: 1.5, marginBottom: 10,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden',
                    }}>
                      {g.title}
                    </div>
                  </div>
                  {/* Footer */}
                  <div style={{ padding: '10px 18px', borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {(g.tags || []).slice(0, 3).map(t => (
                        <span key={t} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: DARK, color: DIM, border: `1px solid ${BORDER}` }}>{t}</span>
                      ))}
                      {(g.tags || []).length > 3 && (
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: DARK, color: DIM }}>+{(g.tags || []).length - 3}</span>
                      )}
                    </div>
                    <span style={{ fontSize: 12, color: GOLD, fontWeight: 700, whiteSpace: 'nowrap' }}>Open →</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Responsive styles ───────────────────────────────────────────────────── */}
      <style>{`
        @media (max-width: 900px) {
          .filter-sidebar { display: none !important; }
          .filter-toggle-mobile { display: flex !important; }
        }
        @media (max-width: 640px) {
          div[style*="gridTemplateColumns"] { grid-template-columns: 1fr !important; }
        }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
      `}</style>
    </div>
  );
}
