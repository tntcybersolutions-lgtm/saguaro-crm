'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';

const GOLD='#D4A017', DARK='#0d1117', RAISED='#1f2c3e', BORDER='#263347', DIM='#8fa3c0', TEXT='#e8edf8', GREEN='#3dd68c';

interface ProjectFile {
  id: string;
  name: string;
  type: string;
  size: string;
  uploaded_by: string;
  date: string;
  url: string | null;
  category: string;
  project_id: string;
}

const DEMO_FILES: ProjectFile[] = [
  { id: 'f-1', name: 'Contract_Desert_Electric.pdf', type: 'PDF', size: '2.1 MB', uploaded_by: 'Chad D.', date: '2026-01-10', url: null, category: 'Contracts', project_id: '' },
  { id: 'f-2', name: 'Permit_Building_2026.pdf', type: 'PDF', size: '0.8 MB', uploaded_by: 'Chad D.', date: '2026-01-12', url: null, category: 'Permits', project_id: '' },
  { id: 'f-3', name: 'Insurance_COI_Mesa_Roofing.pdf', type: 'PDF', size: '1.3 MB', uploaded_by: 'Admin', date: '2026-02-15', url: null, category: 'Insurance', project_id: '' },
  { id: 'f-4', name: 'Drawings_Rev3.zip', type: 'ZIP', size: '45.2 MB', uploaded_by: 'Chad D.', date: '2026-02-01', url: null, category: 'Drawings', project_id: '' },
  { id: 'f-5', name: 'Scope_of_Work_v2.docx', type: 'DOCX', size: '0.4 MB', uploaded_by: 'Chad D.', date: '2026-01-05', url: null, category: 'Contracts', project_id: '' },
];

const CATEGORIES = ['All','Contracts','Drawings','Permits','Insurance','Photos','Reports','Other'];
const TYPE_ICONS: Record<string, string> = { PDF: '📄', ZIP: '📦', DOCX: '📝', XLSX: '📊', PNG: '🖼️', JPG: '🖼️' };

export default function FilesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState('All');
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/files`);
      const json = await res.json();
      setFiles(json.files?.length ? json.files : DEMO_FILES.map(f => ({ ...f, project_id: projectId })));
    } catch {
      setFiles(DEMO_FILES.map(f => ({ ...f, project_id: projectId })));
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
      const ext = file.name.split('.').pop()?.toUpperCase() || 'FILE';
      const sizeMB = (file.size / 1048576).toFixed(1);
      newFiles.push({
        id: `f-${Date.now()}-${i}`,
        name: file.name,
        type: ext,
        size: `${sizeMB} MB`,
        uploaded_by: 'Me',
        date: new Date().toISOString().split('T')[0],
        url: null,
        category: 'Other',
        project_id: projectId,
      });
    }
    try {
      const fd = new FormData();
      for (let i = 0; i < uploadedFiles.length; i++) fd.append('files', uploadedFiles[i]);
      fd.append('projectId', projectId);
      await fetch('/api/files/upload', { method: 'POST', body: fd });
      setSuccessMsg(`${uploadedFiles.length} file(s) uploaded.`);
    } catch {
      setSuccessMsg(`${uploadedFiles.length} file(s) added (demo mode).`);
    }
    setFiles(prev => [...newFiles, ...prev]);
    setUploading(false);
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  return (
    <div style={{ background: DARK, minHeight: '100vh' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: DARK }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Files</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Project documents and file storage</div>
        </div>
        <label style={{ padding: '8px 16px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
          {uploading ? 'Uploading...' : '+ Upload Files'}
          <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={e => { if (e.target.files?.length) handleUpload(e.target.files); }} />
        </label>
      </div>

      {successMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(61,214,140,.15)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 7, color: GREEN, fontSize: 13 }}>{successMsg}</div>}

      {/* Search + filter */}
      <div style={{ padding: '16px 24px 0', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search files..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '7px 12px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 6, color: TEXT, fontSize: 13, width: 220 }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setFilterCat(c)} style={{ padding: '5px 12px', background: filterCat === c ? GOLD : RAISED, border: '1px solid ' + (filterCat === c ? GOLD : BORDER), borderRadius: 5, color: filterCat === c ? DARK : DIM, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{c}</button>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: DIM }}>{filtered.length} file{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div style={{ padding: '16px 24px 40px', overflowX: 'auto' }}>
        {loading ? <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading...</div> : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: DIM }}>No files found.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0a1117' }}>
                {['Name','Type','Size','Category','Uploaded By','Date','Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: DIM, borderBottom: '1px solid ' + BORDER, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(f => (
                <tr key={f.id} style={{ borderBottom: '1px solid rgba(38,51,71,.4)' }}>
                  <td style={{ padding: '10px 14px', color: TEXT }}>
                    <span style={{ marginRight: 8 }}>{TYPE_ICONS[f.type] || '📄'}</span>{f.name}
                  </td>
                  <td style={{ padding: '10px 14px', color: DIM }}>{f.type}</td>
                  <td style={{ padding: '10px 14px', color: DIM }}>{f.size}</td>
                  <td style={{ padding: '10px 14px', color: DIM }}>{f.category}</td>
                  <td style={{ padding: '10px 14px', color: DIM }}>{f.uploaded_by}</td>
                  <td style={{ padding: '10px 14px', color: DIM, whiteSpace: 'nowrap' }}>{f.date}</td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    {f.url ? (
                      <>
                        <button onClick={() => window.open(f.url!, '_blank')} style={{ padding: '4px 10px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 5, color: DIM, fontSize: 12, cursor: 'pointer', marginRight: 6 }}>View</button>
                        <a href={f.url} download style={{ padding: '4px 10px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 5, color: DIM, fontSize: 12, textDecoration: 'none' }}>Download</a>
                      </>
                    ) : (
                      <span style={{ color: DIM, fontSize: 12 }}>No preview</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
