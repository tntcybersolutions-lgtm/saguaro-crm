/**
 * The 20 sections of a daily log — the same set Procore's Daily Log carries
 * (weather, manpower, notes, timecards, equipment, visitors, phone calls,
 * inspections, deliveries, scheduled work, safety violations, plan revisions,
 * accidents, quantities, productivity, dumpster, waste, photos, delays, daily
 * construction report).
 *
 * Every section is a list of rows; each row has the fields below. Rows live in
 * daily_logs.log_sections[<key>]. Sections the older daily-log screen, the PDF
 * and the export already read (weather, manpower, equipment, visitors,
 * deliveries, accidents, delays, notes, the report) are ALSO written back to
 * their original columns by `mirrorColumns`, so nothing that reads a daily log
 * today loses data.
 */

export type SectionFieldKind = 'text' | 'long' | 'number' | 'time' | 'select' | 'bool';
export type SectionField = { key: string; label: string; kind: SectionFieldKind; options?: string[]; required?: boolean };
export type LogSection = { key: string; label: string; hint: string; fields: SectionField[]; photos?: boolean };

const t = (key: string, label: string, required = false): SectionField => ({ key, label, kind: 'text', required });
const n = (key: string, label: string): SectionField => ({ key, label, kind: 'number' });
const s = (key: string, label: string, options: string[]): SectionField => ({ key, label, kind: 'select', options });
const tm = (key: string, label: string): SectionField => ({ key, label, kind: 'time' });
const b = (key: string, label: string): SectionField => ({ key, label, kind: 'bool' });
const l = (key: string, label: string, required = false): SectionField => ({ key, label, kind: 'long', required });

export const LOG_SECTIONS: LogSection[] = [
  { key: 'weather', label: 'Weather', hint: 'Conditions through the day and whether they stopped work.', fields: [s('time_of_day', 'Time', ['Morning', 'Midday', 'Afternoon', 'Evening']), s('conditions', 'Conditions', ['Clear', 'Partly cloudy', 'Overcast', 'Rain', 'Thunderstorm', 'Snow', 'Fog', 'Windy', 'Extreme heat']), n('temp_f', 'Temp °F'), t('wind', 'Wind'), t('precipitation', 'Precipitation'), b('delay', 'Stopped work'), t('notes', 'Notes')] },
  { key: 'manpower', label: 'Manpower', hint: 'Who was on site, how many, and for how long.', fields: [t('company', 'Company', true), t('trade', 'Trade'), n('workers', 'Workers'), n('hours', 'Hours each'), t('location', 'Location'), t('notes', 'Notes')] },
  { key: 'notes', label: 'Notes', hint: 'Anything worth recording for the day.', fields: [s('category', 'Category', ['General', 'Issue', 'Owner', 'Design', 'Quality', 'Schedule']), t('location', 'Location'), l('note', 'Note', true)] },
  { key: 'timecards', label: 'Timecards', hint: 'Hours by person and cost code.', fields: [t('employee', 'Employee', true), t('company', 'Company'), t('cost_code', 'Cost code'), n('hours', 'Hours'), b('billable', 'Billable'), t('description', 'Work done')] },
  { key: 'equipment', label: 'Equipment', hint: 'Machines on site and how much they ran.', fields: [t('name', 'Equipment', true), t('company', 'Company'), n('hours_used', 'Hours used'), n('hours_idle', 'Hours idle'), t('cost_code', 'Cost code'), b('inspected', 'Inspected'), t('notes', 'Notes')] },
  { key: 'visitors', label: 'Visitors', hint: 'Who came to site and why.', fields: [t('name', 'Name', true), t('company', 'Company'), t('purpose', 'Purpose'), tm('time_in', 'In'), tm('time_out', 'Out')] },
  { key: 'phone_calls', label: 'Phone calls', hint: 'Calls that matter to the job.', fields: [t('with', 'With', true), t('company', 'Company'), s('direction', 'Direction', ['Incoming', 'Outgoing']), tm('time', 'Time'), t('subject', 'Subject')] },
  { key: 'inspections', label: 'Inspections', hint: 'Inspections held today and the result.', fields: [t('type', 'Inspection', true), t('inspector', 'Inspector'), t('agency', 'Agency'), s('result', 'Result', ['Passed', 'Failed', 'Partial', 'Re-inspect']), t('area', 'Area'), t('notes', 'Notes')] },
  { key: 'deliveries', label: 'Deliveries', hint: 'Material received on site.', fields: [t('vendor', 'Vendor', true), t('item', 'Item'), t('quantity', 'Quantity'), t('tracking', 'Ticket / PO'), t('received_by', 'Received by'), tm('time', 'Time')] },
  { key: 'scheduled_work', label: 'Scheduled work', hint: 'Planned activities and where they stand.', fields: [t('activity', 'Activity', true), t('company', 'Company'), s('status', 'Status', ['Not started', 'Started', 'Ongoing', 'Completed', 'Delayed']), n('percent', '% done'), t('notes', 'Notes')] },
  { key: 'safety_violations', label: 'Safety violations', hint: 'Violations seen and what was done.', fields: [t('issued_to', 'Issued to', true), t('company', 'Company'), t('violation', 'Violation'), tm('time', 'Time'), t('action_taken', 'Action taken')] },
  { key: 'plan_revisions', label: 'Plan revisions', hint: 'Drawings or specs revised today.', fields: [t('drawing', 'Drawing / spec', true), t('revision', 'Revision'), t('description', 'What changed'), t('received_from', 'Received from')] },
  { key: 'accidents', label: 'Accidents', hint: 'Anything that hurt someone or damaged something.', fields: [t('party', 'Person involved', true), t('company', 'Company'), tm('time', 'Time'), l('description', 'What happened'), b('injury', 'Injury'), t('reported_to', 'Reported to')] },
  { key: 'quantities', label: 'Quantities', hint: 'Installed quantities by cost code.', fields: [t('cost_code', 'Cost code'), t('description', 'Item', true), n('quantity', 'Quantity'), t('unit', 'Unit'), t('location', 'Location')] },
  { key: 'productivity', label: 'Productivity', hint: 'Planned against actual output.', fields: [t('company', 'Company'), t('activity', 'Activity', true), n('planned_qty', 'Planned'), n('actual_qty', 'Actual'), t('unit', 'Unit'), t('notes', 'Notes')] },
  { key: 'dumpster', label: 'Dumpster', hint: 'Dumpsters delivered, swapped or removed.', fields: [t('company', 'Company', true), s('action', 'Action', ['Delivered', 'Swapped', 'Removed']), t('size', 'Size'), n('count', 'Count')] },
  { key: 'waste', label: 'Waste', hint: 'Waste hauled off and how it was handled.', fields: [t('material', 'Material', true), s('method', 'Method', ['Recycled', 'Landfill', 'Salvaged', 'Hazardous']), n('quantity', 'Quantity'), t('unit', 'Unit'), t('hauler', 'Hauler')] },
  { key: 'photos', label: 'Photos', hint: 'Site photos for the day.', fields: [], photos: true },
  { key: 'delays', label: 'Delays', hint: 'Lost time and who caused it.', fields: [s('type', 'Type', ['Weather', 'Owner', 'Design', 'Subcontractor', 'Material', 'Inspection', 'Labor', 'Other']), n('hours', 'Hours lost'), t('responsible', 'Responsible'), l('description', 'What happened', true)] },
  { key: 'daily_report', label: 'Daily construction report', hint: 'The day in a few lines: done, problems, tomorrow.', fields: [l('work_performed', 'Work performed', true), l('issues', 'Issues'), l('tomorrow', "Tomorrow's plan")] },
];

export const SECTION_KEYS = LOG_SECTIONS.map((x) => x.key);
export function logSection(key: string): LogSection | null {
  return LOG_SECTIONS.find((x) => x.key === key) || null;
}

export type SectionRow = Record<string, string | number | boolean | null>;

/** Validate and clean rows for a section: known fields only, typed values, required filled, max 200 rows. */
export function cleanRows(section: LogSection, rows: unknown): { rows: SectionRow[] } | { error: string } {
  if (!Array.isArray(rows)) return { error: 'Rows must be a list.' };
  if (rows.length > 200) return { error: 'Too many rows (200 max).' };
  const out: SectionRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i] as Record<string, unknown>;
    if (!raw || typeof raw !== 'object') return { error: `Row ${i + 1} is not valid.` };
    const row: SectionRow = {};
    for (const f of section.fields) {
      const v = raw[f.key];
      if (v === undefined || v === null || v === '') { row[f.key] = null; continue; }
      if (f.kind === 'number') {
        const num = Number(v);
        if (!Number.isFinite(num)) return { error: `${section.label} row ${i + 1}: ${f.label} must be a number.` };
        row[f.key] = num;
      } else if (f.kind === 'bool') {
        row[f.key] = v === true || v === 'true';
      } else if (f.kind === 'select') {
        const sv = String(v);
        if (f.options && !f.options.includes(sv)) return { error: `${section.label} row ${i + 1}: pick a ${f.label.toLowerCase()} from the list.` };
        row[f.key] = sv;
      } else if (f.kind === 'time') {
        const sv = String(v);
        if (!/^\d{2}:\d{2}$/.test(sv)) return { error: `${section.label} row ${i + 1}: ${f.label} must be a time like 07:30.` };
        row[f.key] = sv;
      } else {
        row[f.key] = String(v).slice(0, f.kind === 'long' ? 5000 : 300);
      }
    }
    const missing = section.fields.find((f) => f.required && (row[f.key] === null || row[f.key] === ''));
    const empty = section.fields.every((f) => row[f.key] === null || row[f.key] === false);
    if (empty) continue; // a blank row is dropped, not an error
    if (missing) return { error: `${section.label} row ${i + 1}: ${missing.label} is required.` };
    out.push(row);
  }
  return { rows: out };
}

const joinLines = (rows: SectionRow[], fmt: (r: SectionRow) => string) => rows.map(fmt).filter(Boolean).join('\n') || null;
const str = (v: unknown) => (v == null ? '' : String(v));

/** The original daily_logs columns a section also feeds (so the list, PDF and export keep working). */
export function mirrorColumns(key: string, rows: SectionRow[]): Record<string, unknown> {
  switch (key) {
    case 'weather': {
      const first = rows[0];
      const temps = rows.map((r) => Number(r.temp_f)).filter((x) => Number.isFinite(x));
      return {
        weather: first ? str(first.conditions) || null : null,
        high_temp: temps.length ? String(Math.max(...temps)) : null,
        low_temp: temps.length ? String(Math.min(...temps)) : null,
        precipitation: rows.map((r) => str(r.precipitation)).filter(Boolean).join(', ') || null,
        wind_conditions: rows.map((r) => str(r.wind)).filter(Boolean).join(', ') || null,
        work_stopped: rows.some((r) => r.delay === true),
      };
    }
    case 'manpower': {
      const total = rows.reduce((a, r) => a + (Number(r.workers) || 0), 0);
      return {
        manpower_by_trade: rows.map((r) => ({ trade: str(r.trade) || str(r.company), company: str(r.company), count: Number(r.workers) || 0, hours: Number(r.hours) || 0 })),
        manpower_count: total,
        crew_count: total,
      };
    }
    case 'equipment':
      return { equipment_on_site: rows.map((r) => str(r.name)).filter(Boolean) };
    case 'visitors':
      return { visitors: joinLines(rows, (r) => [r.name, r.company && `(${r.company})`, r.purpose && `— ${r.purpose}`].filter(Boolean).join(' ')) };
    case 'deliveries':
      return { materials_delivered: joinLines(rows, (r) => [r.vendor, r.item, r.quantity].filter(Boolean).join(' · ')) };
    case 'accidents':
      return { incidents: joinLines(rows, (r) => [r.party, r.description].filter(Boolean).join(': ')) };
    case 'delays': {
      const hours = rows.reduce((a, r) => a + (Number(r.hours) || 0), 0);
      return {
        delays: joinLines(rows, (r) => [r.type, r.hours != null ? `${r.hours} h` : '', r.description].filter(Boolean).join(' · ')),
        delay_hours: hours || null,
        delay_type: rows[0] ? str(rows[0].type) || null : null,
      };
    }
    case 'notes':
      return { notes: joinLines(rows, (r) => str(r.note)) };
    case 'daily_report': {
      const r = rows[0];
      return { work_performed: r ? str(r.work_performed) || null : null, issues: r ? str(r.issues) || null : null };
    }
    default:
      return {};
  }
}

/** For a log saved by the older screen: rows built from its original columns, so its data shows in the sections. */
export function rowsFromLegacy(key: string, log: Record<string, unknown>): SectionRow[] {
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  switch (key) {
    case 'weather':
      return log.weather || log.high_temp ? [{ time_of_day: null, conditions: null, temp_f: Number(log.high_temp) || null, wind: str(log.wind_conditions) || null, precipitation: str(log.precipitation) || null, delay: !!log.work_stopped, notes: str(log.weather) || null }] : [];
    case 'manpower':
      return arr(log.manpower_by_trade).map((m: Record<string, unknown>) => ({ company: str(m.company || m.trade) || null, trade: str(m.trade) || null, workers: Number(m.count) || null, hours: Number(m.hours) || null, location: null, notes: null }));
    case 'equipment':
      return arr(log.equipment_on_site).map((e: unknown) => ({ name: typeof e === 'string' ? e : str((e as Record<string, unknown>)?.name), company: null, hours_used: null, hours_idle: null, cost_code: null, inspected: null, notes: null }));
    case 'visitors':
      return str(log.visitors).split('\n').filter(Boolean).map((v) => ({ name: v, company: null, purpose: null, time_in: null, time_out: null }));
    case 'deliveries':
      return str(log.materials_delivered).split('\n').filter(Boolean).map((v) => ({ vendor: v, item: null, quantity: null, tracking: null, received_by: null, time: null }));
    case 'delays':
      return log.delays ? [{ type: null, hours: Number(log.delay_hours) || null, responsible: null, description: str(log.delays) }] : [];
    case 'notes':
      return log.notes ? [{ category: 'General', location: null, note: str(log.notes) }] : [];
    case 'accidents':
      return log.incidents ? [{ party: 'See note', company: null, time: null, description: str(log.incidents), injury: null, reported_to: null }] : [];
    case 'daily_report':
      return log.work_performed ? [{ work_performed: str(log.work_performed), issues: str(log.issues) || null, tomorrow: null }] : [];
    default:
      return [];
  }
}
