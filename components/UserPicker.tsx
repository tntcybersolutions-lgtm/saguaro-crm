'use client';

import React, { useEffect, useState } from 'react';

/**
 * UserPicker — a dropdown of the tenant's real team members.
 *
 * Populated from GET /api/team/users (the same roster the Roles & Permissions
 * admin page uses), so every option is an actual member of the workspace. Used
 * on the Customers profile to choose who a customer's project is assigned to.
 */

export type TeamUser = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  title: string | null;
};

type Props = {
  value: string;
  onChange: (userId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Label for the empty option. */
  unassignedLabel?: string;
};

const BORDER = 'rgba(255,255,255,0.12)';
const GOLD = '#F59E0B';
const CARD = '#141416';
const DIM = '#CBD5E1';

export default function UserPicker({
  value,
  onChange,
  disabled = false,
  placeholder = 'Loading team…',
  unassignedLabel = 'Unassigned',
}: Props) {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch('/api/team/users');
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        const data = await res.json();
        if (!active) return;
        const list: TeamUser[] = Array.isArray(data?.users)
          ? data.users.map((u: Record<string, unknown>) => ({
              id: String(u.id ?? ''),
              name: String(u.name ?? u.email ?? 'Unknown'),
              email: String(u.email ?? ''),
              role: u.role != null ? String(u.role) : null,
              title: u.title != null ? String(u.title) : null,
            }))
          : [];
        setUsers(list.filter((u) => u.id));
      } catch {
        if (active) {
          setError(true);
          setUsers([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const isDisabled = disabled || loading || error;

  return (
    <select
      aria-label="Assign to team member"
      value={value}
      disabled={isDisabled}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        padding: '10px 12px',
        borderRadius: 10,
        border: `1px solid ${BORDER}`,
        background: CARD,
        color: value ? '#FFFFFF' : DIM,
        fontSize: 13,
        fontWeight: 600,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.6 : 1,
        outline: 'none',
        appearance: 'none',
        WebkitAppearance: 'none',
        MozAppearance: 'none',
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' stroke='%23F59E0B' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = GOLD)}
      onBlur={(e) => (e.currentTarget.style.borderColor = BORDER)}
    >
      <option value="">
        {error ? 'Could not load team' : loading ? placeholder : unassignedLabel}
      </option>
      {users.map((u) => (
        <option key={u.id} value={u.id} style={{ background: CARD, color: '#FFFFFF' }}>
          {u.name}
          {u.role ? ` — ${u.role}` : u.title ? ` — ${u.title}` : ''}
        </option>
      ))}
    </select>
  );
}
