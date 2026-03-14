'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';

/* ── Color Palette ── */
const GOLD = '#D4A017';
const BG = '#07101C';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const GREEN = '#22C55E';
const RED = '#EF4444';
const AMBER = '#F59E0B';
const BLUE = '#3B82F6';
const PURPLE = '#8B5CF6';

/* ── Constants ── */
const MODULES = [
  'Projects', 'RFIs', 'Submittals', 'Daily Logs', 'Change Orders',
  'Punch List', 'Contracts', 'Invoices', 'Subcontractors', 'Safety',
  'Timesheets', 'Pay Apps', 'Bid Packages',
] as const;
type ModuleName = (typeof MODULES)[number];

const FIELD_TYPES = [
  'text', 'number', 'date', 'select', 'multiselect', 'checkbox',
  'file', 'url',
] as const;
type FieldType = (typeof FIELD_TYPES)[number];

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  select: 'Select',
  multiselect: 'Multi-Select',
  checkbox: 'Checkbox',
  file: 'File',
  url: 'URL',
};

const FIELD_TYPE_ICONS: Record<FieldType, string> = {
  text: 'Aa',
  number: '#',
  date: 'Cal',
  select: 'List',
  multiselect: 'Tags',
  checkbox: 'Chk',
  file: 'Doc',
  url: 'Link',
};

/* ── Types ── */
interface ValidationRule {
  min?: number | null;
  max?: number | null;
  regex?: string | null;
  regexMessage?: string | null;
}

interface CustomField {
  id?: string;
  module: string;
  field_name: string;
  field_label: string;
  field_type: FieldType;
  options: string[] | null;
  required: boolean;
  default_value: string;
  sort_order: number;
  is_active: boolean;
  usage_count?: number;
  validation?: ValidationRule | null;
  created_at?: string;
}

interface ModuleSummary {
  module: string;
  total: number;
  active: number;
  required: number;
}

const emptyField = (module: string, sortOrder: number): CustomField => ({
  module,
  field_name: '',
  field_label: '',
  field_type: 'text',
  options: null,
  required: false,
  default_value: '',
  sort_order: sortOrder,
  is_active: true,
  validation: null,
});

const emptyValidation = (): ValidationRule => ({
  min: null,
  max: null,
  regex: null,
  regexMessage: null,
});

/* ── Inline Style Helpers ── */
const btn = (bg: string, color = TEXT): React.CSSProperties => ({
  background: bg,
  color,
  border: 'none',
  borderRadius: 6,
  padding: '7px 16px',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 13,
  transition: 'opacity .15s',
});

const inputStyle = (): React.CSSProperties => ({
  background: BG,
  color: TEXT,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  padding: '7px 10px',
  fontSize: 13,
  width: '100%',
  outline: 'none',
  boxSizing: 'border-box' as const,
});

const labelStyle = (): React.CSSProperties => ({
  color: DIM,
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 4,
  display: 'block',
});

const cardStyle = (): React.CSSProperties => ({
  background: RAISED,
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  padding: 20,
  marginBottom: 14,
});

/* ── Field Preview Component ── */
function FieldPreview({ field }: { field: CustomField }) {
  const wrap: React.CSSProperties = {
    background: BG,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    padding: 14,
    marginTop: 8,
  };
  const lbl: React.CSSProperties = {
    color: DIM,
    fontSize: 11,
    marginBottom: 6,
    display: 'block',
  };
  const inp: React.CSSProperties = {
    ...inputStyle(),
    pointerEvents: 'none',
    opacity: 0.7,
  };

  const fieldLabel = field.field_label || 'Untitled';
  const requiredMark = field.required ? (
    <span style={{ color: RED, marginLeft: 2 }}>*</span>
  ) : null;

  switch (field.field_type) {
    case 'text':
    case 'url':
      return (
        <div style={wrap}>
          <span style={lbl}>
            Preview: {fieldLabel}{requiredMark}
          </span>
          <input
            style={inp}
            placeholder={field.field_type === 'url' ? 'https://example.com' : 'Enter text...'}
            defaultValue={field.default_value || ''}
            readOnly
          />
          {field.validation?.regex && (
            <div style={{ color: PURPLE, fontSize: 10, marginTop: 4 }}>
              Pattern: {field.validation.regex}
            </div>
          )}
        </div>
      );
    case 'number':
      return (
        <div style={wrap}>
          <span style={lbl}>
            Preview: {fieldLabel}{requiredMark}
          </span>
          <input
            style={inp}
            type="number"
            placeholder={
              field.validation?.min != null && field.validation?.max != null
                ? `${field.validation.min} - ${field.validation.max}`
                : '0'
            }
            defaultValue={field.default_value || ''}
            readOnly
          />
          {(field.validation?.min != null || field.validation?.max != null) && (
            <div style={{ color: PURPLE, fontSize: 10, marginTop: 4 }}>
              Range: {field.validation?.min ?? 'any'} - {field.validation?.max ?? 'any'}
            </div>
          )}
        </div>
      );
    case 'date':
      return (
        <div style={wrap}>
          <span style={lbl}>
            Preview: {fieldLabel}{requiredMark}
          </span>
          <input style={{ ...inp, colorScheme: 'dark' }} type="date" readOnly />
        </div>
      );
    case 'checkbox':
      return (
        <div style={wrap}>
          <span style={lbl}>
            Preview: {fieldLabel}{requiredMark}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              disabled
              checked={field.default_value === 'true'}
              style={{ width: 18, height: 18, accentColor: GOLD }}
            />
            <span style={{ color: TEXT, fontSize: 13 }}>{fieldLabel}</span>
          </div>
        </div>
      );
    case 'select':
      return (
        <div style={wrap}>
          <span style={lbl}>
            Preview: {fieldLabel}{requiredMark}
          </span>
          <select style={{ ...inp, appearance: 'auto' }} disabled>
            <option>-- Select --</option>
            {(field.options || []).map((o, i) => (
              <option key={i}>{o}</option>
            ))}
          </select>
        </div>
      );
    case 'multiselect':
      return (
        <div style={wrap}>
          <span style={lbl}>
            Preview: {fieldLabel}{requiredMark}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(field.options || ['Option 1', 'Option 2']).map((o, i) => (
              <span
                key={i}
                style={{
                  background: BORDER,
                  color: TEXT,
                  borderRadius: 12,
                  padding: '3px 10px',
                  fontSize: 12,
                  opacity: 0.7,
                }}
              >
                {o}
              </span>
            ))}
          </div>
        </div>
      );
    case 'file':
      return (
        <div style={wrap}>
          <span style={lbl}>
            Preview: {fieldLabel}{requiredMark}
          </span>
          <div
            style={{
              border: `2px dashed ${BORDER}`,
              borderRadius: 8,
              padding: 20,
              textAlign: 'center',
              color: DIM,
              fontSize: 12,
            }}
          >
            Drag & drop a file here, or click to browse
          </div>
        </div>
      );
    default:
      return null;
  }
}

/* ── Options Editor ── */
function OptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (opts: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const addOption = () => {
    const v = draft.trim();
    if (!v || options.includes(v)) return;
    onChange([...options, v]);
    setDraft('');
  };

  const removeOption = (idx: number) =>
    onChange(options.filter((_, i) => i !== idx));

  const moveOption = (idx: number, dir: -1 | 1) => {
    const next = [...options];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  return (
    <div style={{ marginTop: 8 }}>
      <span style={labelStyle()}>Options</span>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <input
          style={{ ...inputStyle(), flex: 1 }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addOption()}
          placeholder="Type an option and press Enter..."
        />
        <button style={btn(GOLD, BG)} onClick={addOption}>
          Add
        </button>
      </div>
      {options.map((opt, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 0',
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          <span style={{ color: DIM, fontSize: 11, width: 20, textAlign: 'center' }}>
            {i + 1}
          </span>
          <span style={{ color: TEXT, fontSize: 13, flex: 1 }}>{opt}</span>
          <button
            style={{ ...btn('transparent', DIM), padding: '2px 6px', fontSize: 11 }}
            onClick={() => moveOption(i, -1)}
            disabled={i === 0}
          >
            ▲
          </button>
          <button
            style={{ ...btn('transparent', DIM), padding: '2px 6px', fontSize: 11 }}
            onClick={() => moveOption(i, 1)}
            disabled={i === options.length - 1}
          >
            ▼
          </button>
          <button
            style={{ ...btn('transparent', RED), padding: '2px 6px', fontSize: 11 }}
            onClick={() => removeOption(i)}
          >
            X
          </button>
        </div>
      ))}
      {options.length === 0 && (
        <div style={{ color: DIM, fontSize: 12, fontStyle: 'italic', padding: '6px 0' }}>
          No options defined yet. Add at least one option above.
        </div>
      )}
    </div>
  );
}

/* ── Validation Rules Editor ── */
function ValidationEditor({
  fieldType,
  validation,
  onChange,
}: {
  fieldType: FieldType;
  validation: ValidationRule;
  onChange: (v: ValidationRule) => void;
}) {
  const showMinMax = fieldType === 'number';
  const showRegex = fieldType === 'text';

  if (!showMinMax && !showRegex) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <span style={{ ...labelStyle(), color: PURPLE, fontSize: 12 }}>
        Validation Rules
      </span>
      <div
        style={{
          background: BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          padding: 14,
        }}
      >
        {showMinMax && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <span style={labelStyle()}>Minimum Value</span>
              <input
                style={inputStyle()}
                type="number"
                value={validation.min ?? ''}
                onChange={(e) =>
                  onChange({
                    ...validation,
                    min: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                placeholder="No minimum"
              />
            </div>
            <div>
              <span style={labelStyle()}>Maximum Value</span>
              <input
                style={inputStyle()}
                type="number"
                value={validation.max ?? ''}
                onChange={(e) =>
                  onChange({
                    ...validation,
                    max: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                placeholder="No maximum"
              />
            </div>
          </div>
        )}
        {showRegex && (
          <div>
            <div style={{ marginBottom: 10 }}>
              <span style={labelStyle()}>Regex Pattern</span>
              <input
                style={inputStyle()}
                value={validation.regex ?? ''}
                onChange={(e) =>
                  onChange({
                    ...validation,
                    regex: e.target.value || null,
                  })
                }
                placeholder="e.g. ^[A-Z]{2}-\\d{4}$"
              />
            </div>
            <div>
              <span style={labelStyle()}>Regex Error Message</span>
              <input
                style={inputStyle()}
                value={validation.regexMessage ?? ''}
                onChange={(e) =>
                  onChange({
                    ...validation,
                    regexMessage: e.target.value || null,
                  })
                }
                placeholder="e.g. Must match format XX-0000"
              />
            </div>
            {validation.regex && (
              <div style={{ marginTop: 8, color: PURPLE, fontSize: 11 }}>
                Test: {(() => {
                  try {
                    new RegExp(validation.regex);
                    return 'Valid regex pattern';
                  } catch {
                    return 'Invalid regex pattern';
                  }
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Validation Rules Display ── */
function ValidationRulesDisplay({ field }: { field: CustomField }) {
  const rules: string[] = [];
  if (field.required) rules.push('This field is required');
  if (field.field_type === 'url') rules.push('Must be a valid URL (http/https)');
  if (field.field_type === 'number') {
    rules.push('Must be a numeric value');
    if (field.validation?.min != null) rules.push(`Minimum value: ${field.validation.min}`);
    if (field.validation?.max != null) rules.push(`Maximum value: ${field.validation.max}`);
  }
  if (field.field_type === 'text' && field.validation?.regex) {
    rules.push(`Must match pattern: ${field.validation.regex}`);
    if (field.validation.regexMessage) {
      rules.push(`Error: ${field.validation.regexMessage}`);
    }
  }
  if (field.field_type === 'date') rules.push('Must be a valid date');
  if (field.field_type === 'select') rules.push('Must select one of the defined options');
  if (field.field_type === 'multiselect') rules.push('Must select one or more options');
  if (field.field_type === 'file') rules.push('Must attach a file');
  if (field.default_value) rules.push(`Default value: "${field.default_value}"`);
  if (rules.length === 0) rules.push('No special validation rules');

  return (
    <div style={{ marginTop: 8 }}>
      <span style={{ ...labelStyle(), fontSize: 11, color: AMBER }}>Validation Rules</span>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {rules.map((r, i) => (
          <li key={i} style={{ color: DIM, fontSize: 12, marginBottom: 2 }}>
            {r}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Delete Confirmation Modal ── */
function DeleteModal({
  field,
  onConfirm,
  onCancel,
}: {
  field: CustomField;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={onCancel}
    >
      <div
        style={{ ...cardStyle(), maxWidth: 440, width: '90%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ color: RED, margin: '0 0 12px', fontSize: 16 }}>
          Delete Custom Field
        </h3>
        <p style={{ color: TEXT, fontSize: 13, margin: '0 0 8px' }}>
          Are you sure you want to delete{' '}
          <strong style={{ color: GOLD }}>{field.field_label}</strong>?
        </p>
        <p style={{ color: DIM, fontSize: 12, margin: '0 0 18px' }}>
          This will remove the field definition and any associated data from all records in
          the <strong> {field.module}</strong> module. This action cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button style={btn(BORDER, TEXT)} onClick={onCancel}>
            Cancel
          </button>
          <button style={btn(RED)} onClick={onConfirm}>
            Delete Field
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Module Summary Modal ── */
function ModuleSummaryModal({
  summaries,
  onClose,
}: {
  summaries: ModuleSummary[];
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{ ...cardStyle(), maxWidth: 600, width: '90%', maxHeight: '80vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ color: GOLD, margin: 0, fontSize: 16 }}>
            Module-Level Summary
          </h3>
          <button style={{ ...btn('transparent', DIM), padding: '4px 10px' }} onClick={onClose}>
            Close
          </button>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr',
            gap: 8,
            padding: '8px 0',
            fontSize: 11,
            fontWeight: 700,
            color: DIM,
            textTransform: 'uppercase',
            letterSpacing: '.5px',
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          <span>Module</span>
          <span>Total Fields</span>
          <span>Active</span>
          <span>Required</span>
        </div>
        {summaries.map((s) => (
          <div
            key={s.module}
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr 1fr',
              gap: 8,
              padding: '10px 0',
              borderBottom: `1px solid ${BORDER}`,
              alignItems: 'center',
            }}
          >
            <span style={{ color: TEXT, fontSize: 13, fontWeight: 600 }}>{s.module}</span>
            <span style={{ color: GOLD, fontSize: 14, fontWeight: 700 }}>{s.total}</span>
            <span style={{ color: GREEN, fontSize: 14, fontWeight: 700 }}>{s.active}</span>
            <span style={{ color: AMBER, fontSize: 14, fontWeight: 700 }}>{s.required}</span>
          </div>
        ))}
        {summaries.length === 0 && (
          <div style={{ textAlign: 'center', padding: 30, color: DIM, fontSize: 13 }}>
            No summary data available
          </div>
        )}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr',
            gap: 8,
            padding: '12px 0 0',
            fontWeight: 700,
            fontSize: 13,
            borderTop: `2px solid ${GOLD}`,
            marginTop: 8,
          }}
        >
          <span style={{ color: GOLD }}>Totals</span>
          <span style={{ color: GOLD }}>{summaries.reduce((a, s) => a + s.total, 0)}</span>
          <span style={{ color: GREEN }}>{summaries.reduce((a, s) => a + s.active, 0)}</span>
          <span style={{ color: AMBER }}>{summaries.reduce((a, s) => a + s.required, 0)}</span>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ══════════════════════════════════════════════════════ */
export default function CustomFieldsPage() {
  const [activeModule, setActiveModule] = useState<ModuleName>('Projects');
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomField | null>(null);
  const [formData, setFormData] = useState<CustomField>(emptyField(activeModule, 0));
  const [formValidation, setFormValidation] = useState<ValidationRule>(emptyValidation());
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [showPreview, setShowPreview] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [moduleSummaries, setModuleSummaries] = useState<ModuleSummary[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── Toast helper ── */
  const flash = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  /* ── Load fields for active module ── */
  const loadFields = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/custom-fields?module=${encodeURIComponent(activeModule)}`
      );
      if (!r.ok) throw new Error(`Failed to load fields (${r.status})`);
      const data = await r.json();
      setFields(data.fields || data || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load fields';
      setError(message);
      setFields([]);
    } finally {
      setLoading(false);
    }
  }, [activeModule]);

  useEffect(() => {
    loadFields();
  }, [loadFields]);

  /* ── Load module summaries ── */
  const loadSummaries = async () => {
    setLoadingSummary(true);
    try {
      const r = await fetch('/api/custom-fields?summary=true');
      if (!r.ok) throw new Error('Failed to load summaries');
      const data = await r.json();
      setModuleSummaries(data.summaries || data || []);
    } catch {
      const fallbackSummaries: ModuleSummary[] = MODULES.map((mod) => ({
        module: mod,
        total: mod === activeModule ? fields.length : 0,
        active: mod === activeModule ? fields.filter((f) => f.is_active).length : 0,
        required: mod === activeModule ? fields.filter((f) => f.required).length : 0,
      }));
      setModuleSummaries(fallbackSummaries);
    } finally {
      setLoadingSummary(false);
      setShowSummaryModal(true);
    }
  };

  /* ── Filtered fields ── */
  const filteredFields = useMemo(() => {
    if (!searchTerm) return fields;
    const q = searchTerm.toLowerCase();
    return fields.filter(
      (f) =>
        f.field_label.toLowerCase().includes(q) ||
        f.field_name.toLowerCase().includes(q) ||
        f.field_type.toLowerCase().includes(q)
    );
  }, [fields, searchTerm]);

  /* ── Save field (create or update) ── */
  const saveField = async () => {
    if (!formData.field_name.trim() || !formData.field_label.trim()) {
      flash('Field name and label are required', 'err');
      return;
    }
    if (
      (formData.field_type === 'select' || formData.field_type === 'multiselect') &&
      (!formData.options || formData.options.length === 0)
    ) {
      flash('Select fields require at least one option', 'err');
      return;
    }
    if (formData.field_type === 'text' && formValidation.regex) {
      try {
        new RegExp(formValidation.regex);
      } catch {
        flash('Invalid regex pattern in validation rules', 'err');
        return;
      }
    }
    if (
      formData.field_type === 'number' &&
      formValidation.min != null &&
      formValidation.max != null &&
      formValidation.min > formValidation.max
    ) {
      flash('Minimum value cannot be greater than maximum value', 'err');
      return;
    }

    setSaving(true);
    try {
      const hasValidation =
        formValidation.min != null ||
        formValidation.max != null ||
        formValidation.regex != null;
      const payload: CustomField = {
        ...formData,
        module: activeModule,
        validation: hasValidation ? formValidation : null,
      };
      if (!editingId) {
        payload.sort_order = fields.length;
      }
      const r = await fetch('/api/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { ...payload, id: editingId } : payload),
      });
      if (!r.ok) throw new Error('Save failed');
      flash(editingId ? 'Field updated successfully' : 'Field created successfully');
      resetForm();
      await loadFields();
    } catch {
      flash('Failed to save field', 'err');
    } finally {
      setSaving(false);
    }
  };

  /* ── Delete field ── */
  const deleteField = async (f: CustomField) => {
    try {
      const r = await fetch('/api/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: f.id, _delete: true }),
      });
      if (!r.ok) throw new Error('Delete failed');
      flash('Field deleted');
      setDeleteTarget(null);
      await loadFields();
    } catch {
      flash('Failed to delete field', 'err');
    }
  };

  /* ── Toggle active ── */
  const toggleActive = async (f: CustomField) => {
    try {
      await fetch('/api/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: f.id, is_active: !f.is_active }),
      });
      await loadFields();
    } catch {
      flash('Failed to toggle status', 'err');
    }
  };

  /* ── Reorder (click-based drag simulation) ── */
  const reorder = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= fields.length) return;
    const updated = [...fields];
    [updated[idx], updated[target]] = [updated[target], updated[idx]];
    updated.forEach((f, i) => (f.sort_order = i));
    setFields(updated);
    try {
      await fetch('/api/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _reorder: true,
          module: activeModule,
          order: updated.map((f) => f.id),
        }),
      });
    } catch {
      flash('Failed to save new order', 'err');
      await loadFields();
    }
  };

  /* ── Edit field ── */
  const startEdit = (f: CustomField) => {
    setEditingId(f.id || null);
    setFormData({ ...f });
    setFormValidation(f.validation || emptyValidation());
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ── Reset form ── */
  const resetForm = () => {
    setEditingId(null);
    setFormData(emptyField(activeModule, fields.length));
    setFormValidation(emptyValidation());
    setShowForm(false);
  };

  /* ── Auto-generate field_name from label ── */
  const handleLabelChange = (val: string) => {
    setFormData((prev) => ({
      ...prev,
      field_label: val,
      field_name: editingId
        ? prev.field_name
        : val
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, ''),
    }));
  };

  /* ── Import/Export ── */
  const exportFields = () => {
    const exportData = fields.map((f) => ({
      field_name: f.field_name,
      field_label: f.field_label,
      field_type: f.field_type,
      options: f.options,
      required: f.required,
      default_value: f.default_value,
      sort_order: f.sort_order,
      is_active: f.is_active,
      validation: f.validation,
    }));
    const data = JSON.stringify(exportData, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `custom-fields-${activeModule.toLowerCase().replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    flash(`Exported ${fields.length} fields as JSON`);
  };

  const importFields = () => {
    const el = document.createElement('input');
    el.type = 'file';
    el.accept = '.json';
    el.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported: CustomField[] = JSON.parse(text);
        if (!Array.isArray(imported)) throw new Error('Invalid format');
        let count = 0;
        for (const f of imported) {
          if (!f.field_name || !f.field_label || !f.field_type) continue;
          await fetch('/api/custom-fields', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...f,
              id: undefined,
              module: activeModule,
              sort_order: fields.length + count,
            }),
          });
          count++;
        }
        flash(`Imported ${count} field${count !== 1 ? 's' : ''} successfully`);
        await loadFields();
      } catch {
        flash('Failed to import -- invalid or malformed JSON file', 'err');
      }
    };
    el.click();
  };

  /* ── Stats summary ── */
  const stats = useMemo(() => {
    const total = fields.length;
    const active = fields.filter((f) => f.is_active).length;
    const required = fields.filter((f) => f.required).length;
    const byType: Record<string, number> = {};
    fields.forEach((f) => {
      byType[f.field_type] = (byType[f.field_type] || 0) + 1;
    });
    return { total, active, required, byType };
  }, [fields]);

  /* ══════════ RENDER ══════════ */
  return (
    <div
      style={{
        background: BG,
        minHeight: '100vh',
        color: TEXT,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 10000,
            background: toast.type === 'ok' ? GREEN : RED,
            color: '#fff',
            padding: '10px 20px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 4px 20px rgba(0,0,0,.4)',
            maxWidth: 360,
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <DeleteModal
          field={deleteTarget}
          onConfirm={() => deleteField(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Module Summary Modal */}
      {showSummaryModal && (
        <ModuleSummaryModal
          summaries={moduleSummaries}
          onClose={() => setShowSummaryModal(false)}
        />
      )}

      {/* ── Header ── */}
      <div
        style={{
          padding: '28px 32px 0',
          borderBottom: `1px solid ${BORDER}`,
          background: RAISED,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 18,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: GOLD }}>
              Custom Field Definitions
            </h1>
            <p style={{ margin: '4px 0 0', color: DIM, fontSize: 13 }}>
              Define and manage custom fields for each module across your projects
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              style={btn(BORDER, DIM)}
              onClick={() => loadSummaries()}
              disabled={loadingSummary}
            >
              {loadingSummary ? 'Loading...' : 'Module Summary'}
            </button>
            <button style={btn(BORDER, DIM)} onClick={importFields}>
              Import JSON
            </button>
            <button style={btn(BORDER, DIM)} onClick={exportFields}>
              Export JSON
            </button>
            <button
              style={btn(GOLD, BG)}
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
            >
              + New Field
            </button>
          </div>
        </div>

        {/* Module Tabs */}
        <div style={{ display: 'flex', gap: 0, overflowX: 'auto', paddingBottom: 0 }}>
          {MODULES.map((mod) => {
            const isActive = mod === activeModule;
            return (
              <button
                key={mod}
                onClick={() => {
                  setActiveModule(mod);
                  setSearchTerm('');
                  setShowForm(false);
                  setShowPreview(null);
                }}
                style={{
                  background: isActive ? BG : 'transparent',
                  color: isActive ? GOLD : DIM,
                  border: 'none',
                  borderBottom: isActive
                    ? `2px solid ${GOLD}`
                    : '2px solid transparent',
                  padding: '10px 16px',
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all .15s',
                }}
              >
                {mod}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
        {/* Error Banner */}
        {error && (
          <div
            style={{
              background: `${RED}22`,
              border: `1px solid ${RED}`,
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ color: RED, fontSize: 13 }}>{error}</span>
            <button style={btn(RED, '#fff')} onClick={loadFields}>
              Retry
            </button>
          </div>
        )}

        {/* Stats Row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 14,
            marginBottom: 20,
          }}
        >
          {[
            { label: 'Total Fields', value: stats.total, color: GOLD },
            { label: 'Active', value: stats.active, color: GREEN },
            { label: 'Required', value: stats.required, color: AMBER },
            {
              label: 'Field Types',
              value: Object.keys(stats.byType).length,
              color: BLUE,
            },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                ...cardStyle(),
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: 16,
                marginBottom: 0,
              }}
            >
              <span style={{ fontSize: 28, fontWeight: 800, color: s.color }}>
                {s.value}
              </span>
              <span style={{ color: DIM, fontSize: 12, fontWeight: 600 }}>
                {s.label}
              </span>
            </div>
          ))}
        </div>

        {/* Search Bar */}
        <div style={{ marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            style={{ ...inputStyle(), maxWidth: 360 }}
            placeholder="Search fields by name, label, or type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              style={{ ...btn('transparent', DIM), padding: '6px 10px', fontSize: 12 }}
              onClick={() => setSearchTerm('')}
            >
              Clear
            </button>
          )}
          <span style={{ color: DIM, fontSize: 12, marginLeft: 'auto' }}>
            Showing {filteredFields.length} of {fields.length} fields
          </span>
        </div>

        {/* ── Create / Edit Form ── */}
        {showForm && (
          <div style={{ ...cardStyle(), borderColor: GOLD, borderWidth: 1 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <h3 style={{ margin: 0, color: GOLD, fontSize: 15 }}>
                {editingId ? 'Edit Field' : 'Create New Field'}
              </h3>
              <button
                style={{ ...btn('transparent', DIM), padding: '4px 10px' }}
                onClick={resetForm}
              >
                Cancel
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 14,
              }}
            >
              {/* Label */}
              <div>
                <span style={labelStyle()}>Field Label *</span>
                <input
                  style={inputStyle()}
                  value={formData.field_label}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  placeholder="e.g. Project Manager Email"
                />
              </div>
              {/* Name (auto-generated) */}
              <div>
                <span style={labelStyle()}>
                  Field Name {editingId ? '(read-only)' : '(auto-generated)'}
                </span>
                <input
                  style={{ ...inputStyle(), opacity: editingId ? 0.6 : 1 }}
                  value={formData.field_name}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      field_name: e.target.value,
                    }))
                  }
                  placeholder="project_manager_email"
                  readOnly={!!editingId}
                />
              </div>
              {/* Type */}
              <div>
                <span style={labelStyle()}>Field Type *</span>
                <select
                  style={{ ...inputStyle(), appearance: 'auto' }}
                  value={formData.field_type}
                  onChange={(e) => {
                    const ft = e.target.value as FieldType;
                    setFormData((prev) => ({
                      ...prev,
                      field_type: ft,
                      options:
                        ft === 'select' || ft === 'multiselect'
                          ? prev.options || []
                          : null,
                    }));
                    if (ft !== 'number' && ft !== 'text') {
                      setFormValidation(emptyValidation());
                    }
                  }}
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {FIELD_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              {/* Default Value */}
              <div>
                <span style={labelStyle()}>Default Value</span>
                <input
                  style={inputStyle()}
                  value={formData.default_value}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      default_value: e.target.value,
                    }))
                  }
                  placeholder="Optional default value"
                />
              </div>
            </div>

            {/* Required Toggle */}
            <div
              style={{
                marginTop: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div
                onClick={() =>
                  setFormData((prev) => ({ ...prev, required: !prev.required }))
                }
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  cursor: 'pointer',
                  background: formData.required ? GREEN : BORDER,
                  position: 'relative',
                  transition: 'background .2s',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: '#fff',
                    position: 'absolute',
                    top: 3,
                    left: formData.required ? 23 : 3,
                    transition: 'left .2s',
                  }}
                />
              </div>
              <span style={{ color: TEXT, fontSize: 13 }}>
                Required field
              </span>
            </div>

            {/* Active Toggle */}
            <div
              style={{
                marginTop: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div
                onClick={() =>
                  setFormData((prev) => ({
                    ...prev,
                    is_active: !prev.is_active,
                  }))
                }
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  cursor: 'pointer',
                  background: formData.is_active ? BLUE : BORDER,
                  position: 'relative',
                  transition: 'background .2s',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: '#fff',
                    position: 'absolute',
                    top: 3,
                    left: formData.is_active ? 23 : 3,
                    transition: 'left .2s',
                  }}
                />
              </div>
              <span style={{ color: TEXT, fontSize: 13 }}>
                Active (visible to users)
              </span>
            </div>

            {/* Options Editor for select/multiselect */}
            {(formData.field_type === 'select' ||
              formData.field_type === 'multiselect') && (
              <OptionsEditor
                options={formData.options || []}
                onChange={(opts) =>
                  setFormData((prev) => ({ ...prev, options: opts }))
                }
              />
            )}

            {/* Validation Rules Editor */}
            <ValidationEditor
              fieldType={formData.field_type}
              validation={formValidation}
              onChange={setFormValidation}
            />

            {/* Field Preview */}
            <div style={{ marginTop: 12 }}>
              <span style={{ ...labelStyle(), color: BLUE }}>
                Live Preview
              </span>
              <FieldPreview
                field={{
                  ...formData,
                  validation: formValidation,
                }}
              />
            </div>

            {/* Validation Summary */}
            <ValidationRulesDisplay
              field={{ ...formData, validation: formValidation }}
            />

            {/* Save / Cancel Buttons */}
            <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
              <button
                style={{
                  ...btn(GOLD, BG),
                  opacity: saving ? 0.6 : 1,
                }}
                onClick={saveField}
                disabled={saving}
              >
                {saving
                  ? 'Saving...'
                  : editingId
                  ? 'Update Field'
                  : 'Create Field'}
              </button>
              <button style={btn(BORDER, DIM)} onClick={resetForm}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Fields List ── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: DIM }}>
            <div
              style={{
                width: 36,
                height: 36,
                border: `3px solid ${BORDER}`,
                borderTopColor: GOLD,
                borderRadius: '50%',
                margin: '0 auto 12px',
                animation: 'spin 1s linear infinite',
              }}
            />
            <div style={{ fontSize: 14 }}>Loading custom fields...</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : filteredFields.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: DIM }}>
            <div style={{ fontSize: 14, marginBottom: 6 }}>
              {searchTerm
                ? `No fields match "${searchTerm}"`
                : `No custom fields defined for ${activeModule}`}
            </div>
            {!searchTerm && (
              <div style={{ fontSize: 12 }}>
                Click{' '}
                <strong style={{ color: GOLD }}>+ New Field</strong> to create
                one, or use <strong style={{ color: DIM }}>Import JSON</strong>{' '}
                to load a configuration.
              </div>
            )}
          </div>
        ) : (
          <div>
            {/* Column Headers */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '40px 2fr 1fr 80px 70px 80px 140px',
                gap: 8,
                padding: '8px 16px',
                fontSize: 11,
                fontWeight: 700,
                color: DIM,
                textTransform: 'uppercase',
                letterSpacing: '.5px',
              }}
            >
              <span>#</span>
              <span>Label / Name</span>
              <span>Type</span>
              <span>Required</span>
              <span>Status</span>
              <span>Order</span>
              <span>Actions</span>
            </div>

            {/* Field Rows */}
            {filteredFields.map((field, idx) => {
              const isExpanded = showPreview === field.id;
              return (
                <div key={field.id || idx}>
                  <div
                    style={{
                      ...cardStyle(),
                      marginBottom: 6,
                      opacity: field.is_active ? 1 : 0.5,
                      borderColor: isExpanded ? GOLD : BORDER,
                      display: 'grid',
                      gridTemplateColumns: '40px 2fr 1fr 80px 70px 80px 140px',
                      gap: 8,
                      alignItems: 'center',
                      padding: '12px 16px',
                    }}
                  >
                    {/* Sort Position */}
                    <span
                      style={{
                        color: DIM,
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {field.sort_order + 1}
                    </span>

                    {/* Label / Name */}
                    <div>
                      <div
                        style={{
                          color: TEXT,
                          fontSize: 14,
                          fontWeight: 600,
                        }}
                      >
                        {field.field_label}
                        {field.required && (
                          <span
                            style={{
                              color: RED,
                              marginLeft: 4,
                              fontSize: 12,
                            }}
                          >
                            *
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          color: DIM,
                          fontSize: 11,
                          fontFamily: 'monospace',
                        }}
                      >
                        {field.field_name}
                      </div>
                    </div>

                    {/* Type Badge */}
                    <div>
                      <span
                        style={{
                          background: BORDER,
                          color: BLUE,
                          borderRadius: 4,
                          padding: '2px 8px',
                          fontSize: 11,
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <span style={{ color: PURPLE, fontSize: 10 }}>
                          {FIELD_TYPE_ICONS[field.field_type]}
                        </span>
                        {FIELD_TYPE_LABELS[field.field_type] || field.field_type}
                      </span>
                      {field.options && field.options.length > 0 && (
                        <span
                          style={{
                            color: DIM,
                            fontSize: 10,
                            marginLeft: 6,
                          }}
                        >
                          ({field.options.length} opts)
                        </span>
                      )}
                    </div>

                    {/* Required */}
                    <span
                      style={{
                        color: field.required ? AMBER : DIM,
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {field.required ? 'Yes' : 'No'}
                    </span>

                    {/* Active Toggle */}
                    <div
                      onClick={() => toggleActive(field)}
                      style={{
                        width: 38,
                        height: 20,
                        borderRadius: 10,
                        cursor: 'pointer',
                        background: field.is_active ? GREEN : BORDER,
                        position: 'relative',
                        transition: 'background .2s',
                      }}
                    >
                      <div
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          background: '#fff',
                          position: 'absolute',
                          top: 3,
                          left: field.is_active ? 21 : 3,
                          transition: 'left .2s',
                        }}
                      />
                    </div>

                    {/* Reorder */}
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        style={{
                          ...btn(BORDER, DIM),
                          padding: '3px 8px',
                          fontSize: 11,
                        }}
                        onClick={() => reorder(idx, -1)}
                        disabled={idx === 0}
                        title="Move up"
                      >
                        ▲
                      </button>
                      <button
                        style={{
                          ...btn(BORDER, DIM),
                          padding: '3px 8px',
                          fontSize: 11,
                        }}
                        onClick={() => reorder(idx, 1)}
                        disabled={idx === filteredFields.length - 1}
                        title="Move down"
                      >
                        ▼
                      </button>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        style={{
                          ...btn('transparent', BLUE),
                          padding: '3px 8px',
                          fontSize: 11,
                        }}
                        onClick={() =>
                          setShowPreview(
                            isExpanded ? null : field.id || null
                          )
                        }
                        title="Preview"
                      >
                        {isExpanded ? 'Hide' : 'Preview'}
                      </button>
                      <button
                        style={{
                          ...btn('transparent', GOLD),
                          padding: '3px 8px',
                          fontSize: 11,
                        }}
                        onClick={() => startEdit(field)}
                        title="Edit"
                      >
                        Edit
                      </button>
                      <button
                        style={{
                          ...btn('transparent', RED),
                          padding: '3px 8px',
                          fontSize: 11,
                        }}
                        onClick={() => setDeleteTarget(field)}
                        title="Delete"
                      >
                        Del
                      </button>
                    </div>
                  </div>

                  {/* Expanded Preview/Validation Panel */}
                  {isExpanded && (
                    <div
                      style={{
                        ...cardStyle(),
                        marginTop: -4,
                        marginBottom: 10,
                        borderTop: 'none',
                        borderTopLeftRadius: 0,
                        borderTopRightRadius: 0,
                        borderColor: GOLD,
                      }}
                    >
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: 16,
                        }}
                      >
                        <div>
                          <span style={{ ...labelStyle(), color: BLUE }}>
                            Field Preview
                          </span>
                          <FieldPreview field={field} />
                        </div>
                        <div>
                          <ValidationRulesDisplay field={field} />
                          {field.default_value && (
                            <div style={{ marginTop: 10 }}>
                              <span style={labelStyle()}>Default Value</span>
                              <span style={{ color: TEXT, fontSize: 13 }}>
                                {field.default_value}
                              </span>
                            </div>
                          )}
                          {(field.field_type === 'select' ||
                            field.field_type === 'multiselect') &&
                            field.options && (
                              <div style={{ marginTop: 10 }}>
                                <span style={labelStyle()}>
                                  Defined Options ({field.options.length})
                                </span>
                                <div
                                  style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: 4,
                                    marginTop: 4,
                                  }}
                                >
                                  {field.options.map((o, i) => (
                                    <span
                                      key={i}
                                      style={{
                                        background: BORDER,
                                        color: TEXT,
                                        borderRadius: 10,
                                        padding: '2px 10px',
                                        fontSize: 11,
                                      }}
                                    >
                                      {o}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          {field.validation && (
                            <div style={{ marginTop: 10 }}>
                              <span
                                style={{
                                  ...labelStyle(),
                                  color: PURPLE,
                                }}
                              >
                                Custom Validation
                              </span>
                              {field.validation.min != null && (
                                <div style={{ color: TEXT, fontSize: 12 }}>
                                  Min: {field.validation.min}
                                </div>
                              )}
                              {field.validation.max != null && (
                                <div style={{ color: TEXT, fontSize: 12 }}>
                                  Max: {field.validation.max}
                                </div>
                              )}
                              {field.validation.regex && (
                                <div style={{ color: TEXT, fontSize: 12 }}>
                                  Pattern: {field.validation.regex}
                                </div>
                              )}
                            </div>
                          )}
                          <div style={{ marginTop: 10 }}>
                            <span style={labelStyle()}>Module</span>
                            <span
                              style={{
                                color: GOLD,
                                fontSize: 13,
                                fontWeight: 600,
                              }}
                            >
                              {field.module}
                            </span>
                          </div>
                          {field.created_at && (
                            <div style={{ marginTop: 6 }}>
                              <span style={labelStyle()}>Created</span>
                              <span style={{ color: DIM, fontSize: 12 }}>
                                {new Date(field.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Footer ── */}
        <div
          style={{
            marginTop: 32,
            padding: '16px 0',
            borderTop: `1px solid ${BORDER}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ color: DIM, fontSize: 12 }}>
            {fields.length} field{fields.length !== 1 ? 's' : ''} defined for{' '}
            {activeModule}
            {fields.filter((f) => !f.is_active).length > 0 &&
              ` (${fields.filter((f) => !f.is_active).length} inactive)`}
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button style={btn(BORDER, DIM)} onClick={importFields}>
              Import
            </button>
            <button style={btn(BORDER, DIM)} onClick={exportFields}>
              Export
            </button>
            <button
              style={btn(GOLD, BG)}
              onClick={() => {
                resetForm();
                setShowForm(true);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              + Add Field
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
