/**
 * In-memory stand-in for the Supabase query builder, for route tests that run
 * the real handlers. Supports the calls our routes make: select/insert/update/
 * upsert/delete, eq/neq/is/in/ilike/gte/or, order/limit, single/maybeSingle.
 */
export type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function makeFakeDb() {
  const tables: Record<string, Row[]> = {};
  let seq = 0;
  const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
  const T = (name: string) => (tables[name] ||= []);

  const likeToRe = (p: string) => {
    let out = '';
    for (let i = 0; i < p.length; i++) {
      const c = p[i];
      if (c === '\\' && i + 1 < p.length) { out += p[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue; }
      out += c === '%' ? '.*' : c === '_' ? '.' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(`^${out}$`, 'i');
  };
  /** PostgREST or() filter: "a.eq.1,b.ilike.%x%" and "and(a.eq.1,b.eq.2),and(…)". */
  const orFilter = (expr: string) => {
    const parts: string[] = [];
    let depth = 0, cur = '';
    for (const ch of expr) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (cur) parts.push(cur);
    const one = (cond: string) => {
      const [col, op, ...rest] = cond.split('.');
      const val = rest.join('.');
      return (r: Row) => op === 'eq' ? String(r[col]) === val : op === 'ilike' ? likeToRe(val).test(String(r[col] ?? '')) : false;
    };
    const tests = parts.map((p) => {
      const m = p.match(/^and\((.*)\)$/);
      if (m) { const subs = m[1].split(',').map(one); return (r: Row) => subs.every((f) => f(r)); }
      return one(p);
    });
    return (r: Row) => tests.some((f) => f(r));
  };

  class Query {
    private filters: Array<(r: Row) => boolean> = [];
    private mode: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
    private payload: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    private onConflict = 'id';
    private returning = false;
    private singleMode: 'one' | 'maybe' | null = null;
    private orderBy: { col: string; asc: boolean } | null = null;
    private max: number | null = null;
    constructor(private table: string) {}
    select() { if (this.mode !== 'select') this.returning = true; return this; }
    insert(rows: unknown) { this.mode = 'insert'; this.payload = rows; return this; }
    update(obj: unknown) { this.mode = 'update'; this.payload = obj; return this; }
    upsert(row: unknown, o?: { onConflict?: string }) { this.mode = 'upsert'; this.payload = row; this.onConflict = o?.onConflict || 'id'; return this; }
    delete() { this.mode = 'delete'; return this; }
    eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
    neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this; }
    is(c: string, v: unknown) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
    in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
    ilike(c: string, p: string) { const re = likeToRe(p); this.filters.push((r) => re.test(String(r[c] ?? ''))); return this; }
    gte(c: string, v: unknown) { this.filters.push((r) => r[c] >= (v as number)); return this; }
    or(expr: string) { this.filters.push(orFilter(expr)); return this; }
    order(col: string, o?: { ascending?: boolean }) { this.orderBy = { col, asc: o?.ascending !== false }; return this; }
    limit(n: number) { this.max = n; return this; }
    maybeSingle() { this.singleMode = 'maybe'; return this; }
    single() { this.singleMode = 'one'; return this; }
    private run(): { data: unknown; error: unknown } {
      const t = T(this.table);
      const match = (r: Row) => this.filters.every((f) => f(r));
      let out: Row[] = [];
      if (this.mode === 'insert') {
        const rows: Row[] = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r: Row) => ({ id: uid(), created_at: new Date(Date.now() + seq).toISOString(), ...r }));
        if (this.table === 'item_links') {
          for (const r of rows) {
            if (t.some((x) => x.tenant_id === r.tenant_id && x.from_type === r.from_type && x.from_id === r.from_id && x.to_type === r.to_type && x.to_id === r.to_id)) {
              return { data: null, error: { code: '23505', message: 'duplicate key' } };
            }
          }
        }
        t.push(...rows); out = rows;
      } else if (this.mode === 'upsert') {
        const r = this.payload; const hit = t.find((x) => x[this.onConflict] === r[this.onConflict]);
        if (hit) Object.assign(hit, r); else t.push({ ...r });
        out = [hit || r];
      } else if (this.mode === 'update') {
        out = t.filter(match); out.forEach((r) => Object.assign(r, this.payload));
      } else if (this.mode === 'delete') {
        out = t.filter(match); tables[this.table] = t.filter((r) => !match(r));
      } else out = t.filter(match);
      if (this.orderBy) { const { col, asc } = this.orderBy; out = [...out].sort((a, b) => (a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1)); }
      if (this.max != null) out = out.slice(0, this.max);
      const copy = out.map((r) => ({ ...r }));
      if (this.singleMode === 'maybe') return { data: copy[0] ?? null, error: null };
      if (this.singleMode === 'one') return copy.length === 1 ? { data: copy[0], error: null } : { data: null, error: { message: 'not one row' } };
      if (this.mode !== 'select' && !this.returning) return { data: null, error: null };
      return { data: copy, error: null };
    }
    then(ok?: (v: unknown) => unknown, bad?: (e: unknown) => unknown) { return Promise.resolve(this.run()).then(ok, bad); }
  }

  const db = { from: (t: string) => new Query(t) };
  return { db, tables, T, uid, reset: () => { for (const k of Object.keys(tables)) delete tables[k]; seq = 0; } };
}
