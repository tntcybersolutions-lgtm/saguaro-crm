'use client';

import React, { useEffect, useState } from 'react';

/**
 * UserPicker — "assign to anyone": the tenant's team members AND its
 * subcontractors / vendors, in one dropdown.
 *
 * Team members come from GET /api/team/users (the Roles & Permissions roster);
 * subs/vendors from GET /api/subs/list. The value is a COMPOSITE string so the
 * caller knows which kind was chosen:
 *   ''            — unassigned
 *   'user:<id>'   — a team member
 *   'sub:<id>'    — a subcontractor / vendor
 * Used on the Customers profile to assign a customer's project to whoever owns
 * the work — a PM, or the sub actually doing it.
 */

export type TeamUser = { id: string; name: string; email: string; role: string | null; title: string | null };
type SubRow = { id: string; name: string; trade: string | null };

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  unassignedLabel?: string;
};

export default function UserPicker({
  value,
  onChange,
  disabled = false,
  placeholder = 'Loading…',
  unassignedLabel = 'Unassigned',
}: Props) {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const [uRes, sRes] = await Promise.all([
          fetch('/api/team/users').catch(() => null),
          fetch('/api/subs/list').catch(() => null),
        ]);
        if (!active) return;

        const uData = uRes && uRes.ok ? await uRes.json().catch(() => ({})) : {};
        const list: TeamUser[] = Array.isArray(uData?.users)
          ? uData.users.map((u: Record<string, unknown>) => ({
              id: String(u.id ?? ''),
              name: String(u.name ?? u.email ?? 'Unknown'),
              email: String(u.email ?? ''),
              role: u.role != null ? String(u.role) : null,
              title: u.title != null ? String(u.title) : null,
            })).filter((u: TeamUser) => u.id)
          : [];

        const sData = sRes && sRes.ok ? await sRes.json().catch(() => ({})) : {};
        const subList: SubRow[] = Array.isArray(sData?.subs)
          ? sData.subs.map((s: Record<string, unknown>) => ({
              id: String(s.id ?? ''),
              name: String(s.company_name ?? s.name ?? 'Unnamed sub'),
              trade: s.trade != null ? String(s.trade) : null,
            })).filter((s: SubRow) => s.id)
          : [];

        if (!active) return;
        setUsers(list);
        setSubs(subList);
        if (list.length === 0 && subList.length === 0 && !(uRes?.ok)) setError(true);
      } catch {
        if (active) { setError(true); setUsers([]); setSubs([]); }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const isDisabled = disabled || loading;

  return (
    <select
      aria-label="Assign to a team member, subcontractor or vendor"
      value={value}
      disabled={isDisabled}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: '100%' }}
    >
      <option value="">
        {error ? 'Could not load people' : loading ? placeholder : unassignedLabel}
      </option>
      {users.length > 0 && (
        <optgroup label="Team">
          {users.map((u) => (
            <option key={`user:${u.id}`} value={`user:${u.id}`}>
              {u.name}{u.role ? ` — ${u.role}` : u.title ? ` — ${u.title}` : ''}
            </option>
          ))}
        </optgroup>
      )}
      {subs.length > 0 && (
        <optgroup label="Subcontractors & Vendors">
          {subs.map((s) => (
            <option key={`sub:${s.id}`} value={`sub:${s.id}`}>
              {s.name}{s.trade ? ` — ${s.trade}` : ''}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
