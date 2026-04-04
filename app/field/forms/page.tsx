'use client';
/**
 * Saguaro Field — Custom Forms List + Builder
 * Lists templates, create/edit templates with drag-reorder, fill & submit forms.
 * Glassmorphism design, real Supabase data via API routes.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/components/Toast';

const BASE   = '#F8F9FB';
const CARD   = '#F8F9FB';
const GOLD   = '#C8960F';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const BORDER = '#2A3144';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';

type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox' | 'photo' | 'signature' | 'rating';
type Category = 'safety' | 'quality' | 'inspection' | 'checklist' | 'custom';

interface FieldDef {
  id: string;
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
}

interface FormTemplate {
  id: string;
  name: string;
  description: string;
  category: Category;
  fields: FieldDef[];
  last_used?: string;
  created_at?: string;
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'photo', label: 'Photo' },
  { value: 'signature', label: 'Signature' },
  { value: 'rating', label: 'Rating' },
];

const CATEGORIES: { value: Category; label: string; color: string }[] = [
  { value: 'safety', label: 'Safety', color: RED },
  { value: 'quality', label: 'Quality', color: GREEN },
  { value: 'inspection', label: 'Inspection', color: '#3B82F6' },
  { value: 'checklist', label: 'Checklist', color: GOLD },
  { value: 'custom', label: 'Custom', color: '#8B5CF6' },
];

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function getCategoryColor(cat: string): string {
  return CATEGORIES.find((c) => c.value === cat)?.color || DIM;
}

function formatDate(d?: string): string {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ─── Signature Canvas ──────────────────────────────────────────── */
function SignatureCanvas({ onSave }: { onSave: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasStrokesRef = useRef(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const parent = c.parentElement;
    if (parent) { c.width = parent.clientWidth; c.height = 140; }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = BASE;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(16, c.height - 24);
    ctx.lineTo(c.width - 16, c.height - 24);
    ctx.stroke();
    ctx.fillStyle = DIM;
    ctx.font = '10px sans-serif';
    ctx.fillText('Sign above', 16, c.height - 8);
  }, []);

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const rect = c.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const onStart = (e: React.TouchEvent | React.MouseEvent) => {
    if ('touches' in e) e.preventDefault();
    drawingRef.current = true;
    hasStrokesRef.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.strokeStyle = TEXT;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(x, y);
  };

  const onMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!drawingRef.current) return;
    if ('touches' in e) e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const onEnd = () => { drawingRef.current = false; };

  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    hasStrokesRef.current = false;
    ctx.fillStyle = BASE;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(16, c.height - 24);
    ctx.lineTo(c.width - 16, c.height - 24);
    ctx.stroke();
    ctx.fillStyle = DIM;
    ctx.font = '10px sans-serif';
    ctx.fillText('Sign above', 16, c.height - 8);
  };

  const save = () => {
    if (!hasStrokesRef.current || !canvasRef.current) return;
    onSave(canvasRef.current.toDataURL('image/png'));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <canvas
        ref={canvasRef}
        style={{ borderRadius: 8, border: `1px solid ${BORDER}`, touchAction: 'none', cursor: 'crosshair' }}
        onMouseDown={onStart}
        onMouseMove={onMove}
        onMouseUp={onEnd}
        onMouseLeave={onEnd}
        onTouchStart={onStart}
        onTouchMove={onMove}
        onTouchEnd={onEnd}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={clear} style={smallBtnStyle(DIM)}>Clear</button>
        <button onClick={save} style={smallBtnStyle(GREEN)}>Accept</button>
      </div>
    </div>
  );
}

function smallBtnStyle(color: string): React.CSSProperties {
  return {
    flex: 1,
    padding: '6px 0',
    borderRadius: 6,
    border: `1px solid ${color}33`,
    background: `${color}15`,
    color,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  };
}

/* ─── Star Rating ───────────────────────────────────────────────── */
function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => onChange(star)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 2,
            color: star <= value ? GOLD : `${DIM}44`, fontSize: 24, lineHeight: 1,
          }}
          aria-label={`${star} star`}
        >
          {star <= value ? '\u2605' : '\u2606'}
        </button>
      ))}
    </div>
  );
}

/* ─── Glass Card Helper ─────────────────────────────────────────── */
function glassCard(extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: `${CARD}cc`,
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: `1px solid ${BORDER}`,
    borderRadius: 14,
    padding: 16,
    ...extra,
  };
}

/* ─── Main Component ────────────────────────────────────────────── */
export default function FormsPage() {
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'builder' | 'fill'>('list');

  // Builder state
  const [bName, setBName] = useState('');
  const [bDesc, setBDesc] = useState('');
  const [bCat, setBCat] = useState<Category>('custom');
  const [bFields, setBFields] = useState<FieldDef[]>([]);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<FieldType>('text');
  const [newFieldOptions, setNewFieldOptions] = useState('');

  // Fill state
  const [fillTemplate, setFillTemplate] = useState<FormTemplate | null>(null);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);

  const tenantId = typeof window !== 'undefined' ? localStorage.getItem('saguaro_tenant_id') || '' : '';

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/forms/templates?tenantId=${tenantId}`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(Array.isArray(data) ? data : data.templates || []);
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  /* ── Builder helpers ──────────────────────────────────────────── */
  const addField = () => {
    if (!newFieldLabel.trim()) return;
    const field: FieldDef = {
      id: uid(),
      label: newFieldLabel.trim(),
      type: newFieldType,
    };
    if ((newFieldType === 'select') && newFieldOptions.trim()) {
      field.options = newFieldOptions.split(',').map((o) => o.trim()).filter(Boolean);
    }
    setBFields((prev) => [...prev, field]);
    setNewFieldLabel('');
    setNewFieldOptions('');
  };

  const moveField = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= bFields.length) return;
    const arr = [...bFields];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    setBFields(arr);
  };

  const removeField = (id: string) => setBFields((f) => f.filter((x) => x.id !== id));

  const saveTemplate = async () => {
    if (!bName.trim() || bFields.length === 0) {
      showToast('Template needs a name and at least one field', 'warning');
      return;
    }
    try {
      const res = await fetch('/api/forms/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          name: bName.trim(),
          description: bDesc.trim(),
          category: bCat,
          fields: bFields,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast('Template created', 'success');
      setBName(''); setBDesc(''); setBCat('custom'); setBFields([]);
      setView('list');
      fetchTemplates();
    } catch {
      showToast('Failed to save template', 'error');
    }
  };

  /* ── Fill helpers ─────────────────────────────────────────────── */
  const openFillForm = (tpl: FormTemplate) => {
    setFillTemplate(tpl);
    setResponses({});
    setView('fill');
  };

  const setResponse = (fieldId: string, value: any) => {
    setResponses((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handlePhotoCapture = async (fieldId: string) => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      input.onchange = (e: any) => {
        const file = e.target?.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            setResponse(fieldId, ev.target?.result);
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    } catch { /* ignore */ }
  };

  const submitForm = async () => {
    if (!fillTemplate) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/forms/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          templateId: fillTemplate.id,
          responses,
        }),
      });
      if (!res.ok) throw new Error('Submit failed');
      showToast('Form submitted successfully', 'success');
      setView('list');
    } catch {
      showToast('Failed to submit form', 'error');
    } finally { setSubmitting(false); }
  };

  /* ── Render: List View ────────────────────────────────────────── */
  if (view === 'list') {
    return (
      <div style={{ minHeight: '100vh', background: BASE, padding: '16px 16px 100px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>Custom Forms</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: DIM }}>{templates.length} template{templates.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => setView('builder')}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: 'none',
              background: `linear-gradient(135deg, ${GOLD}, ${GOLD}cc)`,
              color: BASE,
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              boxShadow: `0 4px 16px ${GOLD}33`,
            }}
          >
            + Create Template
          </button>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ ...glassCard(), height: 90, opacity: 0.5 }}>
                <div style={{ width: '60%', height: 14, background: `${DIM}22`, borderRadius: 6, marginBottom: 8 }} />
                <div style={{ width: '40%', height: 10, background: `${DIM}15`, borderRadius: 4 }} />
              </div>
            ))}
          </div>
        )}

        {/* Templates grid */}
        {!loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {templates.length === 0 && (
              <div style={{ ...glassCard(), textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                <p style={{ color: DIM, fontSize: 14, margin: 0 }}>No form templates yet. Create your first one.</p>
              </div>
            )}
            {templates.map((tpl) => {
              const catColor = getCategoryColor(tpl.category);
              return (
                <button
                  key={tpl.id}
                  onClick={() => openFillForm(tpl)}
                  style={{
                    ...glassCard({ cursor: 'pointer', textAlign: 'left', transition: 'transform 0.15s, border-color 0.15s' }),
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: TEXT, flex: 1 }}>{tpl.name}</span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: catColor,
                      background: `${catColor}18`,
                      border: `1px solid ${catColor}33`,
                      borderRadius: 6,
                      padding: '3px 8px',
                      flexShrink: 0,
                    }}>
                      {tpl.category}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: DIM }}>
                    <span>{tpl.fields?.length || 0} fields</span>
                    <span>Last used: {formatDate(tpl.last_used)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  /* ── Render: Builder View ─────────────────────────────────────── */
  if (view === 'builder') {
    return (
      <div style={{ minHeight: '100vh', background: BASE, padding: '16px 16px 100px' }}>
        {/* Back + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', color: GOLD, fontSize: 20, cursor: 'pointer', padding: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Create Template</h1>
        </div>

        {/* Template info */}
        <div style={{ ...glassCard({ marginBottom: 16 }), display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            value={bName}
            onChange={(e) => setBName(e.target.value)}
            placeholder="Template name"
            style={inputStyle()}
          />
          <textarea
            value={bDesc}
            onChange={(e) => setBDesc(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            style={{ ...inputStyle(), resize: 'vertical', minHeight: 50 }}
          />
          <div>
            <label style={{ fontSize: 11, color: DIM, fontWeight: 600, marginBottom: 4, display: 'block' }}>Category</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setBCat(cat.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: `1px solid ${bCat === cat.value ? cat.color : BORDER}`,
                    background: bCat === cat.value ? `${cat.color}22` : 'transparent',
                    color: bCat === cat.value ? cat.color : DIM,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Current fields list */}
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, color: TEXT, fontWeight: 700, marginBottom: 8 }}>
            Fields ({bFields.length})
          </h3>
          {bFields.length === 0 && (
            <p style={{ fontSize: 13, color: DIM, margin: 0 }}>No fields added yet.</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bFields.map((field, idx) => (
              <div key={field.id} style={{
                ...glassCard({ padding: '10px 12px' }),
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                {/* Reorder buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <button
                    onClick={() => moveField(idx, -1)}
                    disabled={idx === 0}
                    style={{ background: 'none', border: 'none', color: idx === 0 ? `${DIM}44` : DIM, cursor: idx === 0 ? 'default' : 'pointer', fontSize: 10, padding: 0, lineHeight: 1 }}
                  >&#9650;</button>
                  <button
                    onClick={() => moveField(idx, 1)}
                    disabled={idx === bFields.length - 1}
                    style={{ background: 'none', border: 'none', color: idx === bFields.length - 1 ? `${DIM}44` : DIM, cursor: idx === bFields.length - 1 ? 'default' : 'pointer', fontSize: 10, padding: 0, lineHeight: 1 }}
                  >&#9660;</button>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{field.label}</div>
                  <div style={{ fontSize: 11, color: DIM }}>
                    {FIELD_TYPES.find((f) => f.value === field.type)?.label || field.type}
                    {field.options && field.options.length > 0 ? ` (${field.options.join(', ')})` : ''}
                  </div>
                </div>

                <button
                  onClick={() => removeField(field.id)}
                  style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }}
                  aria-label="Remove field"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Add field form */}
        <div style={{ ...glassCard({ marginBottom: 20 }), display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: GOLD }}>Add Field</h4>
          <input
            value={newFieldLabel}
            onChange={(e) => setNewFieldLabel(e.target.value)}
            placeholder="Field name"
            style={inputStyle()}
          />
          <select
            value={newFieldType}
            onChange={(e) => setNewFieldType(e.target.value as FieldType)}
            style={{ ...inputStyle(), appearance: 'none' }}
          >
            {FIELD_TYPES.map((ft) => (
              <option key={ft.value} value={ft.value}>{ft.label}</option>
            ))}
          </select>
          {newFieldType === 'select' && (
            <input
              value={newFieldOptions}
              onChange={(e) => setNewFieldOptions(e.target.value)}
              placeholder="Options (comma separated)"
              style={inputStyle()}
            />
          )}
          <button
            onClick={addField}
            style={{
              padding: '10px 0',
              borderRadius: 8,
              border: `1px solid ${GOLD}44`,
              background: `${GOLD}15`,
              color: GOLD,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            + Add Field
          </button>
        </div>

        {/* Save template button */}
        <button
          onClick={saveTemplate}
          style={{
            width: '100%',
            padding: '14px 0',
            borderRadius: 12,
            border: 'none',
            background: `linear-gradient(135deg, ${GOLD}, ${GOLD}cc)`,
            color: BASE,
            fontWeight: 800,
            fontSize: 15,
            cursor: 'pointer',
            boxShadow: `0 4px 20px ${GOLD}33`,
          }}
        >
          Save Template
        </button>
      </div>
    );
  }

  /* ── Render: Fill Form View ───────────────────────────────────── */
  if (view === 'fill' && fillTemplate) {
    return (
      <div style={{ minHeight: '100vh', background: BASE, padding: '16px 16px 100px' }}>
        {/* Back + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', color: GOLD, fontSize: 20, cursor: 'pointer', padding: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: TEXT, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fillTemplate.name}
          </h1>
        </div>
        {fillTemplate.description && (
          <p style={{ fontSize: 13, color: DIM, margin: '0 0 16px', paddingLeft: 32 }}>{fillTemplate.description}</p>
        )}

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {fillTemplate.fields.map((field) => (
            <div key={field.id} style={glassCard()}>
              <label style={{ fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {field.label}
              </label>

              {field.type === 'text' && (
                <input
                  value={responses[field.id] || ''}
                  onChange={(e) => setResponse(field.id, e.target.value)}
                  placeholder={`Enter ${field.label.toLowerCase()}`}
                  style={inputStyle()}
                />
              )}

              {field.type === 'textarea' && (
                <textarea
                  value={responses[field.id] || ''}
                  onChange={(e) => setResponse(field.id, e.target.value)}
                  placeholder={`Enter ${field.label.toLowerCase()}`}
                  rows={3}
                  style={{ ...inputStyle(), resize: 'vertical', minHeight: 60 }}
                />
              )}

              {field.type === 'number' && (
                <input
                  type="number"
                  value={responses[field.id] || ''}
                  onChange={(e) => setResponse(field.id, e.target.value)}
                  placeholder="0"
                  style={inputStyle()}
                />
              )}

              {field.type === 'date' && (
                <input
                  type="date"
                  value={responses[field.id] || ''}
                  onChange={(e) => setResponse(field.id, e.target.value)}
                  style={{ ...inputStyle(), colorScheme: 'dark' }}
                />
              )}

              {field.type === 'select' && (
                <select
                  value={responses[field.id] || ''}
                  onChange={(e) => setResponse(field.id, e.target.value)}
                  style={{ ...inputStyle(), appearance: 'none' }}
                >
                  <option value="">Select...</option>
                  {(field.options || []).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              )}

              {field.type === 'checkbox' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!responses[field.id]}
                    onChange={(e) => setResponse(field.id, e.target.checked)}
                    style={{ width: 20, height: 20, accentColor: GOLD }}
                  />
                  <span style={{ fontSize: 14, color: TEXT }}>Yes</span>
                </label>
              )}

              {field.type === 'photo' && (
                <div>
                  {responses[field.id] ? (
                    <div style={{ position: 'relative' }}>
                      <img src={responses[field.id]} alt="Captured" style={{ width: '100%', borderRadius: 8, maxHeight: 200, objectFit: 'cover' }} />
                      <button
                        onClick={() => setResponse(field.id, null)}
                        style={{ position: 'absolute', top: 8, right: 8, background: `${RED}cc`, border: 'none', borderRadius: '50%', width: 28, height: 28, color: '#fff', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                      >&times;</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handlePhotoCapture(field.id)}
                      style={{
                        width: '100%',
                        padding: '20px 0',
                        borderRadius: 10,
                        border: `2px dashed ${BORDER}`,
                        background: 'transparent',
                        color: DIM,
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', margin: '0 auto 6px' }}>
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                        <circle cx="12" cy="13" r="4"/>
                      </svg>
                      Tap to capture photo
                    </button>
                  )}
                </div>
              )}

              {field.type === 'signature' && (
                <div>
                  {responses[field.id] ? (
                    <div style={{ position: 'relative' }}>
                      <img src={responses[field.id]} alt="Signature" style={{ width: '100%', borderRadius: 8, background: BASE }} />
                      <button
                        onClick={() => setResponse(field.id, null)}
                        style={{ position: 'absolute', top: 6, right: 6, background: `${RED}cc`, border: 'none', borderRadius: '50%', width: 24, height: 24, color: '#fff', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
                      >&times;</button>
                    </div>
                  ) : (
                    <SignatureCanvas onSave={(dataUrl) => setResponse(field.id, dataUrl)} />
                  )}
                </div>
              )}

              {field.type === 'rating' && (
                <StarRating value={responses[field.id] || 0} onChange={(v) => setResponse(field.id, v)} />
              )}
            </div>
          ))}
        </div>

        {/* Submit button */}
        <button
          onClick={submitForm}
          disabled={submitting}
          style={{
            width: '100%',
            padding: '14px 0',
            borderRadius: 12,
            border: 'none',
            background: submitting ? DIM : `linear-gradient(135deg, ${GREEN}, ${GREEN}cc)`,
            color: submitting ? TEXT : BASE,
            fontWeight: 800,
            fontSize: 15,
            cursor: submitting ? 'wait' : 'pointer',
            marginTop: 20,
            boxShadow: `0 4px 20px ${GREEN}33`,
          }}
        >
          {submitting ? 'Submitting...' : 'Submit Form'}
        </button>
      </div>
    );
  }

  return null;
}

/* ─── Shared input style ────────────────────────────────────────── */
function inputStyle(): React.CSSProperties {
  return {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #2A3144',
    background: '#F8F9FBcc',
    color: '#F0F4FF',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  };
}
