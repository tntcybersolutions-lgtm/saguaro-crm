'use client';
/**
 * Saguaro Field — Custom Forms
 * Form templates library, drag-reorder form builder, fill/submit forms,
 * submitted forms list with search/filter, and form detail/review view.
 * Full offline queue support via enqueue().
 */
import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

const GOLD   = '#D4A017';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const BLUE   = '#3B82F6';

/* ─── Types ────────────────────────────────────────────────────── */

type FieldType =
  | 'text' | 'textarea' | 'number' | 'date' | 'time'
  | 'checkbox' | 'radio' | 'dropdown' | 'photo' | 'signature'
  | 'gps' | 'section_header' | 'yes_no_na';

interface FieldDef {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  placeholder: string;
  options?: string[]; // for radio / dropdown
}

interface FormTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  fields: FieldDef[];
  is_builtin?: boolean;
  created_at?: string;
}

interface FormSubmission {
  id: string;
  template_id: string;
  template_title: string;
  submitter: string;
  status: 'Draft' | 'Submitted' | 'Reviewed';
  responses: Record<string, any>;
  completion_pct: number;
  created_at: string;
  reviewed_at?: string;
  reviewer?: string;
}

type View =
  | 'templates'
  | 'builder'
  | 'fill'
  | 'submissions'
  | 'detail'
  | 'preview';

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Text', textarea: 'Textarea', number: 'Number', date: 'Date',
  time: 'Time', checkbox: 'Checkbox', radio: 'Radio', dropdown: 'Dropdown',
  photo: 'Photo', signature: 'Signature', gps: 'GPS Location',
  section_header: 'Section Header', yes_no_na: 'Yes / No / NA',
};

const CATEGORIES = ['Safety', 'Quality', 'Equipment', 'Environmental', 'General'];
const STATUS_COLORS: Record<string, string> = { Draft: AMBER, Submitted: BLUE, Reviewed: GREEN };

/* ─── Built-in templates ──────────────────────────────────────── */

function uid(): string { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }

function makeField(type: FieldType, label: string, required = false, placeholder = '', options?: string[]): FieldDef {
  return { id: uid(), type, label, required, placeholder, options };
}

const BUILTIN_TEMPLATES: FormTemplate[] = [
  {
    id: 'bt-daily-safety', title: 'Daily Safety Checklist', description: 'Start-of-day safety walkthrough checklist for site supervisors.',
    category: 'Safety', is_builtin: true,
    fields: [
      makeField('date', 'Inspection Date', true),
      makeField('text', 'Inspector Name', true, 'Full name'),
      makeField('text', 'Site Location', true, 'Building / area'),
      makeField('section_header', 'General Site Conditions'),
      makeField('yes_no_na', 'Housekeeping acceptable?', true),
      makeField('yes_no_na', 'Walking surfaces clear of debris?', true),
      makeField('yes_no_na', 'Adequate lighting in work areas?', true),
      makeField('yes_no_na', 'Emergency exits clear and marked?', true),
      makeField('section_header', 'Personal Protective Equipment'),
      makeField('yes_no_na', 'Hard hats worn by all workers?', true),
      makeField('yes_no_na', 'High-visibility vests worn?', true),
      makeField('yes_no_na', 'Safety glasses / goggles available?', true),
      makeField('yes_no_na', 'Hearing protection in noisy areas?', true),
      makeField('section_header', 'Fall Protection'),
      makeField('yes_no_na', 'Guardrails intact on open edges?', true),
      makeField('yes_no_na', 'Harnesses inspected and worn?', true),
      makeField('yes_no_na', 'Ladder safety protocols followed?', true),
      makeField('textarea', 'Corrective Actions Needed', false, 'Describe issues found'),
      makeField('photo', 'Site Photo', false),
      makeField('signature', 'Inspector Signature', true),
    ],
  },
  {
    id: 'bt-toolbox-talk', title: 'Toolbox Talk Sign-in', description: 'Daily toolbox talk attendance and topic record.',
    category: 'Safety', is_builtin: true,
    fields: [
      makeField('date', 'Date', true),
      makeField('time', 'Start Time', true),
      makeField('text', 'Presenter', true, 'Name'),
      makeField('text', 'Topic', true, 'Talk topic'),
      makeField('textarea', 'Key Points Discussed', true, 'Summary of discussion'),
      makeField('text', 'Attendee 1', false, 'Full name'),
      makeField('text', 'Attendee 2', false, 'Full name'),
      makeField('text', 'Attendee 3', false, 'Full name'),
      makeField('text', 'Attendee 4', false, 'Full name'),
      makeField('text', 'Attendee 5', false, 'Full name'),
      makeField('text', 'Attendee 6', false, 'Full name'),
      makeField('text', 'Attendee 7', false, 'Full name'),
      makeField('text', 'Attendee 8', false, 'Full name'),
      makeField('textarea', 'Additional Notes', false, 'Any follow-up items'),
      makeField('photo', 'Group Photo', false),
      makeField('signature', 'Presenter Signature', true),
    ],
  },
  {
    id: 'bt-equipment-inspect', title: 'Equipment Inspection', description: 'Pre-use equipment inspection log for heavy machinery and power tools.',
    category: 'Equipment', is_builtin: true,
    fields: [
      makeField('date', 'Inspection Date', true),
      makeField('text', 'Inspector', true, 'Full name'),
      makeField('text', 'Equipment ID / Name', true, 'e.g. CAT 320 #4102'),
      makeField('dropdown', 'Equipment Type', true, '', ['Excavator', 'Loader', 'Crane', 'Forklift', 'Boom Lift', 'Scissor Lift', 'Compressor', 'Generator', 'Power Tool', 'Other']),
      makeField('number', 'Hour Meter Reading', false, '0'),
      makeField('section_header', 'Visual Inspection'),
      makeField('yes_no_na', 'No visible leaks?', true),
      makeField('yes_no_na', 'Tires / tracks in good condition?', true),
      makeField('yes_no_na', 'Lights and signals working?', true),
      makeField('yes_no_na', 'Windshield / mirrors clean and intact?', true),
      makeField('yes_no_na', 'Backup alarm functional?', true),
      makeField('section_header', 'Operational Check'),
      makeField('yes_no_na', 'Engine starts normally?', true),
      makeField('yes_no_na', 'Brakes operational?', true),
      makeField('yes_no_na', 'Steering responsive?', true),
      makeField('yes_no_na', 'Hydraulics functioning?', true),
      makeField('yes_no_na', 'Fire extinguisher present and charged?', true),
      makeField('textarea', 'Deficiencies Found', false, 'Describe any issues'),
      makeField('radio', 'Overall Status', true, '', ['Pass', 'Fail — Do Not Use', 'Conditional — Repair Needed']),
      makeField('photo', 'Equipment Photo', false),
      makeField('signature', 'Inspector Signature', true),
    ],
  },
  {
    id: 'bt-hot-work', title: 'Hot Work Permit', description: 'Permit for welding, cutting, brazing, or other hot work activities.',
    category: 'Safety', is_builtin: true,
    fields: [
      makeField('date', 'Date', true),
      makeField('time', 'Start Time', true),
      makeField('time', 'End Time', true),
      makeField('text', 'Permit Issuer', true, 'Name'),
      makeField('text', 'Hot Work Operator', true, 'Name'),
      makeField('text', 'Fire Watch', true, 'Name'),
      makeField('text', 'Location / Area', true, 'Specific location'),
      makeField('dropdown', 'Type of Hot Work', true, '', ['Welding', 'Cutting', 'Brazing', 'Soldering', 'Grinding', 'Other']),
      makeField('section_header', 'Pre-Work Checklist'),
      makeField('yes_no_na', 'Combustibles removed or protected within 35 ft?', true),
      makeField('yes_no_na', 'Fire extinguisher within 10 ft?', true),
      makeField('yes_no_na', 'Floors swept clean?', true),
      makeField('yes_no_na', 'Sprinklers in service?', true),
      makeField('yes_no_na', 'Adequate ventilation?', true),
      makeField('yes_no_na', 'Openings in walls/floors covered?', true),
      makeField('yes_no_na', 'Fire watch trained and briefed?', true),
      makeField('textarea', 'Special Precautions', false, 'Additional safety measures'),
      makeField('signature', 'Permit Issuer Signature', true),
      makeField('signature', 'Operator Signature', true),
    ],
  },
  {
    id: 'bt-confined-space', title: 'Confined Space Entry', description: 'Entry permit for confined space work with atmospheric monitoring.',
    category: 'Safety', is_builtin: true,
    fields: [
      makeField('date', 'Date', true),
      makeField('time', 'Entry Time', true),
      makeField('text', 'Entry Supervisor', true, 'Name'),
      makeField('text', 'Entrant(s)', true, 'Names'),
      makeField('text', 'Attendant', true, 'Name'),
      makeField('text', 'Space Location / ID', true),
      makeField('textarea', 'Purpose of Entry', true, 'Work to be performed'),
      makeField('section_header', 'Atmospheric Monitoring'),
      makeField('number', 'O2 Level (%)', true, '20.9'),
      makeField('number', 'LEL (%)', true, '0'),
      makeField('number', 'CO (ppm)', true, '0'),
      makeField('number', 'H2S (ppm)', true, '0'),
      makeField('section_header', 'Pre-Entry Checklist'),
      makeField('yes_no_na', 'Space isolated (LOTO)?', true),
      makeField('yes_no_na', 'Ventilation in place?', true),
      makeField('yes_no_na', 'Rescue equipment staged?', true),
      makeField('yes_no_na', 'Communication system tested?', true),
      makeField('yes_no_na', 'Entrants trained?', true),
      makeField('signature', 'Entry Supervisor Signature', true),
    ],
  },
  {
    id: 'bt-concrete-pour', title: 'Concrete Pour Log', description: 'Log concrete placement details including mix, slump, temps, and volumes.',
    category: 'Quality', is_builtin: true,
    fields: [
      makeField('date', 'Pour Date', true),
      makeField('time', 'Start Time', true),
      makeField('time', 'End Time', false),
      makeField('text', 'Location / Element', true, 'e.g. Foundation Wall Grid A-C'),
      makeField('text', 'Concrete Supplier', true),
      makeField('text', 'Mix Design #', true),
      makeField('number', 'Target PSI', true, '4000'),
      makeField('number', 'Slump (inches)', true, '4'),
      makeField('number', 'Air Content (%)', false, '6'),
      makeField('number', 'Concrete Temp (\u00b0F)', false, '70'),
      makeField('number', 'Ambient Temp (\u00b0F)', false),
      makeField('number', 'Total CY Placed', true, '0'),
      makeField('number', 'Truck Count', false, '0'),
      makeField('text', 'Finisher / Foreman', true),
      makeField('textarea', 'Notes / Issues', false, 'Cold joints, delays, etc.'),
      makeField('photo', 'Pour Photo', false),
      makeField('signature', 'Supervisor Signature', true),
    ],
  },
  {
    id: 'bt-moisture-test', title: 'Moisture Test Log', description: 'Record moisture readings for flooring, concrete slabs, or drywall.',
    category: 'Quality', is_builtin: true,
    fields: [
      makeField('date', 'Test Date', true),
      makeField('text', 'Tester Name', true),
      makeField('text', 'Location / Room', true),
      makeField('dropdown', 'Substrate', true, '', ['Concrete Slab', 'Drywall', 'Plywood', 'OSB', 'CMU', 'Other']),
      makeField('dropdown', 'Test Method', true, '', ['Pin Meter', 'Pinless Meter', 'Calcium Chloride', 'RH Probe', 'Other']),
      makeField('number', 'Reading 1', true),
      makeField('number', 'Reading 2', false),
      makeField('number', 'Reading 3', false),
      makeField('number', 'Average Reading', false),
      makeField('text', 'Acceptable Threshold', false, 'e.g. < 3 lbs / < 75% RH'),
      makeField('radio', 'Result', true, '', ['Pass', 'Fail', 'Borderline — Retest']),
      makeField('textarea', 'Notes', false),
      makeField('photo', 'Meter Photo', false),
      makeField('signature', 'Tester Signature', true),
    ],
  },
  {
    id: 'bt-elevator-inspect', title: 'Elevator Inspection', description: 'Periodic elevator/lift inspection checklist.',
    category: 'Equipment', is_builtin: true,
    fields: [
      makeField('date', 'Inspection Date', true),
      makeField('text', 'Inspector', true),
      makeField('text', 'Elevator ID / Location', true),
      makeField('dropdown', 'Elevator Type', true, '', ['Passenger', 'Freight', 'Construction Hoist', 'Dumbwaiter']),
      makeField('section_header', 'Cab & Doors'),
      makeField('yes_no_na', 'Door opens/closes properly?', true),
      makeField('yes_no_na', 'Interlocks functional?', true),
      makeField('yes_no_na', 'Cab lighting working?', true),
      makeField('yes_no_na', 'Emergency phone/alarm operational?', true),
      makeField('yes_no_na', 'Floor leveling accurate?', true),
      makeField('section_header', 'Mechanical'),
      makeField('yes_no_na', 'No unusual noises?', true),
      makeField('yes_no_na', 'Cables/ropes in good condition?', true),
      makeField('yes_no_na', 'Pit clean and dry?', true),
      makeField('textarea', 'Deficiencies', false),
      makeField('radio', 'Overall Status', true, '', ['Pass', 'Fail', 'Conditional']),
      makeField('signature', 'Inspector Signature', true),
    ],
  },
  {
    id: 'bt-fire-extinguisher', title: 'Fire Extinguisher Check', description: 'Monthly fire extinguisher inspection log.',
    category: 'Safety', is_builtin: true,
    fields: [
      makeField('date', 'Inspection Date', true),
      makeField('text', 'Inspector', true),
      makeField('text', 'Extinguisher Location', true),
      makeField('text', 'Extinguisher ID / Serial', true),
      makeField('dropdown', 'Type', true, '', ['ABC Dry Chemical', 'CO2', 'Water', 'Wet Chemical', 'Clean Agent']),
      makeField('yes_no_na', 'Accessible and visible?', true),
      makeField('yes_no_na', 'Pressure gauge in green zone?', true),
      makeField('yes_no_na', 'Pin and tamper seal intact?', true),
      makeField('yes_no_na', 'No visible damage or corrosion?', true),
      makeField('yes_no_na', 'Hose and nozzle in good condition?', true),
      makeField('yes_no_na', 'Inspection tag current?', true),
      makeField('radio', 'Status', true, '', ['Pass', 'Replace', 'Recharge', 'Relocate']),
      makeField('textarea', 'Notes', false),
      makeField('signature', 'Inspector Signature', true),
    ],
  },
  {
    id: 'bt-fall-protection', title: 'Fall Protection Plan', description: 'Fall protection plan and daily verification for elevated work.',
    category: 'Safety', is_builtin: true,
    fields: [
      makeField('date', 'Date', true),
      makeField('text', 'Competent Person', true),
      makeField('text', 'Work Area / Elevation', true),
      makeField('number', 'Height Above Lower Level (ft)', true),
      makeField('dropdown', 'Primary Fall Protection', true, '', ['Guardrails', 'Personal Fall Arrest', 'Safety Nets', 'Positioning Device', 'Controlled Access Zone', 'Warning Line']),
      makeField('section_header', 'Equipment Check'),
      makeField('yes_no_na', 'Harnesses inspected (no cuts, fraying)?', true),
      makeField('yes_no_na', 'Lanyards / SRLs in good condition?', true),
      makeField('yes_no_na', 'Anchor points rated for 5,000 lbs?', true),
      makeField('yes_no_na', 'Connectors locked and undamaged?', true),
      makeField('section_header', 'Work Area'),
      makeField('yes_no_na', 'Floor openings covered or guarded?', true),
      makeField('yes_no_na', 'Leading edges protected?', true),
      makeField('yes_no_na', 'Rescue plan in place?', true),
      makeField('yes_no_na', 'Workers trained on fall protection?', true),
      makeField('textarea', 'Additional Controls', false),
      makeField('photo', 'Work Area Photo', false),
      makeField('signature', 'Competent Person Signature', true),
    ],
  },
];

/* ─── Helpers ─────────────────────────────────────────────────── */

function formatDate(d: string | undefined): string {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function draftKey(projectId: string, templateId: string): string {
  return `saguaro-form-draft-${projectId}-${templateId}`;
}

/* ─── Main Component ──────────────────────────────────────────── */

function FormsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [view, setView] = useState<View>('templates');
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [actionMsg, setActionMsg] = useState('');
  const [saving, setSaving] = useState(false);

  // Template library state
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateCategory, setTemplateCategory] = useState('All');

  // Builder state
  const [builderFields, setBuilderFields] = useState<FieldDef[]>([]);
  const [builderTitle, setBuilderTitle] = useState('');
  const [builderDesc, setBuilderDesc] = useState('');
  const [builderCategory, setBuilderCategory] = useState('General');
  const [editingTemplate, setEditingTemplate] = useState<FormTemplate | null>(null);
  const [addFieldType, setAddFieldType] = useState<FieldType>('text');
  const [addFieldLabel, setAddFieldLabel] = useState('');
  const [addFieldRequired, setAddFieldRequired] = useState(false);
  const [addFieldPlaceholder, setAddFieldPlaceholder] = useState('');
  const [addFieldOptions, setAddFieldOptions] = useState('');

  // Fill form state
  const [fillTemplate, setFillTemplate] = useState<FormTemplate | null>(null);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [submitter, setSubmitter] = useState('');

  // Submissions filter state
  const [subSearch, setSubSearch] = useState('');
  const [subTemplateFilter, setSubTemplateFilter] = useState('All');
  const [subStatusFilter, setSubStatusFilter] = useState('All');
  const [subDateFilter, setSubDateFilter] = useState('');

  // Detail state
  const [detailSub, setDetailSub] = useState<FormSubmission | null>(null);
  const [detailTemplate, setDetailTemplate] = useState<FormTemplate | null>(null);

  // Signature refs
  const sigCanvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const sigDrawingRef = useRef<Record<string, boolean>>({});
  const sigLastPosRef = useRef<Record<string, { x: number; y: number }>>({});

  /* ── Online detection ──────────────────────────────────────── */
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  /* ── Flash message ─────────────────────────────────────────── */
  useEffect(() => {
    if (!actionMsg) return;
    const t = setTimeout(() => setActionMsg(''), 3500);
    return () => clearTimeout(t);
  }, [actionMsg]);

  /* ── Fetch templates + submissions ─────────────────────────── */
  const fetchData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [tRes, sRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/forms/templates`),
        fetch(`/api/projects/${projectId}/forms/submissions`),
      ]);
      const customTemplates: FormTemplate[] = tRes.ok ? await tRes.json() : [];
      const merged = [...BUILTIN_TEMPLATES, ...customTemplates.filter((ct: FormTemplate) => !BUILTIN_TEMPLATES.some(bt => bt.id === ct.id))];
      setTemplates(merged);
      const subs: FormSubmission[] = sRes.ok ? await sRes.json() : [];
      setSubmissions(subs);
    } catch {
      setTemplates([...BUILTIN_TEMPLATES]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Signature canvas logic ────────────────────────────────── */
  const initSignatureCanvas = useCallback((fieldId: string, canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    sigCanvasRefs.current[fieldId] = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = TEXT;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // If we already have a saved signature dataURL, restore it
    if (responses[fieldId] && typeof responses[fieldId] === 'string' && responses[fieldId].startsWith('data:')) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0); };
      img.src = responses[fieldId];
    }

    const getPos = (e: MouseEvent | TouchEvent): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      if ('touches' in e) {
        return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
      }
      return { x: (e as MouseEvent).clientX - rect.left, y: (e as MouseEvent).clientY - rect.top };
    };

    const start = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      sigDrawingRef.current[fieldId] = true;
      sigLastPosRef.current[fieldId] = getPos(e);
    };
    const move = (e: MouseEvent | TouchEvent) => {
      if (!sigDrawingRef.current[fieldId]) return;
      e.preventDefault();
      const pos = getPos(e);
      const last = sigLastPosRef.current[fieldId];
      if (!last) return;
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      sigLastPosRef.current[fieldId] = pos;
    };
    const end = () => {
      if (sigDrawingRef.current[fieldId]) {
        sigDrawingRef.current[fieldId] = false;
        // Save dataURL into responses
        const dataURL = canvas.toDataURL('image/png');
        setResponses(prev => ({ ...prev, [fieldId]: dataURL }));
      }
    };

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', end);
    canvas.addEventListener('mouseleave', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);
  }, [responses]);

  const clearSignature = useCallback((fieldId: string) => {
    const canvas = sigCanvasRefs.current[fieldId];
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setResponses(prev => { const n = { ...prev }; delete n[fieldId]; return n; });
  }, []);

  /* ── GPS capture ───────────────────────────────────────────── */
  const captureGPS = useCallback((fieldId: string) => {
    if (!navigator.geolocation) {
      setResponses(prev => ({ ...prev, [fieldId]: { error: 'Geolocation not supported' } }));
      return;
    }
    setResponses(prev => ({ ...prev, [fieldId]: { loading: true } }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setResponses(prev => ({
          ...prev,
          [fieldId]: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy },
        }));
      },
      (err) => {
        setResponses(prev => ({ ...prev, [fieldId]: { error: err.message } }));
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }, []);

  /* ── Draft save / restore ──────────────────────────────────── */
  const saveDraft = useCallback(() => {
    if (!fillTemplate) return;
    const key = draftKey(projectId, fillTemplate.id);
    try {
      localStorage.setItem(key, JSON.stringify({ responses, submitter, savedAt: Date.now() }));
      setActionMsg('Draft saved');
    } catch { /* storage full */ }
  }, [fillTemplate, projectId, responses, submitter]);

  const restoreDraft = useCallback((tmpl: FormTemplate) => {
    const key = draftKey(projectId, tmpl.id);
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        setResponses(parsed.responses || {});
        setSubmitter(parsed.submitter || '');
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }, [projectId]);

  const clearDraft = useCallback((tmplId: string) => {
    try { localStorage.removeItem(draftKey(projectId, tmplId)); } catch { /* ignore */ }
  }, [projectId]);

  /* ── Auto-save draft every 30 s ────────────────────────────── */
  useEffect(() => {
    if (view !== 'fill' || !fillTemplate) return;
    const interval = setInterval(saveDraft, 30000);
    return () => clearInterval(interval);
  }, [view, fillTemplate, saveDraft]);

  /* ── Computed: fill form progress ──────────────────────────── */
  const computeProgress = useCallback((): { completed: number; total: number } => {
    if (!fillTemplate) return { completed: 0, total: 0 };
    const fillable = fillTemplate.fields.filter(f => f.type !== 'section_header');
    const completed = fillable.filter(f => {
      const v = responses[f.id];
      if (v === undefined || v === null || v === '') return false;
      if (typeof v === 'object' && v.loading) return false;
      if (typeof v === 'object' && v.error) return false;
      return true;
    }).length;
    return { completed, total: fillable.length };
  }, [fillTemplate, responses]);

  /* ── Submit form ───────────────────────────────────────────── */
  const submitForm = useCallback(async () => {
    if (!fillTemplate || !projectId) return;
    setSaving(true);
    const { completed, total } = computeProgress();
    const payload = {
      template_id: fillTemplate.id,
      template_title: fillTemplate.title,
      submitter,
      status: 'Submitted',
      responses,
      completion_pct: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
    try {
      if (online) {
        const res = await fetch(`/api/projects/${projectId}/forms/submissions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Submit failed');
        const sub = await res.json();
        setSubmissions(prev => [sub, ...prev]);
      } else {
        await enqueue({
          url: `/api/projects/${projectId}/forms/submissions`,
          method: 'POST',
          body: JSON.stringify(payload),
          contentType: 'application/json',
          isFormData: false,
        });
      }
      clearDraft(fillTemplate.id);
      setActionMsg(online ? 'Form submitted' : 'Form queued for submission when online');
      setView('submissions');
      setFillTemplate(null);
      setResponses({});
      setSubmitter('');
      fetchData();
    } catch {
      setActionMsg('Failed to submit form');
    } finally {
      setSaving(false);
    }
  }, [fillTemplate, projectId, submitter, responses, online, computeProgress, clearDraft, fetchData]);

  /* ── Save template (builder) ───────────────────────────────── */
  const saveTemplate = useCallback(async () => {
    if (!projectId || !builderTitle.trim()) return;
    setSaving(true);
    const payload: Partial<FormTemplate> = {
      id: editingTemplate?.id || uid(),
      title: builderTitle.trim(),
      description: builderDesc.trim(),
      category: builderCategory,
      fields: builderFields,
    };
    try {
      if (online) {
        const res = await fetch(`/api/projects/${projectId}/forms/templates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Save failed');
      } else {
        await enqueue({
          url: `/api/projects/${projectId}/forms/templates`,
          method: 'POST',
          body: JSON.stringify(payload),
          contentType: 'application/json',
          isFormData: false,
        });
      }
      setActionMsg(online ? 'Template saved' : 'Template queued for save');
      setView('templates');
      resetBuilder();
      fetchData();
    } catch {
      setActionMsg('Failed to save template');
    } finally {
      setSaving(false);
    }
  }, [projectId, builderTitle, builderDesc, builderCategory, builderFields, editingTemplate, online, fetchData]);

  /* ── Review / approve submission ───────────────────────────── */
  const reviewSubmission = useCallback(async (sub: FormSubmission) => {
    if (!projectId) return;
    setSaving(true);
    const payload = { status: 'Reviewed', reviewed_at: new Date().toISOString(), reviewer: 'Current User' };
    try {
      if (online) {
        const res = await fetch(`/api/projects/${projectId}/forms/submissions/${sub.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Review failed');
      } else {
        await enqueue({
          url: `/api/projects/${projectId}/forms/submissions/${sub.id}`,
          method: 'PATCH',
          body: JSON.stringify(payload),
          contentType: 'application/json',
          isFormData: false,
        });
      }
      setActionMsg('Form reviewed');
      setDetailSub({ ...sub, ...payload } as FormSubmission);
      fetchData();
    } catch {
      setActionMsg('Failed to review form');
    } finally {
      setSaving(false);
    }
  }, [projectId, online, fetchData]);

  /* ── Export PDF ─────────────────────────────────────────────── */
  const exportPDF = useCallback(async (sub: FormSubmission) => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/forms/submissions/${sub.id}?export=pdf`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sub.template_title.replace(/\s+/g, '_')}_${sub.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setActionMsg('PDF exported');
    } catch {
      setActionMsg('Failed to export PDF');
    }
  }, [projectId]);

  /* ── Builder helpers ───────────────────────────────────────── */
  const resetBuilder = useCallback(() => {
    setBuilderFields([]);
    setBuilderTitle('');
    setBuilderDesc('');
    setBuilderCategory('General');
    setEditingTemplate(null);
    setAddFieldLabel('');
    setAddFieldRequired(false);
    setAddFieldPlaceholder('');
    setAddFieldOptions('');
    setAddFieldType('text');
  }, []);

  const addField = useCallback(() => {
    if (!addFieldLabel.trim()) return;
    const f: FieldDef = {
      id: uid(),
      type: addFieldType,
      label: addFieldLabel.trim(),
      required: addFieldRequired,
      placeholder: addFieldPlaceholder.trim(),
    };
    if ((addFieldType === 'radio' || addFieldType === 'dropdown') && addFieldOptions.trim()) {
      f.options = addFieldOptions.split(',').map(s => s.trim()).filter(Boolean);
    }
    setBuilderFields(prev => [...prev, f]);
    setAddFieldLabel('');
    setAddFieldRequired(false);
    setAddFieldPlaceholder('');
    setAddFieldOptions('');
  }, [addFieldType, addFieldLabel, addFieldRequired, addFieldPlaceholder, addFieldOptions]);

  const moveField = useCallback((idx: number, dir: -1 | 1) => {
    setBuilderFields(prev => {
      const arr = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return arr;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr;
    });
  }, []);

  const removeField = useCallback((idx: number) => {
    setBuilderFields(prev => prev.filter((_, i) => i !== idx));
  }, []);

  /* ── Open fill form ────────────────────────────────────────── */
  const openFillForm = useCallback((tmpl: FormTemplate) => {
    setFillTemplate(tmpl);
    setResponses({});
    setSubmitter('');
    restoreDraft(tmpl);
    setView('fill');
  }, [restoreDraft]);

  /* ── Open builder for editing ──────────────────────────────── */
  const openBuilder = useCallback((tmpl?: FormTemplate) => {
    if (tmpl) {
      setEditingTemplate(tmpl);
      setBuilderTitle(tmpl.title);
      setBuilderDesc(tmpl.description);
      setBuilderCategory(tmpl.category);
      setBuilderFields([...tmpl.fields]);
    } else {
      resetBuilder();
    }
    setView('builder');
  }, [resetBuilder]);

  /* ── Open detail view ──────────────────────────────────────── */
  const openDetail = useCallback((sub: FormSubmission) => {
    setDetailSub(sub);
    const tmpl = templates.find(t => t.id === sub.template_id) || null;
    setDetailTemplate(tmpl);
    setView('detail');
  }, [templates]);

  /* ── Filtered templates ────────────────────────────────────── */
  const filteredTemplates = templates.filter(t => {
    if (templateCategory !== 'All' && t.category !== templateCategory) return false;
    if (templateSearch && !t.title.toLowerCase().includes(templateSearch.toLowerCase()) && !t.description.toLowerCase().includes(templateSearch.toLowerCase())) return false;
    return true;
  });

  /* ── Filtered submissions ──────────────────────────────────── */
  const filteredSubmissions = submissions.filter(s => {
    if (subTemplateFilter !== 'All' && s.template_title !== subTemplateFilter) return false;
    if (subStatusFilter !== 'All' && s.status !== subStatusFilter) return false;
    if (subDateFilter && !s.created_at.startsWith(subDateFilter)) return false;
    if (subSearch) {
      const q = subSearch.toLowerCase();
      if (!s.template_title.toLowerCase().includes(q) && !s.submitter.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  /* ─── Shared styles ────────────────────────────────────────── */
  const cardStyle: React.CSSProperties = {
    background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 18, marginBottom: 12,
  };
  const btnPrimary: React.CSSProperties = {
    background: GOLD, color: '#000', border: 'none', borderRadius: 10, padding: '12px 24px',
    fontWeight: 700, fontSize: 15, cursor: 'pointer',
  };
  const btnSecondary: React.CSSProperties = {
    background: 'transparent', color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 10,
    padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer',
  };
  const btnDanger: React.CSSProperties = {
    background: RED, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px',
    fontWeight: 600, fontSize: 14, cursor: 'pointer',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', background: '#0A1929', border: `1px solid ${BORDER}`,
    borderRadius: 10, color: TEXT, fontSize: 15, outline: 'none', boxSizing: 'border-box',
  };
  const selectStyle: React.CSSProperties = { ...inputStyle, appearance: 'none' as const };
  const labelStyle: React.CSSProperties = { color: DIM, fontSize: 13, marginBottom: 4, display: 'block', fontWeight: 600 };

  /* ─── Render field for fill form ───────────────────────────── */
  const renderFillField = (field: FieldDef) => {
    const val = responses[field.id];
    const setVal = (v: any) => setResponses(prev => ({ ...prev, [field.id]: v }));

    if (field.type === 'section_header') {
      return (
        <div key={field.id} style={{ marginTop: 24, marginBottom: 8, borderBottom: `1px solid ${BORDER}`, paddingBottom: 8 }}>
          <span style={{ color: GOLD, fontWeight: 700, fontSize: 16, letterSpacing: 0.5 }}>{field.label}</span>
        </div>
      );
    }

    const wrapper = (children: React.ReactNode) => (
      <div key={field.id} style={{ marginBottom: 16 }}>
        <label style={labelStyle}>
          {field.label} {field.required && <span style={{ color: RED }}>*</span>}
        </label>
        {children}
      </div>
    );

    switch (field.type) {
      case 'text':
        return wrapper(<input style={inputStyle} type="text" value={val || ''} placeholder={field.placeholder} onChange={e => setVal(e.target.value)} />);
      case 'number':
        return wrapper(<input style={inputStyle} type="number" value={val ?? ''} placeholder={field.placeholder} onChange={e => setVal(e.target.value)} />);
      case 'date':
        return wrapper(<input style={inputStyle} type="date" value={val || ''} onChange={e => setVal(e.target.value)} />);
      case 'time':
        return wrapper(<input style={inputStyle} type="time" value={val || ''} onChange={e => setVal(e.target.value)} />);
      case 'textarea':
        return wrapper(<textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} value={val || ''} placeholder={field.placeholder} onChange={e => setVal(e.target.value)} />);
      case 'checkbox':
        return wrapper(
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              onClick={() => setVal(!val)}
              style={{
                width: 48, height: 28, borderRadius: 14, background: val ? GREEN : '#334155', cursor: 'pointer',
                position: 'relative', transition: 'background 0.2s',
              }}
            >
              <div style={{
                width: 22, height: 22, borderRadius: '50%', background: '#fff',
                position: 'absolute', top: 3, left: val ? 23 : 3, transition: 'left 0.2s',
              }} />
            </div>
            <span style={{ color: TEXT, fontSize: 14 }}>{val ? 'Yes' : 'No'}</span>
          </div>
        );
      case 'radio':
        return wrapper(
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(field.options || []).map(opt => (
              <div
                key={opt}
                onClick={() => setVal(opt)}
                style={{
                  padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                  border: `1px solid ${val === opt ? GOLD : BORDER}`,
                  background: val === opt ? 'rgba(212,160,23,0.12)' : 'transparent',
                  color: val === opt ? GOLD : TEXT, fontSize: 14, fontWeight: val === opt ? 600 : 400,
                }}
              >
                {opt}
              </div>
            ))}
          </div>
        );
      case 'dropdown':
        return wrapper(
          <select style={selectStyle} value={val || ''} onChange={e => setVal(e.target.value)}>
            <option value="">{field.placeholder || 'Select...'}</option>
            {(field.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        );
      case 'photo':
        return wrapper(
          <div>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              id={`photo-${field.id}`}
              onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = ev => setVal(ev.target?.result as string);
                reader.readAsDataURL(file);
              }}
            />
            <label htmlFor={`photo-${field.id}`} style={{ ...btnSecondary, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3"/><path d="M8 5l1-2h6l1 2"/></svg>
              {val ? 'Change Photo' : 'Take Photo'}
            </label>
            {val && typeof val === 'string' && val.startsWith('data:') && (
              <img src={val} alt="Captured" style={{ marginTop: 10, maxWidth: '100%', maxHeight: 200, borderRadius: 10, border: `1px solid ${BORDER}` }} />
            )}
          </div>
        );
      case 'signature':
        return wrapper(
          <div>
            <canvas
              ref={c => initSignatureCanvas(field.id, c)}
              width={320}
              height={140}
              style={{ border: `1px solid ${BORDER}`, borderRadius: 10, touchAction: 'none', width: '100%', maxWidth: 320, height: 140 }}
            />
            <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => clearSignature(field.id)} style={{ ...btnSecondary, padding: '6px 14px', fontSize: 12 }}>Clear</button>
              {val && <span style={{ color: GREEN, fontSize: 12, alignSelf: 'center' }}>Captured</span>}
            </div>
          </div>
        );
      case 'gps':
        return wrapper(
          <div>
            <button type="button" onClick={() => captureGPS(field.id)} style={{ ...btnSecondary, marginBottom: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2" style={{ marginRight: 6, verticalAlign: 'middle' }}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>
              Capture GPS
            </button>
            {val && typeof val === 'object' && val.loading && <span style={{ color: DIM, fontSize: 13 }}>Acquiring location...</span>}
            {val && typeof val === 'object' && val.error && <span style={{ color: RED, fontSize: 13 }}>{val.error}</span>}
            {val && typeof val === 'object' && val.lat !== undefined && (
              <div style={{ color: TEXT, fontSize: 13, background: '#0A1929', padding: 10, borderRadius: 8, border: `1px solid ${BORDER}` }}>
                <div>Lat: <strong>{val.lat.toFixed(6)}</strong></div>
                <div>Lng: <strong>{val.lng.toFixed(6)}</strong></div>
                <div style={{ color: DIM, fontSize: 11 }}>Accuracy: {val.accuracy?.toFixed(1)}m</div>
              </div>
            )}
          </div>
        );
      case 'yes_no_na':
        return wrapper(
          <div style={{ display: 'flex', gap: 8 }}>
            {['Yes', 'No', 'N/A'].map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => setVal(opt)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 14,
                  border: `1px solid ${val === opt ? (opt === 'Yes' ? GREEN : opt === 'No' ? RED : AMBER) : BORDER}`,
                  background: val === opt ? (opt === 'Yes' ? 'rgba(34,197,94,0.15)' : opt === 'No' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)') : 'transparent',
                  color: val === opt ? (opt === 'Yes' ? GREEN : opt === 'No' ? RED : AMBER) : DIM,
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        );
      default:
        return wrapper(<input style={inputStyle} type="text" value={val || ''} onChange={e => setVal(e.target.value)} />);
    }
  };

  /* ─── Render detail field ──────────────────────────────────── */
  const renderDetailField = (field: FieldDef, value: any) => {
    if (field.type === 'section_header') {
      return (
        <div key={field.id} style={{ marginTop: 20, marginBottom: 8, borderBottom: `1px solid ${BORDER}`, paddingBottom: 6 }}>
          <span style={{ color: GOLD, fontWeight: 700, fontSize: 15 }}>{field.label}</span>
        </div>
      );
    }

    const displayValue = () => {
      if (value === undefined || value === null || value === '') return <span style={{ color: DIM, fontStyle: 'italic' }}>Not answered</span>;

      if (field.type === 'photo' && typeof value === 'string' && value.startsWith('data:')) {
        return <img src={value} alt={field.label} style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 10, border: `1px solid ${BORDER}` }} />;
      }
      if (field.type === 'signature' && typeof value === 'string' && value.startsWith('data:')) {
        return <img src={value} alt="Signature" style={{ maxWidth: 320, height: 140, borderRadius: 10, border: `1px solid ${BORDER}`, background: '#1a1a2e' }} />;
      }
      if (field.type === 'gps' && typeof value === 'object' && value.lat !== undefined) {
        return (
          <div style={{ fontSize: 14, color: TEXT }}>
            Lat: {value.lat.toFixed(6)}, Lng: {value.lng.toFixed(6)}
            {value.accuracy && <span style={{ color: DIM, fontSize: 12 }}> (Accuracy: {value.accuracy.toFixed(1)}m)</span>}
          </div>
        );
      }
      if (field.type === 'checkbox') {
        return <span style={{ color: value ? GREEN : RED, fontWeight: 600 }}>{value ? 'Yes' : 'No'}</span>;
      }
      if (field.type === 'yes_no_na') {
        const c = value === 'Yes' ? GREEN : value === 'No' ? RED : AMBER;
        return <span style={{ color: c, fontWeight: 600 }}>{value}</span>;
      }
      return <span style={{ color: TEXT, fontSize: 14 }}>{String(value)}</span>;
    };

    return (
      <div key={field.id} style={{ marginBottom: 14 }}>
        <div style={{ color: DIM, fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{field.label}</div>
        {displayValue()}
      </div>
    );
  };

  /* ─── Navigation tabs ──────────────────────────────────────── */
  const tabs: { key: View; label: string }[] = [
    { key: 'templates', label: 'Templates' },
    { key: 'submissions', label: 'Submissions' },
  ];

  /* ═══════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════ */
  return (
    <div style={{ minHeight: '100vh', background: '#060e1a', color: TEXT, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ background: RAISED, borderBottom: `1px solid ${BORDER}`, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {(view !== 'templates' && view !== 'submissions') && (
            <button onClick={() => {
              if (view === 'fill') { saveDraft(); }
              if (view === 'preview') { setView('builder'); return; }
              setView('templates');
            }} style={{ background: 'none', border: 'none', color: GOLD, cursor: 'pointer', fontSize: 20, padding: 0 }}>
              &#8592;
            </button>
          )}
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Custom Forms</h1>
            <span style={{ color: DIM, fontSize: 12 }}>
              {view === 'builder' ? (editingTemplate ? 'Edit Template' : 'New Template') : view === 'fill' ? fillTemplate?.title : view === 'detail' ? 'Form Detail' : view === 'preview' ? 'Preview' : ''}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!online && (
            <span style={{ background: 'rgba(245,158,11,0.15)', color: AMBER, padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>Offline</span>
          )}
        </div>
      </div>

      {/* ── Flash message ────────────────────────────────────── */}
      {actionMsg && (
        <div style={{
          position: 'fixed', top: 70, left: '50%', transform: 'translateX(-50%)', zIndex: 999,
          background: RAISED, border: `1px solid ${GOLD}`, borderRadius: 10, padding: '10px 24px',
          color: GOLD, fontWeight: 600, fontSize: 14, boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          {actionMsg}
        </div>
      )}

      {/* ── Tab bar (only for main views) ────────────────────── */}
      {(view === 'templates' || view === 'submissions') && (
        <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}`, background: RAISED }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              style={{
                flex: 1, padding: '12px 0', background: 'none', border: 'none',
                borderBottom: view === t.key ? `3px solid ${GOLD}` : '3px solid transparent',
                color: view === t.key ? GOLD : DIM, fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: '16px 16px 100px' }}>
        {loading && (view === 'templates' || view === 'submissions') && (
          <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading...</div>
        )}

        {/* ═══════════════════════════════════════════════════════
            TEMPLATES VIEW
        ═══════════════════════════════════════════════════════ */}
        {view === 'templates' && !loading && (
          <>
            {/* Search + category filter */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <input
                style={{ ...inputStyle, flex: 1, minWidth: 160 }}
                placeholder="Search templates..."
                value={templateSearch}
                onChange={e => setTemplateSearch(e.target.value)}
              />
              <select
                style={{ ...selectStyle, width: 'auto', minWidth: 120 }}
                value={templateCategory}
                onChange={e => setTemplateCategory(e.target.value)}
              >
                <option value="All">All Categories</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Create custom template button */}
            <button onClick={() => openBuilder()} style={{ ...btnPrimary, width: '100%', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span style={{ fontSize: 20, lineHeight: 1 }}>+</span> Create Custom Template
            </button>

            {/* Template cards */}
            {filteredTemplates.length === 0 && (
              <div style={{ textAlign: 'center', padding: 30, color: DIM }}>No templates found</div>
            )}
            {filteredTemplates.map(t => (
              <div key={t.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT }}>{t.title}</h3>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: DIM, lineHeight: 1.4 }}>{t.description}</p>
                  </div>
                  <span style={{ background: 'rgba(59,130,246,0.12)', color: BLUE, padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', marginLeft: 10 }}>
                    {t.category}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                  <span style={{ color: DIM, fontSize: 12 }}>{t.fields.filter(f => f.type !== 'section_header').length} fields</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {!t.is_builtin && (
                      <button onClick={() => openBuilder(t)} style={{ ...btnSecondary, padding: '6px 14px', fontSize: 12 }}>Edit</button>
                    )}
                    <button onClick={() => openFillForm(t)} style={{ ...btnPrimary, padding: '8px 18px', fontSize: 13 }}>Fill Form</button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ═══════════════════════════════════════════════════════
            SUBMISSIONS VIEW
        ═══════════════════════════════════════════════════════ */}
        {view === 'submissions' && !loading && (
          <>
            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <input
                style={{ ...inputStyle, flex: 1, minWidth: 140 }}
                placeholder="Search by title or submitter..."
                value={subSearch}
                onChange={e => setSubSearch(e.target.value)}
              />
              <select style={{ ...selectStyle, width: 'auto', minWidth: 110 }} value={subTemplateFilter} onChange={e => setSubTemplateFilter(e.target.value)}>
                <option value="All">All Templates</option>
                {[...new Set(submissions.map(s => s.template_title))].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select style={{ ...selectStyle, width: 'auto', minWidth: 100 }} value={subStatusFilter} onChange={e => setSubStatusFilter(e.target.value)}>
                <option value="All">All Status</option>
                <option value="Draft">Draft</option>
                <option value="Submitted">Submitted</option>
                <option value="Reviewed">Reviewed</option>
              </select>
              <input type="date" style={{ ...inputStyle, width: 'auto' }} value={subDateFilter} onChange={e => setSubDateFilter(e.target.value)} />
            </div>

            {filteredSubmissions.length === 0 && (
              <div style={{ textAlign: 'center', padding: 30, color: DIM }}>No submissions found</div>
            )}
            {filteredSubmissions.map(s => (
              <div key={s.id} style={{ ...cardStyle, cursor: 'pointer' }} onClick={() => openDetail(s)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT }}>{s.template_title}</h3>
                    <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                      <span style={{ color: DIM, fontSize: 12 }}>{formatDate(s.created_at)}</span>
                      <span style={{ color: DIM, fontSize: 12 }}>by {s.submitter || 'Unknown'}</span>
                    </div>
                  </div>
                  <span style={{
                    background: `${STATUS_COLORS[s.status] || BLUE}20`,
                    color: STATUS_COLORS[s.status] || BLUE,
                    padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                  }}>
                    {s.status}
                  </span>
                </div>
                {/* Progress bar */}
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: DIM, fontSize: 11 }}>Completion</span>
                    <span style={{ color: TEXT, fontSize: 11, fontWeight: 600 }}>{s.completion_pct}%</span>
                  </div>
                  <div style={{ height: 6, background: '#1a2a3f', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${s.completion_pct}%`, background: s.completion_pct === 100 ? GREEN : s.completion_pct >= 50 ? AMBER : RED, borderRadius: 3, transition: 'width 0.3s' }} />
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ═══════════════════════════════════════════════════════
            BUILDER VIEW
        ═══════════════════════════════════════════════════════ */}
        {view === 'builder' && (
          <>
            {/* Template meta */}
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 12px', color: GOLD, fontSize: 15, fontWeight: 700 }}>Template Details</h3>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Title <span style={{ color: RED }}>*</span></label>
                <input style={inputStyle} value={builderTitle} onChange={e => setBuilderTitle(e.target.value)} placeholder="Form template title" />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Description</label>
                <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={builderDesc} onChange={e => setBuilderDesc(e.target.value)} placeholder="What is this form for?" />
              </div>
              <div>
                <label style={labelStyle}>Category</label>
                <select style={selectStyle} value={builderCategory} onChange={e => setBuilderCategory(e.target.value)}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Field list */}
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 12px', color: GOLD, fontSize: 15, fontWeight: 700 }}>Fields ({builderFields.length})</h3>
              {builderFields.length === 0 && <div style={{ color: DIM, fontSize: 13, padding: '10px 0' }}>No fields added yet. Add your first field below.</div>}
              {builderFields.map((f, i) => (
                <div key={f.id} style={{
                  background: '#0A1929', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, marginBottom: 8,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button onClick={() => moveField(i, -1)} disabled={i === 0} style={{ background: 'none', border: 'none', color: i === 0 ? '#334155' : DIM, cursor: i === 0 ? 'default' : 'pointer', fontSize: 16, padding: 0 }}>&#9650;</button>
                    <button onClick={() => moveField(i, 1)} disabled={i === builderFields.length - 1} style={{ background: 'none', border: 'none', color: i === builderFields.length - 1 ? '#334155' : DIM, cursor: i === builderFields.length - 1 ? 'default' : 'pointer', fontSize: 16, padding: 0 }}>&#9660;</button>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: TEXT, fontSize: 14, fontWeight: 600 }}>{f.label}</span>
                      {f.required && <span style={{ color: RED, fontSize: 10, fontWeight: 700 }}>REQUIRED</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                      <span style={{ color: BLUE, fontSize: 11, fontWeight: 600 }}>{FIELD_TYPE_LABELS[f.type]}</span>
                      {f.placeholder && <span style={{ color: DIM, fontSize: 11 }}>"{f.placeholder}"</span>}
                      {f.options && <span style={{ color: DIM, fontSize: 11 }}>Options: {f.options.join(', ')}</span>}
                    </div>
                  </div>
                  <button onClick={() => removeField(i)} style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 18, padding: 0 }}>&#10005;</button>
                </div>
              ))}
            </div>

            {/* Add field form */}
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 12px', color: GOLD, fontSize: 15, fontWeight: 700 }}>Add Field</h3>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 130 }}>
                  <label style={labelStyle}>Type</label>
                  <select style={selectStyle} value={addFieldType} onChange={e => setAddFieldType(e.target.value as FieldType)}>
                    {(Object.keys(FIELD_TYPE_LABELS) as FieldType[]).map(ft => <option key={ft} value={ft}>{FIELD_TYPE_LABELS[ft]}</option>)}
                  </select>
                </div>
                <div style={{ flex: 2, minWidth: 160 }}>
                  <label style={labelStyle}>Label <span style={{ color: RED }}>*</span></label>
                  <input style={inputStyle} value={addFieldLabel} onChange={e => setAddFieldLabel(e.target.value)} placeholder="Field label" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 130 }}>
                  <label style={labelStyle}>Placeholder</label>
                  <input style={inputStyle} value={addFieldPlaceholder} onChange={e => setAddFieldPlaceholder(e.target.value)} placeholder="Optional" />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, paddingBottom: 2 }}>
                  <label style={{ color: DIM, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div
                      onClick={() => setAddFieldRequired(!addFieldRequired)}
                      style={{
                        width: 40, height: 22, borderRadius: 11, background: addFieldRequired ? GREEN : '#334155',
                        cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                      }}
                    >
                      <div style={{
                        width: 18, height: 18, borderRadius: '50%', background: '#fff',
                        position: 'absolute', top: 2, left: addFieldRequired ? 20 : 2, transition: 'left 0.2s',
                      }} />
                    </div>
                    Required
                  </label>
                </div>
              </div>
              {(addFieldType === 'radio' || addFieldType === 'dropdown') && (
                <div style={{ marginBottom: 10 }}>
                  <label style={labelStyle}>Options (comma-separated)</label>
                  <input style={inputStyle} value={addFieldOptions} onChange={e => setAddFieldOptions(e.target.value)} placeholder="Option 1, Option 2, Option 3" />
                </div>
              )}
              <button onClick={addField} disabled={!addFieldLabel.trim()} style={{ ...btnSecondary, width: '100%', opacity: addFieldLabel.trim() ? 1 : 0.4 }}>
                + Add Field
              </button>
            </div>

            {/* Builder actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button
                onClick={() => setView('preview')}
                disabled={builderFields.length === 0}
                style={{ ...btnSecondary, flex: 1, opacity: builderFields.length === 0 ? 0.4 : 1 }}
              >
                Preview
              </button>
              <button
                onClick={saveTemplate}
                disabled={saving || !builderTitle.trim() || builderFields.length === 0}
                style={{ ...btnPrimary, flex: 1, opacity: (saving || !builderTitle.trim() || builderFields.length === 0) ? 0.5 : 1 }}
              >
                {saving ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════
            PREVIEW VIEW (builder preview)
        ═══════════════════════════════════════════════════════ */}
        {view === 'preview' && (
          <>
            <div style={{ ...cardStyle, borderLeft: `4px solid ${GOLD}` }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: TEXT }}>{builderTitle || 'Untitled Form'}</h2>
              {builderDesc && <p style={{ margin: '6px 0 0', color: DIM, fontSize: 13 }}>{builderDesc}</p>}
              <span style={{ color: BLUE, fontSize: 11, fontWeight: 600, marginTop: 6, display: 'inline-block' }}>{builderCategory}</span>
            </div>
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', color: DIM, fontSize: 13, fontWeight: 600 }}>PREVIEW - Fields will render as shown below when filling</h3>
              {builderFields.map(f => renderFillField(f))}
            </div>
            <button onClick={() => setView('builder')} style={{ ...btnSecondary, width: '100%' }}>Back to Builder</button>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════
            FILL FORM VIEW
        ═══════════════════════════════════════════════════════ */}
        {view === 'fill' && fillTemplate && (
          <>
            {/* Progress bar */}
            {(() => {
              const { completed, total } = computeProgress();
              const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
              return (
                <div style={{ ...cardStyle, padding: '12px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: DIM, fontSize: 12, fontWeight: 600 }}>Progress</span>
                    <span style={{ color: TEXT, fontSize: 12, fontWeight: 700 }}>{completed} of {total} fields ({pct}%)</span>
                  </div>
                  <div style={{ height: 8, background: '#1a2a3f', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? GREEN : pct >= 50 ? AMBER : BLUE, borderRadius: 4, transition: 'width 0.3s' }} />
                  </div>
                </div>
              );
            })()}

            {/* Submitter name */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Your Name <span style={{ color: RED }}>*</span></label>
              <input style={inputStyle} value={submitter} onChange={e => setSubmitter(e.target.value)} placeholder="Full name" />
            </div>

            {/* Form fields */}
            {fillTemplate.fields.map(f => renderFillField(f))}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={saveDraft} style={{ ...btnSecondary, flex: 1 }}>Save Draft</button>
              <button
                onClick={submitForm}
                disabled={saving || !submitter.trim()}
                style={{ ...btnPrimary, flex: 1, opacity: (saving || !submitter.trim()) ? 0.5 : 1 }}
              >
                {saving ? 'Submitting...' : 'Submit Form'}
              </button>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════
            DETAIL VIEW
        ═══════════════════════════════════════════════════════ */}
        {view === 'detail' && detailSub && (
          <>
            {/* Header card */}
            <div style={{ ...cardStyle, borderLeft: `4px solid ${STATUS_COLORS[detailSub.status] || BLUE}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: TEXT }}>{detailSub.template_title}</h2>
                  <div style={{ display: 'flex', gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{ color: DIM, fontSize: 12 }}>Submitted: {formatDate(detailSub.created_at)}</span>
                    <span style={{ color: DIM, fontSize: 12 }}>By: {detailSub.submitter || 'Unknown'}</span>
                    {detailSub.reviewer && <span style={{ color: DIM, fontSize: 12 }}>Reviewed by: {detailSub.reviewer}</span>}
                  </div>
                </div>
                <span style={{
                  background: `${STATUS_COLORS[detailSub.status] || BLUE}20`,
                  color: STATUS_COLORS[detailSub.status] || BLUE,
                  padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                }}>
                  {detailSub.status}
                </span>
              </div>
              {/* Completion bar */}
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: DIM, fontSize: 11 }}>Completion</span>
                  <span style={{ color: TEXT, fontSize: 11, fontWeight: 600 }}>{detailSub.completion_pct}%</span>
                </div>
                <div style={{ height: 6, background: '#1a2a3f', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${detailSub.completion_pct}%`, background: detailSub.completion_pct === 100 ? GREEN : AMBER, borderRadius: 3 }} />
                </div>
              </div>
            </div>

            {/* Responses */}
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', color: GOLD, fontSize: 15, fontWeight: 700 }}>Responses</h3>
              {detailTemplate ? (
                detailTemplate.fields.map(f => renderDetailField(f, detailSub.responses?.[f.id]))
              ) : (
                <div>
                  {Object.entries(detailSub.responses || {}).map(([key, val]) => (
                    <div key={key} style={{ marginBottom: 10 }}>
                      <div style={{ color: DIM, fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{key}</div>
                      <span style={{ color: TEXT, fontSize: 14 }}>
                        {typeof val === 'string' && val.startsWith('data:image') ? (
                          <img src={val} alt={key} style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 10, border: `1px solid ${BORDER}` }} />
                        ) : typeof val === 'object' ? JSON.stringify(val) : String(val)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              {detailSub.status !== 'Reviewed' && (
                <button
                  onClick={() => reviewSubmission(detailSub)}
                  disabled={saving}
                  style={{ ...btnPrimary, flex: 1, background: GREEN, opacity: saving ? 0.5 : 1 }}
                >
                  {saving ? 'Reviewing...' : 'Approve / Review'}
                </button>
              )}
              <button onClick={() => exportPDF(detailSub)} style={{ ...btnSecondary, flex: 1 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2" style={{ marginRight: 6, verticalAlign: 'middle' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export PDF
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Suspense wrapper + default export ───────────────────────── */
export default function FormsPageWrapper() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#060e1a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8BAAC8', fontFamily: '-apple-system, sans-serif' }}>Loading Forms...</div>}>
      <FormsPage />
    </Suspense>
  );
}
