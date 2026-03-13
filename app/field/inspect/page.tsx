'use client';
/**
 * Saguaro Field — Inspection
 * Enhanced checklist, per-item photo notes, better result picker. Offline queue.
 * + Punch-item auto-creation from failed inspections
 * + Inspection Template Library with industry-standard checklists
 * + Re-inspection workflow for failed inspections
 */
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';
import SignaturePad from '@/components/SignaturePad';

const GOLD   = '#D4A017';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const BLUE   = '#3B82F6';

const INSPECTION_TYPES = [
  'Foundation', 'Pre-Pour Concrete', 'Framing', 'Rough Electrical', 'Rough Plumbing',
  'HVAC Rough', 'Insulation', 'Drywall', 'Final Electrical', 'Final Plumbing',
  'Final HVAC', 'Fire & Life Safety', 'Structural Steel', 'Building Final',
  'Roofing', 'Waterproofing', 'Site / Grading', 'ADA Compliance', 'Other',
];

const RESULTS = [
  { value: 'passed',           label: 'Passed',           color: GREEN,  bg: 'rgba(34,197,94,.15)',  emoji: '✅' },
  { value: 'conditional_pass', label: 'Conditional',      color: AMBER,  bg: 'rgba(245,158,11,.15)', emoji: '⚠️' },
  { value: 'failed',           label: 'Failed',           color: RED,    bg: 'rgba(239,68,68,.15)',  emoji: '❌' },
  { value: 'pending',          label: 'Pending',          color: DIM,    bg: 'rgba(143,163,192,.1)', emoji: '🕐' },
];

const CHECKLISTS: Record<string, string[]> = {
  'Foundation':        ['Footing dimensions match plans', 'Rebar placement approved by engineer', 'Moisture barrier in place', 'Anchor bolts positioned correctly', 'Soil bearing verified', 'Forms level and secure'],
  'Pre-Pour Concrete': ['Rebar tied and supported', 'Grade stakes set', 'Edges formed', 'Sleeves in place', 'Engineer of record notified', 'Pump accessible'],
  'Framing':           ['Wall dimensions match plans', 'Header sizes correct per schedule', 'Shear panels installed per plan', 'Blocking in place', 'Nail pattern per schedule', 'Stairway compliant', 'Top plates doubled'],
  'Rough Electrical':  ['Wire gauge per load schedule', 'Circuit breaker sizes correct', 'GFCI protection per code', 'Box fill compliant', 'Service entrance secure', 'Conduit runs support spacing'],
  'Rough Plumbing':    ['Pipe sizes match specs', 'Slope 1/4" per foot min', 'Cleanouts accessible', 'Pressure test passed (100 psi for 15 min)', 'Proper venting per code', 'Stub-outs capped'],
  'Insulation':        ['R-value meets energy code', 'Vapor barrier installed correctly', 'No gaps around penetrations', 'Recessed lights are IC-rated', 'Attic baffles in place'],
  'Building Final':    ['All systems operational and tested', 'Certificate of occupancy checklist complete', 'Fire & life safety signed off', 'ADA compliance verified', 'Site clean and accessible', 'Punch list items cleared', 'All permits finaled'],
};

/* ─── Inspection Template Library ─── */
type TemplateCategory = {
  name: string;
  templates: { name: string; inspType: string; items: string[] }[];
};

const TEMPLATE_LIBRARY: TemplateCategory[] = [
  {
    name: 'Structural',
    templates: [
      { name: 'Foundation', inspType: 'Foundation', items: ['Footing dimensions match plans', 'Rebar placement approved by engineer', 'Moisture barrier in place', 'Anchor bolts positioned correctly', 'Soil bearing verified', 'Forms level and secure', 'Dowels placed per plan', 'Keyway formed'] },
      { name: 'Framing', inspType: 'Framing', items: ['Wall dimensions match plans', 'Header sizes correct per schedule', 'Shear panels installed per plan', 'Blocking in place', 'Nail pattern per schedule', 'Stairway compliant', 'Top plates doubled', 'Hold-downs installed'] },
      { name: 'Steel', inspType: 'Structural Steel', items: ['Shop drawings approved', 'Steel grade verified per specs', 'Bolt torque per AISC standards', 'Connections match approved drawings', 'Fireproofing thickness verified', 'Weld inspection complete (CWI)', 'Base plates level and grouted', 'Moment connections per detail'] },
      { name: 'Concrete Pour', inspType: 'Pre-Pour Concrete', items: ['Rebar tied and supported', 'Grade stakes set', 'Edges formed', 'Sleeves in place', 'Engineer of record notified', 'Pump accessible', 'Slump test performed', 'Cylinders taken for break test', 'Vibration plan confirmed'] },
    ],
  },
  {
    name: 'MEP',
    templates: [
      { name: 'Electrical Rough-in', inspType: 'Rough Electrical', items: ['Wire gauge per load schedule', 'Circuit breaker sizes correct', 'GFCI protection per code', 'Box fill compliant', 'Service entrance secure', 'Conduit runs support spacing', 'Panel schedule matches plans', 'Ground fault paths verified'] },
      { name: 'Plumbing Rough-in', inspType: 'Rough Plumbing', items: ['Pipe sizes match specs', 'Slope 1/4" per foot min', 'Cleanouts accessible', 'Pressure test passed (100 psi for 15 min)', 'Proper venting per code', 'Stub-outs capped', 'Water heater clearances met', 'Backflow prevention installed'] },
      { name: 'HVAC Ductwork', inspType: 'HVAC Rough', items: ['Duct sizes match mechanical plans', 'Supports and hangers per code', 'Fire dampers at rated walls', 'Flex duct lengths within limits', 'Return air pathways clear', 'Condensate drain properly routed', 'Refrigerant lines insulated', 'Thermostat locations per plan'] },
      { name: 'Fire Protection', inspType: 'Fire & Life Safety', items: ['Sprinkler head spacing per NFPA 13', 'Pipe hangers and bracing installed', 'Fire department connection accessible', 'Alarm pull stations at exits', 'Fire extinguisher locations marked', 'Smoke detectors per plan', 'Exit signs illuminated', 'Standpipe connections tested'] },
    ],
  },
  {
    name: 'Exterior',
    templates: [
      { name: 'Roofing', inspType: 'Roofing', items: ['Underlayment installed per spec', 'Flashing at all penetrations', 'Drip edge installed', 'Ridge vent continuous', 'Valley treatment per detail', 'Fastener pattern correct', 'Pitch matches plans', 'Kick-out flashing at wall transitions'] },
      { name: 'Waterproofing', inspType: 'Waterproofing', items: ['Membrane applied to specified thickness', 'Laps sealed per manufacturer specs', 'Protection board installed', 'Drainage mat in place', 'Termination bars secure', 'Flood test passed (24-hr)', 'Below-grade coating continuous', 'Weep holes unobstructed'] },
      { name: 'Masonry', inspType: 'Other', items: ['Mortar mix per specs', 'Joint reinforcement at correct courses', 'Weep holes at base course', 'Flashing behind veneer', 'Lintels at openings', 'Control joints per plan', 'Ties to structure verified', 'Coursing level and plumb'] },
      { name: 'Windows/Doors', inspType: 'Other', items: ['Frame dimensions match schedule', 'Flashing/WRB integration correct', 'Sealant bead continuous', 'Hardware operates smoothly', 'Glazing type matches specs', 'Threshold height ADA compliant', 'Weatherstripping intact', 'Rating labels present (fire-rated)'] },
    ],
  },
  {
    name: 'Interior',
    templates: [
      { name: 'Drywall', inspType: 'Drywall', items: ['Board type matches fire/moisture rating', 'Screw spacing per code', 'Joints taped and mudded (3 coats)', 'Corner bead straight and secure', 'No visible nail pops or cracks', 'Cutouts clean at boxes/fixtures', 'Fire-rated assemblies documented'] },
      { name: 'Flooring', inspType: 'Other', items: ['Subfloor flatness within tolerance', 'Moisture test passed', 'Adhesive/mortar per manufacturer specs', 'Grout lines consistent', 'Transitions at doorways installed', 'Underlayment type matches spec', 'Pattern/layout matches approved sample', 'Baseboards and trim complete'] },
      { name: 'Paint', inspType: 'Other', items: ['Surface prep complete (sand/prime)', 'Color matches approved selections', 'Correct sheen per finish schedule', 'Two coats minimum applied', 'Cutting-in clean at edges', 'No runs, drips, or sags', 'Touch-up of damaged areas complete'] },
      { name: 'Ceiling Grid', inspType: 'Other', items: ['Grid layout matches reflected ceiling plan', 'Main runners level and supported', 'Cross-tee spacing correct', 'Tiles seated and undamaged', 'Access panels at valves/dampers', 'Light fixtures centered in grid', 'Return air boots aligned with tiles'] },
    ],
  },
  {
    name: 'Site',
    templates: [
      { name: 'Grading', inspType: 'Site / Grading', items: ['Finish grades match civil plans', 'Positive drainage away from building', 'Erosion control measures in place', 'Compaction test results meet spec', 'Swales and berms per plan', 'Retaining wall drainage verified', 'Topsoil depth per landscape spec'] },
      { name: 'Utilities', inspType: 'Other', items: ['Trench depth per code', 'Bedding material correct', 'Pipe slope verified', 'Thrust blocks at fittings', 'Pressure test passed', 'Backfill compaction per spec', 'Locator tape/wire installed', 'Manholes set to grade'] },
      { name: 'Paving', inspType: 'Other', items: ['Subgrade compacted and approved', 'Base course thickness correct', 'Asphalt/concrete thickness per spec', 'Curb and gutter per detail', 'Striping layout per plan', 'ADA parking and access routes', 'Drainage inlets set to grade', 'Saw-cut joints per layout'] },
      { name: 'Landscaping', inspType: 'Other', items: ['Plant species per landscape plan', 'Root ball size per spec', 'Irrigation heads operational', 'Mulch depth per spec', 'Sod or seed per plan', 'Tree staking and guying', 'Hardscape per approved materials'] },
    ],
  },
  {
    name: 'Closeout',
    templates: [
      { name: 'Final Walk', inspType: 'Building Final', items: ['All systems operational and tested', 'Certificate of occupancy checklist complete', 'Fire & life safety signed off', 'ADA compliance verified', 'Site clean and accessible', 'Punch list items cleared', 'All permits finaled', 'As-built drawings submitted', 'O&M manuals delivered'] },
      { name: 'Commissioning', inspType: 'Other', items: ['Equipment start-up reports complete', 'Air/water balance reports reviewed', 'BAS points verified and trended', 'Sequence of operations tested', 'Training completed for owner staff', 'Warranty letters on file', 'Spare parts delivered', 'Energy performance baseline documented'] },
      { name: 'Life Safety', inspType: 'Fire & Life Safety', items: ['Fire alarm system tested', 'Sprinkler system flow test passed', 'Emergency lighting operational', 'Exit signs illuminated and visible', 'Fire doors close and latch', 'Smoke control system functional', 'Fire extinguishers charged and mounted', 'Evacuation maps posted'] },
      { name: 'ADA Compliance', inspType: 'ADA Compliance', items: ['Accessible route slopes within limits', 'Door hardware operable with one hand', 'Restroom grab bars per ADAAG', 'Signage with raised letters and Braille', 'Knee/toe clearance at sinks and counters', 'Parking spaces and access aisles striped', 'Threshold heights within limits', 'Elevator controls accessible'] },
    ],
  },
];

function getChecklist(type: string) {
  const items = CHECKLISTS[type] || ['Work area safe and accessible', 'Plans on site', 'Correct inspector notified', 'Documentation ready'];
  return items.map((item) => ({ item, checked: false, note: '', deficiency: false }));
}

type CheckItem = { item: string; checked: boolean; note: string; deficiency: boolean; photoPreview?: string };

/* ─── Priority mapping by inspection type for punch items ─── */
function getPriorityForType(inspType: string): string {
  const high = ['Foundation', 'Pre-Pour Concrete', 'Structural Steel', 'Fire & Life Safety', 'ADA Compliance'];
  const medium = ['Framing', 'Rough Electrical', 'Rough Plumbing', 'HVAC Rough', 'Roofing', 'Waterproofing'];
  if (high.includes(inspType)) return 'high';
  if (medium.includes(inspType)) return 'medium';
  return 'low';
}

/* ─── Punch Item Modal ─── */
function PunchItemModal({
  failedItems,
  inspType,
  inspectorNotes,
  projectId,
  online,
  onClose,
}: {
  failedItems: CheckItem[];
  inspType: string;
  inspectorNotes: string;
  projectId: string;
  online: boolean;
  onClose: (createdCount?: number) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);
  const [err, setErr] = useState('');

  const handleCreate = async () => {
    setCreating(true);
    setErr('');
    let count = 0;
    const priority = getPriorityForType(inspType);

    for (const item of failedItems) {
      const body = {
        project_id: projectId,
        title: `[Inspection] ${item.item}`,
        description: item.note || inspectorNotes || `Failed during ${inspType} inspection`,
        location: inspType,
        priority,
        status: 'open',
        source: 'inspection',
      };
      try {
        if (!online) throw new Error('offline');
        const r = await fetch(`/api/projects/${projectId}/punch-list`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const b = await r.json().catch(() => ({}));
          throw new Error(b.error || `HTTP ${r.status}`);
        }
        count++;
      } catch (e) {
        if (String(e).includes('offline') || !online) {
          try {
            await enqueue({ url: `/api/projects/${projectId}/punch-list`, method: 'POST', body: JSON.stringify(body), contentType: 'application/json', isFormData: false });
            count++;
          } catch (q) {
            setErr(String(q));
          }
        } else {
          setErr(String(e));
        }
      }
    }
    setCreatedCount(count);
    setCreated(true);
    setCreating(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.65)', padding: 20 }}>
      <div style={{ background: '#0B1929', border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, maxWidth: 420, width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
        {created ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(34,197,94,.15)', border: `2px solid rgba(34,197,94,.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={30} height={30}><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h3 style={{ margin: '0 0 6px', color: TEXT, fontSize: 18 }}>{createdCount} Punch Item{createdCount !== 1 ? 's' : ''} Created</h3>
            <p style={{ margin: '0 0 16px', color: DIM, fontSize: 13 }}>
              {online ? 'Items added to the punch list.' : 'Queued offline -- will sync when reconnected.'}
            </p>
            {err && <p style={{ color: RED, fontSize: 12, marginBottom: 12 }}>{err}</p>}
            <a
              href={`/projects/${projectId}?tab=punch`}
              style={{ display: 'inline-block', background: GREEN, color: '#000', fontWeight: 700, fontSize: 14, borderRadius: 10, padding: '10px 20px', textDecoration: 'none', marginBottom: 8 }}
            >
              View Punch List
            </a>
            <br />
            <button type="button" onClick={() => onClose(createdCount)} style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 18px', color: DIM, fontSize: 13, cursor: 'pointer', marginTop: 6 }}>
              Close
            </button>
          </div>
        ) : (
          <>
            <h3 style={{ margin: '0 0 4px', color: TEXT, fontSize: 18 }}>Create Punch List Items</h3>
            <p style={{ margin: '0 0 14px', color: DIM, fontSize: 13 }}>
              Create punch list items for {failedItems.length} failed checklist item{failedItems.length !== 1 ? 's' : ''}?
            </p>
            <div style={{ marginBottom: 14 }}>
              {failedItems.map((item, i) => (
                <div key={i} style={{ background: 'rgba(239,68,68,.06)', border: `1px solid rgba(239,68,68,.15)`, borderRadius: 8, padding: '8px 10px', marginBottom: 6, fontSize: 13, color: TEXT }}>
                  <span style={{ color: RED, marginRight: 6, fontWeight: 700 }}>&#x2716;</span>
                  {item.item}
                  {item.note && <div style={{ color: DIM, fontSize: 11, marginTop: 3 }}>Note: {item.note}</div>}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: DIM, marginBottom: 14 }}>
              Priority: <span style={{ color: getPriorityForType(inspType) === 'high' ? RED : getPriorityForType(inspType) === 'medium' ? AMBER : GREEN, fontWeight: 700 }}>{getPriorityForType(inspType).toUpperCase()}</span>
            </div>
            {err && <p style={{ color: RED, fontSize: 12, marginBottom: 8 }}>{err}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => onClose()} disabled={creating} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px', color: DIM, fontSize: 14, cursor: 'pointer' }}>
                Skip
              </button>
              <button type="button" onClick={handleCreate} disabled={creating} style={{ flex: 1, background: creating ? '#1E3A5F' : GOLD, border: 'none', borderRadius: 10, padding: '12px', color: '#000', fontSize: 14, fontWeight: 700, cursor: creating ? 'wait' : 'pointer' }}>
                {creating ? 'Creating...' : 'Create Items'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Template Picker ─── */
function TemplatePicker({ onSelect }: { onSelect: (template: { name: string; inspType: string; items: string[] }) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  if (!expanded) {
    return (
      <div style={{ ...card, background: 'linear-gradient(135deg, #0D1D2E 0%, #112840 100%)', borderColor: `rgba(212,160,23,.25)`, cursor: 'pointer' }} onClick={() => setExpanded(true)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(212,160,23,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}>
              <rect x={3} y={3} width={7} height={7}/><rect x={14} y={3} width={7} height={7}/><rect x={3} y={14} width={7} height={7}/><rect x={14} y={14} width={7} height={7}/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEXT }}>Inspection Template Library</p>
            <p style={{ margin: 0, fontSize: 12, color: DIM }}>Choose a pre-built checklist to get started fast</p>
          </div>
          <svg viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...card, borderColor: `rgba(212,160,23,.25)` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <p style={{ ...sectionLabel, margin: 0, color: GOLD }}>Template Library</p>
        <button type="button" onClick={() => setExpanded(false)} style={{ background: 'transparent', border: 'none', color: DIM, fontSize: 18, cursor: 'pointer', padding: 0, lineHeight: 1 }}>&#x2715;</button>
      </div>
      {/* Category tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {TEMPLATE_LIBRARY.map((cat) => (
          <button
            key={cat.name}
            type="button"
            onClick={() => setActiveCategory(activeCategory === cat.name ? null : cat.name)}
            style={{
              background: activeCategory === cat.name ? 'rgba(212,160,23,.15)' : 'transparent',
              border: `1px solid ${activeCategory === cat.name ? GOLD : BORDER}`,
              borderRadius: 8,
              padding: '6px 12px',
              color: activeCategory === cat.name ? GOLD : DIM,
              fontSize: 12,
              fontWeight: activeCategory === cat.name ? 700 : 400,
              cursor: 'pointer',
            }}
          >
            {cat.name}
          </button>
        ))}
      </div>
      {/* Templates for active category */}
      {activeCategory && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {TEMPLATE_LIBRARY.find((c) => c.name === activeCategory)?.templates.map((tmpl) => (
            <button
              key={tmpl.name}
              type="button"
              onClick={() => { onSelect(tmpl); setExpanded(false); setActiveCategory(null); }}
              style={{
                background: 'rgba(212,160,23,.06)',
                border: `1px solid rgba(212,160,23,.2)`,
                borderRadius: 10,
                padding: '10px 12px',
                textAlign: 'left',
                cursor: 'pointer',
                color: TEXT,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{tmpl.name}</div>
              <div style={{ fontSize: 11, color: DIM }}>{tmpl.items.length} items</div>
            </button>
          ))}
        </div>
      )}
      {!activeCategory && (
        <p style={{ margin: 0, fontSize: 12, color: DIM, textAlign: 'center', padding: '8px 0' }}>Select a category above to browse templates</p>
      )}
    </div>
  );
}

/* ─── Re-inspection Banner ─── */
function ReInspectionBanner({ originalInspType, failedItems }: { originalInspType: string; failedItems: CheckItem[] }) {
  return (
    <div style={{ background: 'rgba(59,130,246,.08)', border: `1px solid rgba(59,130,246,.25)`, borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
          <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
        </svg>
        <span style={{ color: BLUE, fontWeight: 700 }}>Re-inspection</span>
      </div>
      <span style={{ color: DIM }}>
        Linked to previous {originalInspType} inspection. {failedItems.length} failed item{failedItems.length !== 1 ? 's' : ''} carried over for re-verification.
      </span>
    </div>
  );
}

function InspectionForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [projectName, setProjectName] = useState('');
  const [online, setOnline] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [inspType, setInspType] = useState('Foundation');
  const [result, setResult] = useState('pending');
  const [inspector, setInspector] = useState('');
  const [agency, setAgency] = useState('');
  const [notes, setNotes] = useState('');
  const [location, setLocation] = useState('');
  const [checklist, setChecklist] = useState<CheckItem[]>(() => getChecklist('Foundation'));
  const [deficiencyNote, setDeficiencyNote] = useState('');
  const [showSignature, setShowSignature] = useState(false);
  const [signatureData, setSignatureData] = useState('');
  const itemPhotoRef = useRef<HTMLInputElement>(null);
  const [photoTargetIdx, setPhotoTargetIdx] = useState(-1);

  // Punch item modal state
  const [showPunchModal, setShowPunchModal] = useState(false);
  const [pendingFailedItems, setPendingFailedItems] = useState<CheckItem[]>([]);

  // Re-inspection state
  const [isReInspection, setIsReInspection] = useState(false);
  const [originalInspType, setOriginalInspType] = useState('');
  const [reInspFailedItems, setReInspFailedItems] = useState<CheckItem[]>([]);

  // Show re-inspection button state (for the success screen)
  const [showReInspBtn, setShowReInspBtn] = useState(false);
  const [submittedResult, setSubmittedResult] = useState('');
  const [submittedChecklist, setSubmittedChecklist] = useState<CheckItem[]>([]);
  const [submittedInspType, setSubmittedInspType] = useState('');

  const captureItemPhoto = (idx: number) => {
    setPhotoTargetIdx(idx);
    setTimeout(() => itemPhotoRef.current?.click(), 50);
  };

  const handleItemPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || photoTargetIdx < 0) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const preview = String(ev.target?.result || '');
      setChecklist((prev) => prev.map((x, i) => i === photoTargetIdx ? { ...x, photoPreview: preview } : x));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
    setPhotoTargetIdx(-1);
  };

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    if (!projectId) return;
    fetch('/api/projects/list')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { const p = d?.projects?.find((x: { id: string; name: string }) => x.id === projectId); if (p) setProjectName(p.name); })
      .catch(() => {});
  }, [projectId]);

  const changeType = (t: string) => { setInspType(t); setChecklist(getChecklist(t)); };
  const toggle = (i: number) => setChecklist((prev) => prev.map((x, idx) => idx === i ? { ...x, checked: !x.checked } : x));
  const setNote = (i: number, note: string) => setChecklist((prev) => prev.map((x, idx) => idx === i ? { ...x, note } : x));
  const toggleDeficiency = (i: number) => setChecklist((prev) => prev.map((x, idx) => idx === i ? { ...x, deficiency: !x.deficiency } : x));

  const applyTemplate = (template: { name: string; inspType: string; items: string[] }) => {
    setInspType(template.inspType);
    setChecklist(template.items.map((item) => ({ item, checked: false, note: '', deficiency: false })));
  };

  const startReInspection = () => {
    const failed = submittedChecklist.filter((c) => c.deficiency || (!c.checked));
    const failedOnly = failed.length > 0 ? failed : submittedChecklist;
    setIsReInspection(true);
    setOriginalInspType(submittedInspType);
    setReInspFailedItems(failedOnly);
    setInspType(submittedInspType);
    setChecklist(failedOnly.map((item) => ({ item: item.item, checked: false, note: '', deficiency: false })));
    setResult('pending');
    setNotes('');
    setDeficiencyNote('');
    setSignatureData('');
    setShowSignature(false);
    setSaved(false);
    setShowReInspBtn(false);
    setSubmittedResult('');
    setSubmittedChecklist([]);
    setSubmittedInspType('');
  };

  const checked = checklist.filter((c) => c.checked).length;
  const deficiencies = checklist.filter((c) => c.deficiency).length;
  const pct = checklist.length ? Math.round((checked / checklist.length) * 100) : 0;
  const res = RESULTS.find((r) => r.value === result) || RESULTS[RESULTS.length - 1];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) { setError('No project selected. Go back and pick a project first.'); return; }
    setSaving(true);
    setError('');

    const fullNotes = [
      notes.trim(),
      deficiencyNote.trim() ? `Deficiencies: ${deficiencyNote.trim()}` : '',
      isReInspection ? `[Re-inspection of previous ${originalInspType} inspection]` : '',
    ].filter(Boolean).join('\n');

    const payload = {
      project_id: projectId,
      type: inspType,
      result,
      inspector_name: inspector.trim(),
      agency: agency.trim(),
      notes: fullNotes,
      location: location.trim(),
      scheduled_date: new Date().toISOString().split('T')[0],
      checklist: JSON.stringify(checklist),
      checklist_total: checklist.length,
      checklist_passed: checked,
      deficiency_count: deficiencies,
      signature_data: signatureData || null,
      is_reinspection: isReInspection,
    };

    try {
      if (!online) throw new Error('offline');
      const res2 = await fetch('/api/inspections/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res2.ok) { const b = await res2.json().catch(() => ({})); throw new Error(b.error || `HTTP ${res2.status}`); }
      afterSubmitSuccess();
    } catch (err) {
      if (String(err).includes('offline') || !online) {
        try {
          await enqueue({ url: '/api/inspections/create', method: 'POST', body: JSON.stringify(payload), contentType: 'application/json', isFormData: false });
          afterSubmitSuccess();
        } catch (q) { setError(String(q)); }
      } else {
        setError(String(err) || 'Failed to submit.');
      }
    } finally {
      setSaving(false);
    }
  };

  const afterSubmitSuccess = () => {
    // Check for failed/deficient checklist items
    const failedItems = checklist.filter((c) => c.deficiency);
    const isFailed = result === 'failed' || result === 'conditional_pass';

    // Store submission details for re-inspection
    setSubmittedResult(result);
    setSubmittedChecklist([...checklist]);
    setSubmittedInspType(inspType);

    if (failedItems.length > 0 && isFailed) {
      // Show punch item modal before navigating away
      setPendingFailedItems(failedItems);
      setShowPunchModal(true);
      setShowReInspBtn(true);
      setSaved(true);
    } else if (isFailed) {
      // Failed but no specific deficiency items marked -- show re-inspection option
      setShowReInspBtn(true);
      setSaved(true);
    } else {
      setSaved(true);
      setTimeout(() => router.push('/field'), 1800);
    }
  };

  const handlePunchModalClose = () => {
    setShowPunchModal(false);
    // Don't auto-navigate -- let user see the success screen with re-inspection option
  };

  if (saved && !showPunchModal) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '65vh', gap: 14, padding: 32, textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: `rgba(${hexRgb(res.color)}, .15)`, border: `2px solid rgba(${hexRgb(res.color)}, .3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: res.color }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={40} height={40}><polyline points="20 6 9 17 4 12"/></svg></div>
        <h2 style={{ margin: 0, fontSize: 22, color: res.color }}>{res.label}!</h2>
        <p style={{ margin: 0, color: DIM, fontSize: 14 }}>
          {online ? 'Inspection logged to dashboard.' : 'Queued offline — will sync when reconnected.'}
        </p>
        {/* Re-inspection button for failed/conditional inspections */}
        {showReInspBtn && (submittedResult === 'failed' || submittedResult === 'conditional_pass') && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', width: '100%', maxWidth: 320 }}>
            <button
              type="button"
              onClick={startReInspection}
              style={{
                width: '100%',
                background: 'rgba(59,130,246,.12)',
                border: `2px solid ${BLUE}`,
                borderRadius: 12,
                padding: '14px 18px',
                color: BLUE,
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}>
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
              </svg>
              Schedule Re-inspection
            </button>
            <button
              type="button"
              onClick={() => router.push('/field')}
              style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 18px', color: DIM, fontSize: 13, cursor: 'pointer' }}
            >
              Return to Field Hub
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: '18px 16px' }}>
      {/* Punch item creation modal */}
      {showPunchModal && (
        <PunchItemModal
          failedItems={pendingFailedItems}
          inspType={inspType}
          inspectorNotes={deficiencyNote || notes}
          projectId={projectId}
          online={online}
          onClose={handlePunchModalClose}
        />
      )}

      <button onClick={() => router.back()} style={backBtn}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg></button>
      <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: TEXT }}>Inspection{isReInspection ? ' (Re-inspection)' : ''}</h1>
      <p style={{ margin: '0 0 14px', fontSize: 14, color: DIM }}>
        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        {projectName ? ` · ${projectName}` : ''}
      </p>

      {!online && <OfflineBanner />}
      {isReInspection && <ReInspectionBanner originalInspType={originalInspType} failedItems={reInspFailedItems} />}

      <form onSubmit={handleSubmit}>
        {/* Template Picker */}
        {!isReInspection && <TemplatePicker onSelect={applyTemplate} />}

        {/* Type + Inspector */}
        <div style={card}>
          <p style={sectionLabel}>Inspection Details</p>
          <Label>Type</Label>
          <select value={inspType} onChange={(e) => changeType(e.target.value)} style={{ ...inp, marginBottom: 10 }}>
            {INSPECTION_TYPES.map((t) => <option key={t} value={t} style={{ background: '#0D1D2E' }}>{t}</option>)}
          </select>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label>Inspector Name</Label>
              <input value={inspector} onChange={(e) => setInspector(e.target.value)} placeholder="Inspector's name" style={inp} />
            </div>
            <div>
              <Label>Agency / Authority</Label>
              <input value={agency} onChange={(e) => setAgency(e.target.value)} placeholder="e.g. City Building" style={inp} />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <Label>Location / Area</Label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Building A, 2nd Floor" style={inp} />
          </div>
        </div>

        {/* Checklist */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <p style={{ ...sectionLabel, margin: 0 }}>Checklist</p>
            <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
              <span style={{ color: GREEN, fontWeight: 700 }}>{checked}/{checklist.length}</span>
              {deficiencies > 0 && <span style={{ color: RED, fontWeight: 700 }}>&#x26A0; {deficiencies} defect{deficiencies > 1 ? 's' : ''}</span>}
            </div>
          </div>
          {/* Progress bar */}
          <div style={{ height: 5, background: '#1E3A5F', borderRadius: 3, marginBottom: 12 }}>
            <div style={{ height: '100%', background: pct === 100 ? GREEN : pct > 50 ? GOLD : AMBER, borderRadius: 3, width: `${pct}%`, transition: 'width 0.25s' }} />
          </div>
          {checklist.map((item, idx) => (
            <div
              key={idx}
              style={{ marginBottom: 8, background: item.deficiency ? 'rgba(239,68,68,.05)' : item.checked ? 'rgba(34,197,94,.05)' : 'transparent', border: `1px solid ${item.deficiency ? 'rgba(239,68,68,.2)' : item.checked ? 'rgba(34,197,94,.15)' : BORDER}`, borderRadius: 10, padding: '10px 12px' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }} onClick={() => toggle(idx)}>
                <div style={{ width: 24, height: 24, borderRadius: 7, border: `2px solid ${item.checked ? GREEN : BORDER}`, background: item.checked ? GREEN : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1, transition: 'all .12s' }}>
                  {item.checked && <span style={{ color: '#000', fontSize: 14, fontWeight: 900, lineHeight: 1 }}>&#x2713;</span>}
                </div>
                <span style={{ flex: 1, fontSize: 14, color: item.checked ? DIM : TEXT, textDecoration: item.checked ? 'line-through' : 'none', lineHeight: 1.4 }}>
                  {item.item}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); captureItemPhoto(idx); }}
                  style={{ background: item.photoPreview ? 'rgba(59,130,246,.2)' : 'transparent', border: `1px solid ${item.photoPreview ? BLUE : BORDER}`, borderRadius: 6, padding: '2px 7px', fontSize: 11, color: item.photoPreview ? BLUE : DIM, cursor: 'pointer', flexShrink: 0 }}
                  title="Attach photo"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={12} height={12}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx={12} cy={13} r={4}/></svg>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleDeficiency(idx); }}
                  style={{ background: item.deficiency ? 'rgba(239,68,68,.2)' : 'transparent', border: `1px solid ${item.deficiency ? RED : BORDER}`, borderRadius: 6, padding: '2px 7px', fontSize: 11, color: item.deficiency ? RED : DIM, cursor: 'pointer', flexShrink: 0, fontWeight: item.deficiency ? 700 : 400 }}
                  title="Mark as deficiency"
                >
                  &#x26A0;
                </button>
              </div>
              {item.photoPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.photoPreview} alt="Item photo" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6, marginTop: 6, border: `1px solid ${BORDER}` }} />
              )}
              <input
                type="text"
                value={item.note}
                onChange={(e) => setNote(idx, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Add note..."
                style={{ marginTop: 7, width: '100%', background: 'transparent', border: 'none', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 12, padding: '3px 0', outline: 'none' }}
              />
            </div>
          ))}
        </div>

        {/* Result */}
        <div style={card}>
          <p style={sectionLabel}>Result</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {RESULTS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setResult(r.value)}
                style={{ background: result === r.value ? r.bg : 'transparent', border: `2px solid ${result === r.value ? r.color : BORDER}`, borderRadius: 10, padding: '14px 8px', color: result === r.value ? r.color : DIM, fontSize: 14, fontWeight: result === r.value ? 800 : 400, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all .12s' }}
              >
                <span>{r.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div style={card}>
          <p style={sectionLabel}>Notes</p>
          {deficiencies > 0 && (
            <div style={{ marginBottom: 8 }}>
              <Label>Deficiency Description</Label>
              <textarea value={deficiencyNote} onChange={(e) => setDeficiencyNote(e.target.value)} placeholder="Describe deficiencies found — required corrections, timeline..." rows={3} style={inp} />
            </div>
          )}
          <Label>General Notes / Comments</Label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Follow-up actions, reinspection required, approvals granted..." rows={3} style={inp} />
        </div>

        {/* Hidden file input for checklist item photos */}
        <input ref={itemPhotoRef} type="file" accept="image/*" capture="environment" onChange={handleItemPhoto} style={{ display: 'none' }} />

        {/* Inspector Signature */}
        <div style={card}>
          <p style={sectionLabel}>Inspector Signature</p>
          {signatureData ? (
            <div style={{ textAlign: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={signatureData} alt="Signature" style={{ maxWidth: '100%', height: 80, borderRadius: 8, border: `1px solid ${BORDER}` }} />
              <button type="button" onClick={() => { setSignatureData(''); setShowSignature(true); }} style={{ marginTop: 6, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 14px', color: DIM, fontSize: 12, cursor: 'pointer' }}>Re-sign</button>
            </div>
          ) : showSignature ? (
            <SignaturePad onSave={(d) => { setSignatureData(d); setShowSignature(false); }} onCancel={() => setShowSignature(false)} label="Inspector Signature" />
          ) : (
            <button type="button" onClick={() => setShowSignature(true)} style={{ width: '100%', background: 'transparent', border: `2px dashed rgba(212,160,23,.4)`, borderRadius: 10, padding: '14px', color: GOLD, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Tap to Sign
            </button>
          )}
        </div>

        {error && <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '10px 14px', color: RED, fontSize: 14, marginBottom: 12 }}>{error}</div>}

        <button
          type="submit"
          disabled={saving}
          style={{ width: '100%', background: saving ? '#1E3A5F' : res.color, border: 'none', borderRadius: 14, padding: '18px', color: saving ? DIM : (result === 'pending' ? TEXT : '#000'), fontSize: 17, fontWeight: 800, cursor: saving ? 'wait' : 'pointer', letterSpacing: 0.3 }}
        >
          {saving ? 'Submitting...' : `Submit — ${res.label}`}
        </button>
      </form>
    </div>
  );
}

export default function FieldInspectPage() {
  return <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center' }}>Loading...</div>}><InspectionForm /></Suspense>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 5 }}>{children}</label>;
}
function OfflineBanner() {
  return <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 13, color: RED, fontWeight: 600 }}>Offline — will sync when reconnected</div>;
}

const card: React.CSSProperties = { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 14px 6px', marginBottom: 12 };
const sectionLabel: React.CSSProperties = { margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 };
const inp: React.CSSProperties = { width: '100%', background: '#07101C', border: '1px solid #1E3A5F', borderRadius: 10, padding: '11px 14px', color: '#F0F4FF', fontSize: 15, outline: 'none' };
const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#8BAAC8', fontSize: 14, cursor: 'pointer', padding: '0 0 10px', display: 'block' };

function hexRgb(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}
