'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const GOLD = '#C8960F';
const DARK = '#F8F9FB';
const RAISED = '#ffffff';
const BORDER = '#E2E5EA';
const DIM = '#6B7280';
const TEXT = '#e8edf8';

const RECENT_KEY = 'saguaro_recent_projects';
const MAX_RECENT = 5;

interface Project {
  id: string;
  name: string;
  project_number?: string;
  status?: string;
  contract_amount?: number;
  address?: string;
}

interface ProjectSwitcherProps {
  open: boolean;
  onClose: () => void;
}

function formatCurrency(value: number | undefined): string {
  if (value === undefined || value === null) return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function getRecentIds(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentId(id: string) {
  try {
    const current = getRecentIds().filter((r) => r !== id);
    current.unshift(id);
    localStorage.setItem(RECENT_KEY, JSON.stringify(current.slice(0, MAX_RECENT)));
  } catch {
    // ignore
  }
}

function statusColor(status?: string): string {
  if (!status) return DIM;
  const s = status.toLowerCase();
  if (s === 'active' || s === 'in_progress' || s === 'in progress') return '#3fb950';
  if (s === 'completed' || s === 'closed') return '#8b949e';
  if (s === 'pending' || s === 'bidding') return GOLD;
  if (s === 'on_hold' || s === 'on hold') return '#f0883e';
  return DIM;
}

export default function ProjectSwitcher({ open, onClose }: ProjectSwitcherProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Fetch projects on open
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedIndex(0);
    setLoading(true);
    fetch('/api/projects/list')
      .then((res) => res.json())
      .then((data) => {
        const list: Project[] = Array.isArray(data) ? data : data.projects ?? [];
        setProjects(list);
      })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [open]);

  // Auto-focus
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Filter and sort
  const filtered = (() => {
    const q = query.toLowerCase().trim();
    const base = q
      ? projects.filter(
          (p) =>
            p.name?.toLowerCase().includes(q) ||
            p.project_number?.toLowerCase().includes(q) ||
            p.address?.toLowerCase().includes(q)
        )
      : projects;

    // Sort recent first
    const recentIds = getRecentIds();
    return [...base].sort((a, b) => {
      const ai = recentIds.indexOf(a.id);
      const bi = recentIds.indexOf(b.id);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return 0;
    });
  })();

  // Reset selected index when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-project-item]');
    const item = items[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const navigateToProject = useCallback(
    (project: Project) => {
      saveRecentId(project.id);
      onClose();
      router.push(`/app/projects/${project.id}/overview`);
    },
    [router, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const project = filtered[selectedIndex];
        if (project) navigateToProject(project);
        return;
      }
    },
    [filtered, selectedIndex, navigateToProject, onClose]
  );

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99998,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 100,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        style={{
          background: DARK,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          width: '100%',
          maxWidth: 540,
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
          overflow: 'hidden',
        }}
      >
        {/* Search input */}
        <div style={{ padding: '16px 16px 12px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: RAISED,
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              padding: '0 12px',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke={DIM}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search projects..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: TEXT,
                fontSize: 15,
                padding: '10px 0',
                fontFamily: 'inherit',
              }}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: DIM,
                  cursor: 'pointer',
                  fontSize: 16,
                  padding: '0 2px',
                  lineHeight: 1,
                }}
              >
                &times;
              </button>
            )}
          </div>
        </div>

        {/* Project list */}
        <div
          ref={listRef}
          style={{
            maxHeight: 380,
            overflowY: 'auto',
            padding: '0 8px 8px',
          }}
        >
          {loading && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: DIM, fontSize: 14 }}>
              Loading projects...
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: DIM, fontSize: 14 }}>
              {query ? 'No projects match your search' : 'No projects found'}
            </div>
          )}

          {!loading &&
            filtered.map((project, i) => {
              const isSelected = i === selectedIndex;
              const isRecent = getRecentIds().includes(project.id);
              return (
                <div
                  key={project.id}
                  data-project-item
                  onClick={() => navigateToProject(project)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: isSelected ? RAISED : 'transparent',
                    border: isSelected ? `1px solid ${BORDER}` : '1px solid transparent',
                    transition: 'background 0.1s, border-color 0.1s',
                    marginBottom: 2,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span
                        style={{
                          color: TEXT,
                          fontSize: 14,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {project.name}
                      </span>
                      {project.status && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: statusColor(project.status),
                            background: `${statusColor(project.status)}18`,
                            padding: '1px 7px',
                            borderRadius: 4,
                            textTransform: 'capitalize',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {project.status.replace(/_/g, ' ')}
                        </span>
                      )}
                      {isRecent && (
                        <span
                          style={{
                            fontSize: 10,
                            color: GOLD,
                            fontWeight: 500,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Recent
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        fontSize: 12,
                        color: DIM,
                      }}
                    >
                      {project.project_number && <span>#{project.project_number}</span>}
                      {project.contract_amount !== undefined && project.contract_amount !== null && (
                        <span>{formatCurrency(project.contract_amount)}</span>
                      )}
                    </div>
                    {project.address && (
                      <div
                        style={{
                          fontSize: 12,
                          color: DIM,
                          marginTop: 2,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {project.address}
                      </div>
                    )}
                  </div>

                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={isSelected ? GOLD : 'transparent'}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flexShrink: 0 }}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              );
            })}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px',
            borderTop: `1px solid ${BORDER}`,
          }}
        >
          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: DIM }}>
            <span>
              <kbd
                style={{
                  background: RAISED,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 3,
                  padding: '1px 5px',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: GOLD,
                }}
              >
                &uarr;&darr;
              </kbd>{' '}
              Navigate
            </span>
            <span>
              <kbd
                style={{
                  background: RAISED,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 3,
                  padding: '1px 5px',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: GOLD,
                }}
              >
                Enter
              </kbd>{' '}
              Open
            </span>
            <span>
              <kbd
                style={{
                  background: RAISED,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 3,
                  padding: '1px 5px',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: GOLD,
                }}
              >
                Esc
              </kbd>{' '}
              Close
            </span>
          </div>
          <span style={{ fontSize: 12, color: DIM }}>
            {filtered.length} project{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
