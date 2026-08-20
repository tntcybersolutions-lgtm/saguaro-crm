'use client';
/**
 * Saguaro Field — Centralized Project ID Hook
 *
 * Standardizes how every field page gets the active project.
 * Priority: URL searchParams → localStorage → prompt user
 */
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

interface FieldProject {
  projectId: string;
  projectName: string;
  loading: boolean;
  missing: boolean;
}

const STORAGE_KEY = 'sag_active_project';

export function useFieldProject(): FieldProject {
  const searchParams = useSearchParams();
  const [projectId, setProjectId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    // 1. Try URL search params (supports both casing patterns)
    const fromUrl = searchParams.get('projectId') || searchParams.get('project_id') || '';

    // 2. Fallback to localStorage
    const fromStorage = typeof window !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY) || ''
      : '';

    const pid = fromUrl || fromStorage;

    if (!pid) {
      setMissing(true);
      setLoading(false);
      return;
    }

    setProjectId(pid);
    setMissing(false);

    // Persist to localStorage so other pages can find it
    if (pid && typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, pid);
    }

    // Fetch project name
    fetch(`/api/projects/${pid}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const name = d?.name || d?.project?.name || '';
        if (name) setProjectName(name);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [searchParams]);

  return { projectId, projectName, loading, missing };
}
