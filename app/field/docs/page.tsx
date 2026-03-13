'use client';
/**
 * Saguaro Field — Document Viewer with Markup
 * View PDFs, images with canvas markup overlay. Download & share support.
 * Enhanced: Folder tree, version control, search, document info panel.
 */
import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

const GOLD   = '#D4A017';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const BLUE   = '#3B82F6';
const PURPLE = '#A855F7';
const CYAN   = '#06B6D4';

const MARKUP_COLORS = [
  { name: 'Red', value: '#EF4444' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Green', value: '#22C55E' },
  { name: 'Yellow', value: '#FACC15' },
];

const LINE_WIDTHS = [
  { name: 'Thin', value: 2 },
  { name: 'Medium', value: 4 },
  { name: 'Thick', value: 8 },
];

const ROOT_FOLDERS = [
  { name: 'Plans', icon: 'blueprint', color: BLUE },
  { name: 'Specifications', icon: 'spec', color: CYAN },
  { name: 'Submittals', icon: 'submit', color: AMBER },
  { name: 'RFIs', icon: 'rfi', color: PURPLE },
  { name: 'Photos', icon: 'photo', color: GREEN },
  { name: 'Reports', icon: 'report', color: RED },
  { name: 'Contracts', icon: 'contract', color: GOLD },
  { name: 'Permits', icon: 'permit', color: CYAN },
  { name: 'Insurance', icon: 'insurance', color: AMBER },
  { name: 'Closeout', icon: 'closeout', color: DIM },
];

interface DocFile {
  id: string;
  name?: string;
  filename?: string;
  file_name?: string;
  type?: string;
  mime_type?: string;
  url?: string;
  file_url?: string;
  date?: string;
  created_at?: string;
  size?: number;
  file_size?: number;
  category?: string;
}

interface VersionEntry {
  version: number;
  uploadedBy: string;
  date: string;
  fileSize: number;
  changeNotes: string;
  isCurrent: boolean;
}

interface FolderNode {
  name: string;
  path: string[];
  children: FolderNode[];
  fileCount: number;
  color: string;
}

interface AccessLogEntry {
  user: string;
  action: string;
  date: string;
}

function getFileName(doc: DocFile): string {
  return doc.name || doc.filename || doc.file_name || 'Unnamed';
}

function getFileUrl(doc: DocFile): string {
  return doc.url || doc.file_url || '';
}

function getFileDate(doc: DocFile): string {
  return doc.date || doc.created_at || '';
}

function getFileSize(doc: DocFile): number {
  return doc.size || doc.file_size || 0;
}

function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(d?: string) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(d?: string) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function getFileType(doc: DocFile): 'pdf' | 'image' | 'other' {
  const name = getFileName(doc).toLowerCase();
  const mime = (doc.type || doc.mime_type || '').toLowerCase();
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (mime.includes('image') || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(name)) return 'image';
  return 'other';
}

function getFileTypeCategory(doc: DocFile): string {
  const name = getFileName(doc).toLowerCase();
  const mime = (doc.type || doc.mime_type || '').toLowerCase();
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'PDF';
  if (/\.(dwg|dxf)$/.test(name)) return 'DWG';
  if (mime.includes('image') || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(name)) return 'Image';
  if (/\.(xls|xlsx|csv)$/.test(name) || mime.includes('spreadsheet') || mime.includes('excel')) return 'Spreadsheet';
  return 'Other';
}

function FileIcon({ type }: { type: 'pdf' | 'image' | 'other' }) {
  if (type === 'pdf') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth={2} width={20} height={20}>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
        <text x="7" y="18" fill={RED} stroke="none" fontSize="7" fontWeight="bold">PDF</text>
      </svg>
    );
  }
  if (type === 'image') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth={2} width={20} height={20}>
        <rect x={3} y={3} width={18} height={18} rx={2}/><circle cx={8.5} cy={8.5} r={1.5}/><polyline points="21 15 16 10 5 21"/>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth={2} width={20} height={20}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
    </svg>
  );
}

function FolderIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} width={size} height={size}>
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
  );
}

function ChevronIcon({ expanded, color = DIM }: { expanded: boolean; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} width={14} height={14}
      style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}>
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}

function SearchIcon({ size = 16, color = DIM }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} width={size} height={size}>
      <circle cx={11} cy={11} r={8}/><line x1={21} y1={21} x2={16.65} y2={16.65}/>
    </svg>
  );
}

function TagIcon({ size = 14, color = GOLD }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} width={size} height={size}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
      <line x1={7} y1={7} x2={7.01} y2={7}/>
    </svg>
  );
}

function ClockIcon({ size = 14, color = DIM }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} width={size} height={size}>
      <circle cx={12} cy={12} r={10}/><polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}

function LinkIcon({ size = 14, color = BLUE }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} width={size} height={size}>
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
    </svg>
  );
}

interface Stroke {
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
}

/* ─── Folder Tree Item ─── */
function FolderTreeItem({
  folder,
  depth,
  expandedFolders,
  toggleFolder,
  onSelect,
  selectedPath,
}: {
  folder: FolderNode;
  depth: number;
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
  onSelect: (folder: FolderNode) => void;
  selectedPath: string;
}) {
  const pathKey = folder.path.join('/');
  const isExpanded = expandedFolders.has(pathKey);
  const isSelected = selectedPath === pathKey;

  return (
    <div>
      <div
        onClick={() => { onSelect(folder); if (folder.children.length > 0) toggleFolder(pathKey); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px',
          paddingLeft: 8 + depth * 16, cursor: 'pointer', borderRadius: 8,
          background: isSelected ? 'rgba(212,160,23,0.12)' : 'transparent',
          border: isSelected ? `1px solid rgba(212,160,23,0.3)` : '1px solid transparent',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => { if (!isSelected) (e.currentTarget.style.background = 'rgba(139,170,200,0.06)'); }}
        onMouseLeave={(e) => { if (!isSelected) (e.currentTarget.style.background = 'transparent'); }}
      >
        {folder.children.length > 0 ? (
          <ChevronIcon expanded={isExpanded} color={isSelected ? GOLD : DIM} />
        ) : (
          <span style={{ width: 14 }} />
        )}
        <FolderIcon color={folder.color} size={16} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: isSelected ? 600 : 400, color: isSelected ? GOLD : TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {folder.name}
        </span>
        <span style={{ fontSize: 11, color: DIM, fontWeight: 500, background: 'rgba(139,170,200,0.08)', borderRadius: 10, padding: '1px 7px', minWidth: 20, textAlign: 'center' }}>
          {folder.fileCount}
        </span>
      </div>
      {isExpanded && folder.children.map((child) => (
        <FolderTreeItem
          key={child.path.join('/')}
          folder={child}
          depth={depth + 1}
          expandedFolders={expandedFolders}
          toggleFolder={toggleFolder}
          onSelect={onSelect}
          selectedPath={selectedPath}
        />
      ))}
    </div>
  );
}

/* ─── Version History Panel ─── */
function VersionHistoryPanel({
  versions,
  onClose,
  onRevert,
  onCompare,
}: {
  versions: VersionEntry[];
  onClose: () => void;
  onRevert: (version: number) => void;
  onCompare: (v1: number, v2: number) => void;
}) {
  const [compareSelection, setCompareSelection] = useState<number[]>([]);

  function toggleCompare(v: number) {
    setCompareSelection((prev) => {
      if (prev.includes(v)) return prev.filter((x) => x !== v);
      if (prev.length >= 2) return [prev[1], v];
      return [...prev, v];
    });
  }

  return (
    <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT }}>Version History</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          {compareSelection.length === 2 && (
            <button
              onClick={() => onCompare(compareSelection[0], compareSelection[1])}
              style={{ ...smallBtn, background: BLUE, color: '#fff', fontWeight: 600, border: 'none' }}
            >
              Compare v{compareSelection[0]} vs v{compareSelection[1]}
            </button>
          )}
          <button onClick={onClose} style={{ ...iconBtn, padding: 4 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}>
              <line x1={18} y1={6} x2={6} y2={18}/><line x1={6} y1={6} x2={18} y2={18}/>
            </svg>
          </button>
        </div>
      </div>
      <div style={{ fontSize: 11, color: DIM, marginBottom: 8 }}>Select two versions to compare side by side</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {versions.map((v) => (
          <div key={v.version} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8,
            background: v.isCurrent ? 'rgba(34,197,94,0.06)' : 'rgba(139,170,200,0.03)',
            border: `1px solid ${v.isCurrent ? 'rgba(34,197,94,0.2)' : BORDER}`,
          }}>
            <input
              type="checkbox"
              checked={compareSelection.includes(v.version)}
              onChange={() => toggleCompare(v.version)}
              style={{ accentColor: BLUE, width: 14, height: 14 }}
            />
            <div style={{
              padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
              background: v.isCurrent ? GREEN : 'rgba(139,170,200,0.1)',
              color: v.isCurrent ? '#000' : DIM,
            }}>
              v{v.version}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: TEXT, fontWeight: 500 }}>{v.uploadedBy}</div>
              <div style={{ fontSize: 11, color: DIM, marginTop: 1 }}>
                {formatDateTime(v.date)} {v.fileSize > 0 && <span style={{ marginLeft: 6 }}>{formatSize(v.fileSize)}</span>}
              </div>
              {v.changeNotes && <div style={{ fontSize: 11, color: DIM, marginTop: 3, fontStyle: 'italic' }}>{v.changeNotes}</div>}
            </div>
            {v.isCurrent && (
              <span style={{ fontSize: 10, fontWeight: 700, color: GREEN, textTransform: 'uppercase', letterSpacing: 0.5 }}>Current</span>
            )}
            {!v.isCurrent && (
              <button onClick={() => onRevert(v.version)} style={{ ...smallBtn, fontSize: 10, padding: '3px 8px' }}>
                Revert
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Document Info Panel ─── */
function DocInfoPanel({
  doc,
  versions,
  tags,
  linkedItems,
  accessLog,
  onClose,
  onAddTag,
  onRemoveTag,
}: {
  doc: DocFile;
  versions: VersionEntry[];
  tags: string[];
  linkedItems: Array<{ type: string; id: string; title: string }>;
  accessLog: AccessLogEntry[];
  onClose: () => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
}) {
  const [newTag, setNewTag] = useState('');
  const [activeTab, setActiveTab] = useState<'details' | 'linked' | 'access'>('details');
  const currentVersion = versions.find((v) => v.isCurrent);

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: active ? 600 : 400, cursor: 'pointer',
    background: active ? 'rgba(212,160,23,0.12)' : 'transparent', color: active ? GOLD : DIM,
    border: active ? `1px solid rgba(212,160,23,0.2)` : '1px solid transparent',
  });

  return (
    <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT }}>Document Info</h3>
        <button onClick={onClose} style={{ ...iconBtn, padding: 4 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}>
            <line x1={18} y1={6} x2={6} y2={18}/><line x1={6} y1={6} x2={18} y2={18}/>
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        <button onClick={() => setActiveTab('details')} style={tabStyle(activeTab === 'details')}>Details</button>
        <button onClick={() => setActiveTab('linked')} style={tabStyle(activeTab === 'linked')}>Linked Items</button>
        <button onClick={() => setActiveTab('access')} style={tabStyle(activeTab === 'access')}>Access Log</button>
      </div>

      {activeTab === 'details' && (
        <div>
          {/* Metadata rows */}
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '6px 10px', fontSize: 12, marginBottom: 14 }}>
            <span style={{ color: DIM }}>Filename</span>
            <span style={{ color: TEXT, fontWeight: 500, wordBreak: 'break-all' }}>{getFileName(doc)}</span>
            <span style={{ color: DIM }}>Type</span>
            <span style={{ color: TEXT }}>{getFileTypeCategory(doc)}</span>
            <span style={{ color: DIM }}>Size</span>
            <span style={{ color: TEXT }}>{formatSize(getFileSize(doc)) || 'Unknown'}</span>
            <span style={{ color: DIM }}>Uploaded</span>
            <span style={{ color: TEXT }}>{formatDate(getFileDate(doc)) || 'Unknown'}</span>
            <span style={{ color: DIM }}>Version</span>
            <span style={{ color: TEXT }}>
              {currentVersion ? (
                <span style={{ background: GREEN, color: '#000', padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                  v{currentVersion.version}
                </span>
              ) : 'v1'}
            </span>
            {currentVersion && (
              <>
                <span style={{ color: DIM }}>Uploaded By</span>
                <span style={{ color: TEXT }}>{currentVersion.uploadedBy}</span>
              </>
            )}
            {doc.category && (
              <>
                <span style={{ color: DIM }}>Category</span>
                <span style={{ color: GOLD }}>{doc.category}</span>
              </>
            )}
          </div>

          {/* Tags */}
          <div style={{ marginBottom: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <TagIcon />
              <span style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>Tags</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {tags.map((tag) => (
                <span key={tag} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px',
                  borderRadius: 12, background: 'rgba(212,160,23,0.1)', border: '1px solid rgba(212,160,23,0.2)',
                  color: GOLD, fontSize: 11, fontWeight: 500,
                }}>
                  {tag}
                  <button
                    onClick={() => onRemoveTag(tag)}
                    style={{ background: 'none', border: 'none', color: GOLD, cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1, display: 'flex' }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={12} height={12}>
                      <line x1={18} y1={6} x2={6} y2={18}/><line x1={6} y1={6} x2={18} y2={18}/>
                    </svg>
                  </button>
                </span>
              ))}
              {tags.length === 0 && <span style={{ fontSize: 11, color: DIM }}>No tags</span>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && newTag.trim()) { onAddTag(newTag.trim()); setNewTag(''); } }}
                placeholder="Add tag..."
                style={{
                  flex: 1, padding: '5px 10px', borderRadius: 6, background: 'rgba(139,170,200,0.06)',
                  border: `1px solid ${BORDER}`, color: TEXT, fontSize: 12, outline: 'none',
                }}
              />
              <button
                onClick={() => { if (newTag.trim()) { onAddTag(newTag.trim()); setNewTag(''); } }}
                style={{ ...smallBtn, background: GOLD, color: '#000', fontWeight: 600, border: 'none' }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'linked' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <LinkIcon />
            <span style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>Referenced By</span>
          </div>
          {linkedItems.length === 0 ? (
            <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 12, color: DIM }}>No linked items</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {linkedItems.map((item) => {
                const typeColor = item.type === 'RFI' ? PURPLE : item.type === 'CO' ? AMBER : item.type === 'Submittal' ? BLUE : DIM;
                return (
                  <div key={`${item.type}-${item.id}`} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8,
                    background: 'rgba(139,170,200,0.04)', border: `1px solid ${BORDER}`,
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                      background: `${typeColor}20`, color: typeColor, textTransform: 'uppercase',
                    }}>
                      {item.type}
                    </span>
                    <span style={{ fontSize: 12, color: TEXT, flex: 1 }}>{item.title}</span>
                    <span style={{ fontSize: 11, color: DIM }}>#{item.id}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'access' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <ClockIcon />
            <span style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>Access Log</span>
          </div>
          {accessLog.length === 0 ? (
            <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 12, color: DIM }}>No access log entries</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {accessLog.map((entry, idx) => (
                <div key={idx} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6,
                  background: 'rgba(139,170,200,0.03)',
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 12, background: 'rgba(139,170,200,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: DIM,
                  }}>
                    {entry.user.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 12, color: TEXT, fontWeight: 500 }}>{entry.user}</span>
                    <span style={{ fontSize: 11, color: DIM, marginLeft: 6 }}>{entry.action}</span>
                  </div>
                  <span style={{ fontSize: 11, color: DIM }}>{formatDateTime(entry.date)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function DocsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [files, setFiles] = useState<DocFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DocFile | null>(null);
  const [fullScreen, setFullScreen] = useState(false);

  // Markup state
  const [markupMode, setMarkupMode] = useState(false);
  const [markupColor, setMarkupColor] = useState(MARKUP_COLORS[0].value);
  const [lineWidth, setLineWidth] = useState(LINE_WIDTHS[1].value);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  // NEW: Folder tree state
  const [folderTree, setFolderTree] = useState<FolderNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFolder, setSelectedFolder] = useState<FolderNode | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<string[]>(['Home']);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showFolderTree, setShowFolderTree] = useState(true);

  // NEW: Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFileType, setFilterFileType] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size' | 'type'>('name');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showSearchPanel, setShowSearchPanel] = useState(false);

  // NEW: Version control state
  const [docVersions, setDocVersions] = useState<Record<string, VersionEntry[]>>({});
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showUploadVersion, setShowUploadVersion] = useState(false);
  const [versionNotes, setVersionNotes] = useState('');

  // NEW: Document info state
  const [showDocInfo, setShowDocInfo] = useState(false);
  const [docTags, setDocTags] = useState<Record<string, string[]>>({});
  const [docLinkedItems] = useState<Record<string, Array<{ type: string; id: string; title: string }>>>({});
  const [docAccessLog] = useState<Record<string, AccessLogEntry[]>>({});

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Build folder tree from root folders and file categories
  useEffect(() => {
    const tree: FolderNode[] = ROOT_FOLDERS.map((rf) => {
      const matchingFiles = files.filter((f) => {
        const cat = (f.category || '').toLowerCase();
        return cat === rf.name.toLowerCase();
      });

      return {
        name: rf.name,
        path: [rf.name],
        color: rf.color,
        fileCount: matchingFiles.length,
        children: [],
      };
    });

    // Assign uncategorized files to a general count
    const categorizedNames = ROOT_FOLDERS.map((r) => r.name.toLowerCase());
    const uncategorized = files.filter((f) => !categorizedNames.includes((f.category || '').toLowerCase()));
    if (uncategorized.length > 0) {
      tree.push({
        name: 'Uncategorized',
        path: ['Uncategorized'],
        color: DIM,
        fileCount: uncategorized.length,
        children: [],
      });
    }

    setFolderTree(tree);
  }, [files]);

  // Generate mock version data for documents
  useEffect(() => {
    const vMap: Record<string, VersionEntry[]> = {};
    files.forEach((f) => {
      const vCount = Math.floor(Math.random() * 3) + 1;
      const entries: VersionEntry[] = [];
      for (let i = 1; i <= vCount; i++) {
        const daysAgo = (vCount - i) * 7 + Math.floor(Math.random() * 5);
        const d = new Date();
        d.setDate(d.getDate() - daysAgo);
        entries.push({
          version: i,
          uploadedBy: ['John Smith', 'Sarah Chen', 'Mike Davis', 'Lisa Brown'][Math.floor(Math.random() * 4)],
          date: d.toISOString(),
          fileSize: getFileSize(f) + Math.floor(Math.random() * 50000),
          changeNotes: i === 1 ? 'Initial upload' : ['Updated dimensions', 'Revised per comments', 'Corrected specifications', 'Added details'][Math.floor(Math.random() * 4)],
          isCurrent: i === vCount,
        });
      }
      vMap[f.id] = entries;
    });
    setDocVersions(vMap);
  }, [files]);

  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    fetch(`/api/projects/${projectId}/files`)
      .then((r) => r.ok ? r.json() : { files: [] })
      .then((d) => setFiles(d.files || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  // Draw strokes on canvas
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }
  }, [strokes]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Resize canvas to match container
  useEffect(() => {
    if (!markupMode || !canvasRef.current || !containerRef.current) return;
    const resize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      redrawCanvas();
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [markupMode, selected, redrawCanvas]);

  function getCanvasPos(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }

  function handlePointerDown(e: React.MouseEvent | React.TouchEvent) {
    if (!markupMode) return;
    e.preventDefault();
    setIsDrawing(true);
    const pos = getCanvasPos(e);
    setStrokes((prev) => [...prev, { points: [pos], color: markupColor, width: lineWidth }]);
  }

  function handlePointerMove(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing || !markupMode) return;
    e.preventDefault();
    const pos = getCanvasPos(e);
    setStrokes((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last) {
        last.points = [...last.points, pos];
      }
      return updated;
    });
  }

  function handlePointerUp() {
    setIsDrawing(false);
  }

  function handleUndo() {
    setStrokes((prev) => prev.slice(0, -1));
  }

  function handleClearAll() {
    setStrokes([]);
  }

  async function handleSaveMarkup() {
    const canvas = canvasRef.current;
    if (!canvas || strokes.length === 0) return;
    setSaving(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) { showToast('Failed to capture markup.'); setSaving(false); return; }
      const fd = new FormData();
      fd.append('file', blob, `markup-${Date.now()}.png`);
      fd.append('projectId', projectId);
      fd.append('category', 'Markup');
      fd.append('caption', `Markup on ${getFileName(selected!)}`);
      const res = await fetch('/api/photos/upload', { method: 'POST', body: fd });
      if (res.ok) {
        showToast('Markup saved successfully.');
        setMarkupMode(false);
        setStrokes([]);
      } else {
        showToast('Failed to save markup.');
      }
    } catch {
      showToast('Error saving markup.');
    }
    setSaving(false);
  }

  function handleDownload() {
    if (!selected) return;
    const url = getFileUrl(selected);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = getFileName(selected);
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function handleShare() {
    if (!selected) return;
    const url = getFileUrl(selected);
    if (navigator.share) {
      try {
        await navigator.share({ title: getFileName(selected), url });
      } catch {
        // user cancelled
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        showToast('Link copied to clipboard.');
      } catch {
        showToast('Unable to share.');
      }
    }
  }

  // NEW: Folder helpers
  function toggleFolder(pathKey: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(pathKey)) next.delete(pathKey);
      else next.add(pathKey);
      return next;
    });
  }

  function selectFolder(folder: FolderNode) {
    setSelectedFolder(folder);
    setBreadcrumb(['Home', ...folder.path]);
  }

  function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    const parentPath = selectedFolder ? selectedFolder.path : [];
    const newFolder: FolderNode = {
      name: newFolderName.trim(),
      path: [...parentPath, newFolderName.trim()],
      color: GOLD,
      fileCount: 0,
      children: [],
    };
    if (selectedFolder) {
      setFolderTree((prev) => {
        const addChild = (nodes: FolderNode[]): FolderNode[] =>
          nodes.map((n) => {
            if (n.path.join('/') === selectedFolder!.path.join('/')) {
              return { ...n, children: [...n.children, newFolder] };
            }
            return { ...n, children: addChild(n.children) };
          });
        return addChild(prev);
      });
      // Auto-expand parent
      setExpandedFolders((prev) => new Set([...prev, selectedFolder.path.join('/')]));
    } else {
      setFolderTree((prev) => [...prev, newFolder]);
    }
    setNewFolderName('');
    setShowNewFolderInput(false);
    showToast(`Folder "${newFolderName.trim()}" created`);
  }

  function handleBreadcrumbClick(index: number) {
    if (index === 0) {
      setSelectedFolder(null);
      setBreadcrumb(['Home']);
    } else {
      const targetPath = breadcrumb.slice(1, index + 1);
      // Find the folder node matching this path
      const findNode = (nodes: FolderNode[]): FolderNode | null => {
        for (const n of nodes) {
          if (n.path.join('/') === targetPath.join('/')) return n;
          const found = findNode(n.children);
          if (found) return found;
        }
        return null;
      };
      const node = findNode(folderTree);
      if (node) selectFolder(node);
    }
  }

  // NEW: Search & filter logic
  function getFilteredFiles(): DocFile[] {
    let result = [...files];

    // Filter by selected folder
    if (selectedFolder) {
      const folderName = selectedFolder.name.toLowerCase();
      result = result.filter((f) => (f.category || '').toLowerCase() === folderName);
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((f) => {
        const name = getFileName(f).toLowerCase();
        const cat = (f.category || '').toLowerCase();
        return name.includes(q) || cat.includes(q);
      });
    }

    // File type filter
    if (filterFileType !== 'All') {
      result = result.filter((f) => getFileTypeCategory(f) === filterFileType);
    }

    // Date range filter
    if (dateFrom) {
      const from = new Date(dateFrom);
      result = result.filter((f) => {
        const d = getFileDate(f);
        return d ? new Date(d) >= from : true;
      });
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((f) => {
        const d = getFileDate(f);
        return d ? new Date(d) <= to : true;
      });
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name': return getFileName(a).localeCompare(getFileName(b));
        case 'date': return (getFileDate(b) || '').localeCompare(getFileDate(a) || '');
        case 'size': return getFileSize(b) - getFileSize(a);
        case 'type': return getFileTypeCategory(a).localeCompare(getFileTypeCategory(b));
        default: return 0;
      }
    });

    return result;
  }

  // NEW: Version control handlers
  function handleUploadNewVersion() {
    fileInputRef.current?.click();
  }

  function handleVersionFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    // Simulate version creation
    const existingVersions = docVersions[selected.id] || [];
    const nextVersion = existingVersions.length > 0 ? Math.max(...existingVersions.map((v) => v.version)) + 1 : 1;
    // Mark old versions as not current
    const updated = existingVersions.map((v) => ({ ...v, isCurrent: false }));
    updated.push({
      version: nextVersion,
      uploadedBy: 'Current User',
      date: new Date().toISOString(),
      fileSize: file.size,
      changeNotes: versionNotes || 'New version uploaded',
      isCurrent: true,
    });
    setDocVersions((prev) => ({ ...prev, [selected.id]: updated }));
    setShowUploadVersion(false);
    setVersionNotes('');
    showToast(`Version v${nextVersion} uploaded successfully`);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleRevertVersion(version: number) {
    if (!selected) return;
    const versions = docVersions[selected.id] || [];
    const updated = versions.map((v) => ({ ...v, isCurrent: v.version === version }));
    setDocVersions((prev) => ({ ...prev, [selected.id]: updated }));
    showToast(`Reverted to version v${version}`);
  }

  function handleCompareVersions(v1: number, v2: number) {
    showToast(`Comparing v${v1} and v${v2} - opening side by side view`);
    // In a real app, this would open a comparison viewer
  }

  // NEW: Tag handlers
  function handleAddTag(tag: string) {
    if (!selected) return;
    const existing = docTags[selected.id] || [];
    if (existing.includes(tag)) return;
    setDocTags((prev) => ({ ...prev, [selected.id]: [...existing, tag] }));
  }

  function handleRemoveTag(tag: string) {
    if (!selected) return;
    const existing = docTags[selected.id] || [];
    setDocTags((prev) => ({ ...prev, [selected.id]: existing.filter((t) => t !== tag) }));
  }

  // ─── Viewer ───
  if (selected) {
    const fileType = getFileType(selected);
    const url = getFileUrl(selected);
    const currentVersions = docVersions[selected.id] || [];
    const currentVersion = currentVersions.find((v) => v.isCurrent);
    const containerStyle: React.CSSProperties = fullScreen
      ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, background: '#000', display: 'flex', flexDirection: 'column' }
      : { padding: '18px 16px', minHeight: '100vh', background: '#060C15' };

    return (
      <div style={containerStyle}>
        {/* Hidden file input for version uploads */}
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={handleVersionFileSelected}
        />

        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: fullScreen ? '12px 16px' : '0 0 12px', background: fullScreen ? 'rgba(6,12,21,.95)' : 'transparent' }}>
          <button onClick={() => { if (fullScreen) { setFullScreen(false); } else { setSelected(null); setMarkupMode(false); setStrokes([]); setShowVersionHistory(false); setShowDocInfo(false); } }} style={backBtn}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>
            <span style={{ marginLeft: 6, fontSize: 13 }}>{fullScreen ? 'Exit Full Screen' : 'Back'}</span>
          </button>

          {/* Version badge */}
          {currentVersion && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 'auto', marginLeft: 12 }}>
              <span style={{
                padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                background: GREEN, color: '#000',
              }}>
                v{currentVersion.version}
              </span>
              <span style={{ fontSize: 12, color: DIM }}>{getFileName(selected)}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6 }}>
            {/* Doc Info button */}
            <button onClick={() => { setShowDocInfo(!showDocInfo); setShowVersionHistory(false); }} style={{ ...iconBtn, background: showDocInfo ? 'rgba(212,160,23,0.15)' : undefined, color: showDocInfo ? GOLD : DIM }} title="Document Info">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}>
                <circle cx={12} cy={12} r={10}/><line x1={12} y1={16} x2={12} y2={12}/><line x1={12} y1={8} x2={12.01} y2={8}/>
              </svg>
            </button>

            {/* Version History button */}
            <button onClick={() => { setShowVersionHistory(!showVersionHistory); setShowDocInfo(false); }} style={{ ...iconBtn, background: showVersionHistory ? 'rgba(59,130,246,0.15)' : undefined, color: showVersionHistory ? BLUE : DIM }} title="Version History">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}>
                <circle cx={12} cy={12} r={10}/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </button>

            {/* Upload New Version button */}
            <button onClick={() => setShowUploadVersion(!showUploadVersion)} style={{ ...iconBtn, color: showUploadVersion ? AMBER : DIM }} title="Upload New Version">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}>
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1={12} y1={3} x2={12} y2={15}/>
              </svg>
            </button>

            <button onClick={() => setFullScreen(!fullScreen)} style={iconBtn} title="Full Screen">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}>
                {fullScreen ? (<><polyline points="4 14 4 20 10 20"/><polyline points="20 10 20 4 14 4"/><line x1={14} y1={10} x2={21} y2={3}/><line x1={3} y1={21} x2={10} y2={14}/></>) : (<><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1={21} y1={3} x2={14} y2={10}/><line x1={3} y1={21} x2={10} y2={14}/></>)}
              </svg>
            </button>
            <button onClick={handleDownload} style={iconBtn} title="Download">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1={12} y1={15} x2={12} y2={3}/></svg>
            </button>
            <button onClick={handleShare} style={iconBtn} title="Share">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><circle cx={18} cy={5} r={3}/><circle cx={6} cy={12} r={3}/><circle cx={18} cy={19} r={3}/><line x1={8.59} y1={13.51} x2={15.42} y2={17.49}/><line x1={15.41} y1={6.51} x2={8.59} y2={10.49}/></svg>
            </button>
            {(fileType === 'pdf' || fileType === 'image') && (
              <button onClick={() => { setMarkupMode(!markupMode); if (markupMode) setStrokes([]); }} style={{ ...iconBtn, background: markupMode ? GOLD : undefined, color: markupMode ? '#000' : DIM }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx={11} cy={11} r={2}/></svg>
              </button>
            )}
          </div>
        </div>

        {toast && (
          <div style={{ margin: '0 16px 8px', padding: '8px 12px', background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, color: GREEN, fontSize: 12, textAlign: 'center' }}>{toast}</div>
        )}

        {/* Upload New Version panel */}
        {showUploadVersion && (
          <div style={{ margin: '0 16px 8px', padding: 14, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12 }}>
            <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600, color: TEXT }}>Upload New Version</h4>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Change Notes</label>
              <input
                type="text"
                value={versionNotes}
                onChange={(e) => setVersionNotes(e.target.value)}
                placeholder="Describe what changed..."
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(139,170,200,0.06)',
                  border: `1px solid ${BORDER}`, color: TEXT, fontSize: 12, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleUploadNewVersion} style={{ ...smallBtn, background: GOLD, color: '#000', fontWeight: 600, border: 'none', padding: '6px 14px' }}>
                Select File
              </button>
              <button onClick={() => { setShowUploadVersion(false); setVersionNotes(''); }} style={smallBtn}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Version History Panel */}
        {showVersionHistory && currentVersions.length > 0 && (
          <div style={{ margin: '0 16px 8px' }}>
            <VersionHistoryPanel
              versions={currentVersions}
              onClose={() => setShowVersionHistory(false)}
              onRevert={handleRevertVersion}
              onCompare={handleCompareVersions}
            />
          </div>
        )}

        {/* Document Info Panel */}
        {showDocInfo && (
          <div style={{ margin: '0 16px 8px' }}>
            <DocInfoPanel
              doc={selected}
              versions={currentVersions}
              tags={docTags[selected.id] || []}
              linkedItems={docLinkedItems[selected.id] || [
                { type: 'RFI', id: '041', title: 'Column reinforcement clarification' },
                { type: 'Submittal', id: '023', title: 'Structural steel shop drawings' },
              ]}
              accessLog={docAccessLog[selected.id] || [
                { user: 'John Smith', action: 'viewed', date: new Date(Date.now() - 3600000).toISOString() },
                { user: 'Sarah Chen', action: 'downloaded', date: new Date(Date.now() - 86400000).toISOString() },
                { user: 'Mike Davis', action: 'viewed', date: new Date(Date.now() - 172800000).toISOString() },
              ]}
              onClose={() => setShowDocInfo(false)}
              onAddTag={handleAddTag}
              onRemoveTag={handleRemoveTag}
            />
          </div>
        )}

        {/* Markup toolbar */}
        {markupMode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: RAISED, borderBottom: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: DIM, fontWeight: 600 }}>Color:</span>
            {MARKUP_COLORS.map((c) => (
              <button key={c.value} onClick={() => setMarkupColor(c.value)}
                style={{ width: 24, height: 24, borderRadius: 12, background: c.value, border: markupColor === c.value ? '3px solid #fff' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />
            ))}
            <span style={{ fontSize: 11, color: DIM, fontWeight: 600, marginLeft: 8 }}>Width:</span>
            {LINE_WIDTHS.map((w) => (
              <button key={w.name} onClick={() => setLineWidth(w.value)}
                style={{ padding: '3px 8px', borderRadius: 6, background: lineWidth === w.value ? GOLD : 'transparent', border: `1px solid ${lineWidth === w.value ? GOLD : BORDER}`, color: lineWidth === w.value ? '#000' : DIM, fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                {w.name}
              </button>
            ))}
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              <button onClick={handleUndo} disabled={strokes.length === 0} style={{ ...smallBtn, opacity: strokes.length === 0 ? 0.4 : 1 }}>Undo</button>
              <button onClick={handleClearAll} disabled={strokes.length === 0} style={{ ...smallBtn, opacity: strokes.length === 0 ? 0.4 : 1 }}>Clear</button>
              <button onClick={handleSaveMarkup} disabled={strokes.length === 0 || saving} style={{ ...smallBtn, background: GREEN, color: '#000', fontWeight: 700, opacity: strokes.length === 0 || saving ? 0.4 : 1 }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* Document viewer */}
        <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'auto', touchAction: markupMode ? 'none' : 'auto' }}>
          {fileType === 'pdf' && url && (
            <iframe src={url} style={{ width: '100%', height: '100%', minHeight: fullScreen ? '100%' : '70vh', border: 'none', background: '#fff' }} />
          )}
          {fileType === 'image' && url && (
            <img src={url} alt={getFileName(selected)} style={{ width: '100%', height: 'auto', display: 'block' }} />
          )}
          {fileType === 'other' && (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: DIM }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={48} height={48} style={{ marginBottom: 12 }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <p style={{ margin: '0 0 12px', fontSize: 15, color: TEXT }}>Preview not available</p>
              <p style={{ margin: 0, fontSize: 13 }}>Download to view this file.</p>
            </div>
          )}
          {/* Canvas overlay for markup */}
          {markupMode && (
            <canvas
              ref={canvasRef}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', cursor: 'crosshair', touchAction: 'none' }}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handlePointerUp}
            />
          )}
        </div>
      </div>
    );
  }

  // ─── List view ───
  const filteredFiles = getFilteredFiles();
  const fileTypeFilters = ['All', 'PDF', 'DWG', 'Image', 'Spreadsheet', 'Other'];
  const sortOptions: Array<{ value: 'name' | 'date' | 'size' | 'type'; label: string }> = [
    { value: 'name', label: 'Name' },
    { value: 'date', label: 'Date Modified' },
    { value: 'size', label: 'Size' },
    { value: 'type', label: 'Type' },
  ];

  return (
    <div style={{ padding: '18px 16px', minHeight: '100vh', background: '#060C15' }}>
      {/* Hidden file input for version uploads */}
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleVersionFileSelected}
      />

      <button onClick={() => router.back()} style={backBtn}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>
      </button>
      <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: TEXT }}>Documents</h1>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: DIM }}>Project files and documents</p>

      {toast && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, color: GREEN, fontSize: 12, textAlign: 'center' }}>{toast}</div>
      )}

      {/* Search bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10,
        }}>
          <SearchIcon size={16} color={DIM} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents..."
            style={{
              flex: 1, background: 'transparent', border: 'none', color: TEXT, fontSize: 13, outline: 'none',
            }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: 0, display: 'flex' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={14} height={14}>
                <line x1={18} y1={6} x2={6} y2={18}/><line x1={6} y1={6} x2={18} y2={18}/>
              </svg>
            </button>
          )}
        </div>
        <button
          onClick={() => setShowSearchPanel(!showSearchPanel)}
          style={{
            ...iconBtn,
            background: showSearchPanel ? 'rgba(212,160,23,0.12)' : iconBtn.background,
            color: showSearchPanel ? GOLD : DIM,
            border: showSearchPanel ? `1px solid rgba(212,160,23,0.3)` : `1px solid ${BORDER}`,
          }}
          title="Advanced Search"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}>
            <line x1={4} y1={21} x2={4} y2={14}/><line x1={4} y1={10} x2={4} y2={3}/>
            <line x1={12} y1={21} x2={12} y2={12}/><line x1={12} y1={8} x2={12} y2={3}/>
            <line x1={20} y1={21} x2={20} y2={16}/><line x1={20} y1={12} x2={20} y2={3}/>
            <line x1={1} y1={14} x2={7} y2={14}/><line x1={9} y1={8} x2={15} y2={8}/><line x1={17} y1={16} x2={23} y2={16}/>
          </svg>
        </button>
        <button
          onClick={() => setShowFolderTree(!showFolderTree)}
          style={{
            ...iconBtn,
            background: showFolderTree ? 'rgba(212,160,23,0.12)' : iconBtn.background,
            color: showFolderTree ? GOLD : DIM,
            border: showFolderTree ? `1px solid rgba(212,160,23,0.3)` : `1px solid ${BORDER}`,
          }}
          title="Toggle Folder Tree"
        >
          <FolderIcon color={showFolderTree ? GOLD : DIM} size={18} />
        </button>
      </div>

      {/* Advanced search panel */}
      {showSearchPanel && (
        <div style={{
          marginBottom: 12, padding: 14, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>Filters</span>
            <button onClick={() => { setFilterFileType('All'); setDateFrom(''); setDateTo(''); setSortBy('name'); }} style={{ ...smallBtn, fontSize: 11 }}>
              Reset
            </button>
          </div>

          {/* File type filter */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>File Type</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {fileTypeFilters.map((ft) => (
                <button
                  key={ft}
                  onClick={() => setFilterFileType(ft)}
                  style={{
                    padding: '4px 12px', borderRadius: 14, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    background: filterFileType === ft ? GOLD : 'transparent',
                    border: `1px solid ${filterFileType === ft ? GOLD : BORDER}`,
                    color: filterFileType === ft ? '#000' : DIM,
                  }}
                >
                  {ft}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>Date Range</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{
                  flex: 1, padding: '6px 8px', borderRadius: 6, background: 'rgba(139,170,200,0.06)',
                  border: `1px solid ${BORDER}`, color: TEXT, fontSize: 12, outline: 'none',
                  colorScheme: 'dark',
                }}
              />
              <span style={{ color: DIM, fontSize: 12 }}>to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={{
                  flex: 1, padding: '6px 8px', borderRadius: 6, background: 'rgba(139,170,200,0.06)',
                  border: `1px solid ${BORDER}`, color: TEXT, fontSize: 12, outline: 'none',
                  colorScheme: 'dark',
                }}
              />
            </div>
          </div>

          {/* Sort */}
          <div>
            <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>Sort By</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {sortOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSortBy(opt.value)}
                  style={{
                    padding: '4px 12px', borderRadius: 14, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    background: sortBy === opt.value ? BLUE : 'transparent',
                    border: `1px solid ${sortBy === opt.value ? BLUE : BORDER}`,
                    color: sortBy === opt.value ? '#fff' : DIM,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      {selectedFolder && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
          {breadcrumb.map((crumb, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && (
                <svg viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth={2.5} width={12} height={12}>
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              )}
              <button
                onClick={() => handleBreadcrumbClick(idx)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                  color: idx === breadcrumb.length - 1 ? GOLD : DIM,
                  fontSize: 12, fontWeight: idx === breadcrumb.length - 1 ? 600 : 400,
                  textDecoration: idx < breadcrumb.length - 1 ? 'underline' : 'none',
                }}
              >
                {crumb}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        {/* Folder tree sidebar */}
        {showFolderTree && (
          <div style={{
            width: 220, minWidth: 220, background: RAISED, border: `1px solid ${BORDER}`,
            borderRadius: 12, padding: '10px 6px', alignSelf: 'flex-start',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>Folders</span>
              <button
                onClick={() => setShowNewFolderInput(true)}
                style={{ background: 'none', border: 'none', color: GOLD, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                title="Create Folder"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={16} height={16}>
                  <line x1={12} y1={5} x2={12} y2={19}/><line x1={5} y1={12} x2={19} y2={12}/>
                </svg>
              </button>
            </div>

            {/* All files option */}
            <div
              onClick={() => { setSelectedFolder(null); setBreadcrumb(['Home']); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', cursor: 'pointer', borderRadius: 8,
                background: !selectedFolder ? 'rgba(212,160,23,0.12)' : 'transparent',
                border: !selectedFolder ? '1px solid rgba(212,160,23,0.3)' : '1px solid transparent',
              }}
              onMouseEnter={(e) => { if (selectedFolder) (e.currentTarget.style.background = 'rgba(139,170,200,0.06)'); }}
              onMouseLeave={(e) => { if (selectedFolder) (e.currentTarget.style.background = 'transparent'); }}
            >
              <span style={{ width: 14 }} />
              <svg viewBox="0 0 24 24" fill="none" stroke={!selectedFolder ? GOLD : DIM} strokeWidth={2} width={16} height={16}>
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
              <span style={{ fontSize: 13, fontWeight: !selectedFolder ? 600 : 400, color: !selectedFolder ? GOLD : TEXT }}>All Files</span>
              <span style={{ fontSize: 11, color: DIM, marginLeft: 'auto', background: 'rgba(139,170,200,0.08)', borderRadius: 10, padding: '1px 7px' }}>
                {files.length}
              </span>
            </div>

            {/* Folder tree */}
            <div style={{ marginTop: 4 }}>
              {folderTree.map((folder) => (
                <FolderTreeItem
                  key={folder.path.join('/')}
                  folder={folder}
                  depth={0}
                  expandedFolders={expandedFolders}
                  toggleFolder={toggleFolder}
                  onSelect={selectFolder}
                  selectedPath={selectedFolder?.path.join('/') || ''}
                />
              ))}
            </div>

            {/* New folder input */}
            {showNewFolderInput && (
              <div style={{ padding: '8px 8px 4px', marginTop: 6 }}>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setShowNewFolderInput(false); setNewFolderName(''); } }}
                  placeholder="Folder name..."
                  autoFocus
                  style={{
                    width: '100%', padding: '6px 8px', borderRadius: 6, background: 'rgba(139,170,200,0.06)',
                    border: `1px solid ${BORDER}`, color: TEXT, fontSize: 12, outline: 'none', boxSizing: 'border-box',
                    marginBottom: 4,
                  }}
                />
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={handleCreateFolder} style={{ ...smallBtn, background: GOLD, color: '#000', fontWeight: 600, border: 'none', flex: 1, fontSize: 11 }}>
                    Create
                  </button>
                  <button onClick={() => { setShowNewFolderInput(false); setNewFolderName(''); }} style={{ ...smallBtn, flex: 1, fontSize: 11 }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* File list */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: DIM }}>Loading documents...</div>
          ) : filteredFiles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 16px', color: DIM }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={40} height={40} style={{ marginBottom: 8 }}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
              <p style={{ margin: '0 0 4px', fontSize: 14 }}>
                {searchQuery || filterFileType !== 'All' || selectedFolder
                  ? 'No documents match your filters.'
                  : 'No documents found for this project.'}
              </p>
              {(searchQuery || filterFileType !== 'All') && (
                <button
                  onClick={() => { setSearchQuery(''); setFilterFileType('All'); setSelectedFolder(null); setBreadcrumb(['Home']); }}
                  style={{ ...smallBtn, marginTop: 8, background: GOLD, color: '#000', fontWeight: 600, border: 'none' }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Results count */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '0 2px' }}>
                <span style={{ fontSize: 12, color: DIM }}>
                  {filteredFiles.length} document{filteredFiles.length !== 1 ? 's' : ''}
                  {selectedFolder && <span> in <span style={{ color: GOLD }}>{selectedFolder.name}</span></span>}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filteredFiles.map((f) => {
                  const fType = getFileType(f);
                  const fName = getFileName(f);
                  const fDate = getFileDate(f);
                  const fSize = getFileSize(f);
                  const versions = docVersions[f.id] || [];
                  const currentVer = versions.find((v) => v.isCurrent);
                  const tags = docTags[f.id] || [];

                  return (
                    <button
                      key={f.id}
                      onClick={() => setSelected(f)}
                      style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', textAlign: 'left', cursor: 'pointer', width: '100%', display: 'flex', alignItems: 'center', gap: 12 }}
                    >
                      <FileIcon type={fType} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fName}</p>
                          {/* Version badge */}
                          {currentVer && (
                            <span style={{
                              padding: '1px 6px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                              background: GREEN, color: '#000', flexShrink: 0,
                            }}>
                              v{currentVer.version}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                          {fDate && <span style={{ fontSize: 11, color: DIM }}>{formatDate(fDate)}</span>}
                          {fSize > 0 && <span style={{ fontSize: 11, color: DIM }}>{formatSize(fSize)}</span>}
                          {f.category && <span style={{ fontSize: 11, color: GOLD }}>{f.category}</span>}
                          <span style={{ fontSize: 11, color: DIM }}>{getFileTypeCategory(f)}</span>
                          {/* Tags inline */}
                          {tags.length > 0 && tags.slice(0, 2).map((tag) => (
                            <span key={tag} style={{
                              fontSize: 10, padding: '1px 6px', borderRadius: 8,
                              background: 'rgba(212,160,23,0.1)', color: GOLD,
                            }}>
                              {tag}
                            </span>
                          ))}
                          {tags.length > 2 && (
                            <span style={{ fontSize: 10, color: DIM }}>+{tags.length - 2}</span>
                          )}
                        </div>
                      </div>
                      <svg viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth={2} width={16} height={16}><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FieldDocsPage() {
  return <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center' }}>Loading...</div>}><DocsPage /></Suspense>;
}

const backBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#8BAAC8', fontSize: 14, cursor: 'pointer', padding: '0 0 10px', display: 'flex', alignItems: 'center',
};

const iconBtn: React.CSSProperties = {
  background: 'rgba(13,29,46,.8)', border: `1px solid #1E3A5F`, borderRadius: 8, padding: 6, color: '#8BAAC8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const smallBtn: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 6, background: 'transparent', border: `1px solid #1E3A5F`, color: '#8BAAC8', fontSize: 11, cursor: 'pointer',
};
