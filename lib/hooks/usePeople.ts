'use client';
/**
 * Names for the people a screen holds as ids (lib/person-names). Give it every
 * value from a person column; it asks /api/people/names once for the ids and
 * emails among them and remembers the answers for the session. Show values
 * with personName(value, people): a name, the text as typed, or null to hide.
 */
import { useEffect, useMemo, useState } from 'react';
import { isPersonId, type People } from '@/lib/person-names';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cache: People = {};
const asked = new Set<string>();

export function usePeople(values: ReadonlyArray<unknown>): People {
  const refs = useMemo(() => {
    const out = new Set<string>();
    for (const v of values) {
      if (typeof v !== 'string') continue;
      const t = v.trim().toLowerCase();
      if (t && (isPersonId(t) || EMAIL_RE.test(t))) out.add(t);
    }
    return Array.from(out).sort();
  }, [values]);
  const key = refs.join(',');
  const [people, setPeople] = useState<People>(() => ({ ...cache }));

  useEffect(() => {
    const want = refs.filter((r) => !asked.has(r));
    if (!want.length) { setPeople({ ...cache }); return; }
    let live = true;
    want.forEach((r) => asked.add(r));
    fetch(`/api/people/names?refs=${encodeURIComponent(want.join(','))}`, { credentials: 'include', cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'names');
        Object.assign(cache, (j.people || {}) as People);
      })
      .catch((e) => { want.forEach((r) => asked.delete(r)); console.error('[usePeople]', e); })
      .finally(() => { if (live) setPeople({ ...cache }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return people;
}
