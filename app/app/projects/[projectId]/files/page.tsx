'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { PageWrap, SectionHeader, StatCard, Badge, Btn, Card, CardHeader, CardBody, Table, T } from '@/components/ui/shell';

interface ProjectFile {
  id: string;
  name: string;
  category: string;
  size: string;
  uploaded_by: string;
  date: string;
  url: string | null;
}

const CATEGORIES = ['All', 'Contracts', 'Insurance', 'Permits', 'Photos', 'Drawings', 'Reports', 'Other'];

export default function FilesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState('All');
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/files`);
      const json = await res.json();
      setFiles(json.files ?? []);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const filtered = files.filter(f => {
    if (filterCat !== 'All' && f.category !== filterCat) return false;
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function handleUpload(uploadedFiles: FileList) {
    setUploading(true);
    const newFiles: ProjectFile[] = [];
    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      const sizeMB = (file.size / 1048576).toFixed(1);
      newFiles.push({
        id: `f-${Date.now()}-${i}`,
        name: file.name,
        category: 'Other',
        size: `${sizeMB} MB`,
        uploaded_by: 'Me',
        date: new Date().toISOString().split('T')[0],
        url: null,
      });
    }
    try {
      const fd = new FormData();
      for (let i = 0; i < uploadedFiles.length; i++) fd.append('files', uploadedFiles[i]);
      fd.append('projectId', projectId);
      await fetch('/api/files/upload', { method: 'POST', body: fd });
      setToast(`${uploadedFiles.length} file(s) uploaded.`);
    } catch {
      setToast(`${uploadedFiles.length} file(s) added locally.`);
    }
    setFiles(prev => [...newFiles, ...prev]);
    setUploading(false);
    setTimeout(() => setToast(''), 4000);
  }

  return (
    <PageWrap>
      <div style={{ padding: 24 }}>
        <SectionHeader
          title="Files"
          sub="Project documents and file storage"
          action={
            <label style={{ cursor: 'pointer' }}>
              <Btn disabled={uploading}>{uploading ? 'Uploading...' : '+ Upload Files'}</Btn>
              <input
                ref={fileRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={e => { if (e.target.files?.length) handleUpload(e.target.files); }}
              />
            </label>
          }
        />

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
          <StatCard icon="📁" label="Total Files" value={String(files.length)} />
          <StatCard icon="📂" label="Showing" value={String(filtered.length)} />
          <StatCard icon="🏷️" label="Categories" value={String(new Set(files.map(f => f.category)).size)} />
        </div>

        {toast && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(34,197,94,0.3)`, borderRadius: 8, color: T.green, fontSize: 13 }}>
            {toast}
          </div>
        )}

        {/* Search + Category filter */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
          <input
            type="text"
            placeholder="Search files..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '8px 12px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, width: 220, outline: 'none' }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            {CATEGORIES.map(c => (
              <Btn key={c} size="sm" variant={filterCat === c ? 'primary' : 'ghost'} onClick={() => setFilterCat(c)}>{c}</Btn>
            ))}
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: T.muted }}>{filtered.length} file{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* File table */}
        <Card>
          <CardBody style={{ padding: 0 }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: T.muted }}>Loading...</div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: T.muted }}>
                {files.length === 0 ? 'No files uploaded yet.' : 'No files match your search.'}
              </div>
            ) : (
              <Table
                headers={['Name', 'Category', 'Size', 'Uploaded Date', 'Uploaded By', 'Actions']}
                rows={filtered.map(f => [
                  <span key="n" style={{ fontWeight: 500 }}>{f.name}</span>,
                  <Badge key="cat" label={f.category} color="muted" />,
                  <span key="sz" style={{ color: T.muted }}>{f.size}</span>,
                  <span key="dt" style={{ color: T.muted, whiteSpace: 'nowrap' }}>{f.date}</span>,
                  <span key="by" style={{ color: T.muted }}>{f.uploaded_by}</span>,
                  <div key="act" style={{ display: 'flex', gap: 6 }}>
                    {f.url ? (
                      <>
                        <Btn size="sm" variant="ghost" onClick={() => window.open(f.url!, '_blank')}>View</Btn>
                        <a href={f.url} download style={{ textDecoration: 'none' }}>
                          <Btn size="sm" variant="ghost">Download</Btn>
                        </a>
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: T.muted }}>No preview</span>
                    )}
                  </div>,
                ])}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </PageWrap>
  );
}
