'use client';
/**
 * Saguaro Field — Photos
 * Camera capture + gallery with category filter, entity linking, tagging, batch ops. Offline queue.
 */
import React, { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

const GOLD   = '#D4A017';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const GREEN  = '#22C55E';
const BLUE   = '#3B82F6';

const CATEGORIES = ['All', 'Progress', 'Issue', 'Delivery', 'Inspection', 'Safety', 'Completion', 'Other'];
const CAT_COLORS: Record<string, string> = {
  Progress: '#3B82F6', Issue: RED, Delivery: '#F59E0B',
  Inspection: '#8B5CF6', Safety: RED, Completion: '#22C55E', Other: DIM,
};

const ENTITY_TYPES = [
  { value: 'punch', label: 'Punch Item', endpoint: 'punch-list', key: 'items' },
  { value: 'rfi', label: 'RFI', endpoint: 'submittals', key: 'submittals' },
  { value: 'inspection', label: 'Inspection', endpoint: 'inspections', key: 'inspections' },
  { value: 'change_order', label: 'Change Order', endpoint: 'proposals', key: 'proposals' },
  { value: 'daily_log', label: 'Daily Log', endpoint: 'daily-logs', key: 'logs' },
  { value: 'observation', label: 'Observation', endpoint: 'observations', key: 'observations' },
  { value: 'submittal', label: 'Submittal', endpoint: 'submittals', key: 'submittals' },
  { value: 'tm_ticket', label: 'T&M Ticket', endpoint: 'tm-tickets', key: 'tickets' },
  { value: 'meeting', label: 'Meeting', endpoint: 'meetings', key: 'meetings' },
];

const PRESET_TAGS = ['Exterior', 'Interior', 'Foundation', 'Framing', 'MEP', 'Finishes', 'Site', 'Safety', 'Progress', 'Deficiency'];

interface Photo {
  id: string;
  url: string;
  filename: string;
  category: string;
  caption: string;
  uploaded: boolean;
  created_at: string;
  latitude?: number;
  longitude?: number;
  uploaded_by?: string;
}

interface EntityLink {
  id: string;
  photo_id: string;
  entity_type: string;
  entity_id: string;
  entity_title: string;
  created_at: string;
}

interface EntityItem {
  id: string;
  title?: string;
  name?: string;
  subject?: string;
  description?: string;
  number?: string;
}

function PhotosPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [filterCat, setFilterCat] = useState('All');
  const [selected, setSelected] = useState<Photo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [online, setOnline] = useState(true);
  const [loadingGallery, setLoadingGallery] = useState(true);

  // Markup state
  const [markupMode, setMarkupMode] = useState(false);
  const [markupColor, setMarkupColor] = useState('#EF4444');
  const [markupStrokes, setMarkupStrokes] = useState<Array<{x:number;y:number;drawing:boolean}[]>>([]);
  const [currentStroke, setCurrentStroke] = useState<{x:number;y:number;drawing:boolean}[]>([]);

  // Pending upload
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState('');
  const [pendingCat, setPendingCat] = useState('Progress');
  const [pendingCaption, setPendingCaption] = useState('');

  // GPS tagging
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLng, setGpsLng] = useState<number | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  // Entity linking state
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkEntityType, setLinkEntityType] = useState('');
  const [linkSearchQuery, setLinkSearchQuery] = useState('');
  const [linkSearchResults, setLinkSearchResults] = useState<EntityItem[]>([]);
  const [linkSearchLoading, setLinkSearchLoading] = useState(false);
  const [selectedPhotoLinks, setSelectedPhotoLinks] = useState<EntityLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);

  // Photo tags state
  const [showTagModal, setShowTagModal] = useState(false);
  const [photoTags, setPhotoTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState('');
  const [tagsLoading, setTagsLoading] = useState(false);

  // Batch selection
  const [batchMode, setBatchMode] = useState(false);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
  const [showBatchLinkModal, setShowBatchLinkModal] = useState(false);

  // Advanced filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterEntityType, setFilterEntityType] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterUploader, setFilterUploader] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Load gallery
  const loadPhotos = useCallback(() => {
    if (!projectId) { setLoadingGallery(false); return; }
    setLoadingGallery(true);
    const params = new URLSearchParams();
    if (filterEntityType) params.set('entity_type', filterEntityType);
    if (filterTag) params.set('tag', filterTag);
    if (filterDateFrom) params.set('date_from', filterDateFrom);
    if (filterDateTo) params.set('date_to', filterDateTo);
    if (filterUploader) params.set('uploader', filterUploader);
    if (sortBy) params.set('sort', sortBy);
    const qs = params.toString();
    fetch(`/api/projects/${projectId}/photos${qs ? '?' + qs : ''}`)
      .then((r) => r.ok ? r.json() : { photos: [] })
      .then((d) => {
        const list: Photo[] = (d.photos || []).map((p: Record<string, unknown>) => ({
          id: String(p.id || ''),
          url: String(p.url || ''),
          filename: String(p.filename || ''),
          category: String(p.category || 'Progress'),
          caption: String(p.caption || ''),
          uploaded: true,
          created_at: String(p.created_at || new Date().toISOString()),
          latitude: p.latitude ? Number(p.latitude) : undefined,
          longitude: p.longitude ? Number(p.longitude) : undefined,
          uploaded_by: p.uploaded_by ? String(p.uploaded_by) : undefined,
        }));
        setPhotos(list);
      })
      .catch(() => {})
      .finally(() => setLoadingGallery(false));
  }, [projectId, filterEntityType, filterTag, filterDateFrom, filterDateTo, filterUploader, sortBy]);

  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  // Load links for selected photo
  const loadPhotoLinks = useCallback((photoId: string) => {
    if (!projectId || !photoId) return;
    setLinksLoading(true);
    fetch(`/api/projects/${projectId}/photos/link?photo_id=${photoId}`)
      .then(r => r.ok ? r.json() : { links: [] })
      .then(d => setSelectedPhotoLinks(d.links || []))
      .catch(() => setSelectedPhotoLinks([]))
      .finally(() => setLinksLoading(false));
  }, [projectId]);

  // Load tags for selected photo
  const loadPhotoTags = useCallback((photoId: string) => {
    if (!projectId || !photoId) return;
    setTagsLoading(true);
    fetch(`/api/projects/${projectId}/photos?tag=&photo_id=${photoId}`)
      .then(() => {
        // Fetch tags from photo_tags table directly via a simple approach
        // We'll use the link endpoint pattern but for tags we need a dedicated call
        // For now, load from the tags stored in state or fetch
      })
      .catch(() => {})
      .finally(() => setTagsLoading(false));
    // Fetch tags via supabase directly isn't possible client-side without an endpoint
    // We'll store tags locally and sync
  }, [projectId]);

  useEffect(() => {
    if (selected) {
      loadPhotoLinks(selected.id);
      loadPhotoTags(selected.id);
    } else {
      setSelectedPhotoLinks([]);
      setPhotoTags([]);
    }
  }, [selected, loadPhotoLinks, loadPhotoTags]);

  // Search entities for linking
  const searchEntities = useCallback(async (entityType: string, query: string) => {
    if (!projectId || !entityType) return;
    setLinkSearchLoading(true);
    const entityDef = ENTITY_TYPES.find(e => e.value === entityType);
    if (!entityDef) { setLinkSearchLoading(false); return; }
    try {
      const res = await fetch(`/api/projects/${projectId}/${entityDef.endpoint}`);
      if (!res.ok) { setLinkSearchResults([]); return; }
      const data = await res.json();
      const items: EntityItem[] = (data[entityDef.key] || data.items || data.data || []).map((item: Record<string, unknown>) => ({
        id: String(item.id || ''),
        title: String(item.title || item.name || item.subject || item.description || ''),
        number: item.number ? String(item.number) : undefined,
      }));
      // Filter by search query
      const q = query.toLowerCase();
      const filtered = q ? items.filter(i =>
        (i.title || '').toLowerCase().includes(q) ||
        (i.number || '').toLowerCase().includes(q) ||
        i.id.toLowerCase().includes(q)
      ) : items;
      setLinkSearchResults(filtered.slice(0, 20));
    } catch {
      setLinkSearchResults([]);
    } finally {
      setLinkSearchLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (linkEntityType) {
      const timer = setTimeout(() => searchEntities(linkEntityType, linkSearchQuery), 300);
      return () => clearTimeout(timer);
    }
    setLinkSearchResults([]);
    return undefined;
  }, [linkEntityType, linkSearchQuery, searchEntities]);

  // Link photo to entity
  const linkPhotoToEntity = async (photoId: string, entityType: string, entityId: string, entityTitle: string, photoUrl?: string) => {
    if (!projectId) return;
    try {
      if (!online) {
        await enqueue({
          url: `/api/projects/${projectId}/photos/link`,
          method: 'POST',
          body: JSON.stringify({ photo_id: photoId, entity_type: entityType, entity_id: entityId, entity_title: entityTitle, photo_url: photoUrl }),
          contentType: 'application/json',
          isFormData: false,
        });
        setSelectedPhotoLinks(prev => [...prev, { id: `local-${Date.now()}`, photo_id: photoId, entity_type: entityType, entity_id: entityId, entity_title: entityTitle, created_at: new Date().toISOString() }]);
        return;
      }
      const res = await fetch(`/api/projects/${projectId}/photos/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_id: photoId, entity_type: entityType, entity_id: entityId, entity_title: entityTitle, photo_url: photoUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedPhotoLinks(prev => [...prev, data.link]);
      }
    } catch {
      // Queue offline
      await enqueue({
        url: `/api/projects/${projectId}/photos/link`,
        method: 'POST',
        body: JSON.stringify({ photo_id: photoId, entity_type: entityType, entity_id: entityId, entity_title: entityTitle, photo_url: photoUrl }),
        contentType: 'application/json',
        isFormData: false,
      });
    }
  };

  // Unlink photo from entity
  const unlinkPhoto = async (link: EntityLink) => {
    if (!projectId) return;
    try {
      if (!online) {
        await enqueue({
          url: `/api/projects/${projectId}/photos/link?id=${link.id}`,
          method: 'DELETE',
          body: null,
          contentType: '',
          isFormData: false,
        });
        setSelectedPhotoLinks(prev => prev.filter(l => l.id !== link.id));
        return;
      }
      const res = await fetch(`/api/projects/${projectId}/photos/link?id=${link.id}`, { method: 'DELETE' });
      if (res.ok) {
        setSelectedPhotoLinks(prev => prev.filter(l => l.id !== link.id));
      }
    } catch {
      await enqueue({
        url: `/api/projects/${projectId}/photos/link?id=${link.id}`,
        method: 'DELETE',
        body: null,
        contentType: '',
        isFormData: false,
      });
      setSelectedPhotoLinks(prev => prev.filter(l => l.id !== link.id));
    }
  };

  // Batch link
  const batchLinkToEntity = async (entityType: string, entityId: string, entityTitle: string) => {
    for (const photoId of batchSelected) {
      const photo = photos.find(p => p.id === photoId);
      await linkPhotoToEntity(photoId, entityType, entityId, entityTitle, photo?.url);
    }
    setBatchSelected(new Set());
    setBatchMode(false);
    setShowBatchLinkModal(false);
  };

  // Add tag to photo
  const addTag = async (photoId: string, tag: string) => {
    if (!projectId || !tag.trim()) return;
    const normalizedTag = tag.trim();
    if (photoTags.includes(normalizedTag)) return;
    try {
      // We use the photos POST with tags, but for adding individual tags we call the link API pattern
      // Since we have photo_tags table, we'll call a custom approach via the link endpoint
      // Actually, let's add a tag via direct supabase call pattern - use the photos route
      if (online) {
        // Store tag via a lightweight POST
        await fetch(`/api/projects/${projectId}/photos/link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photo_id: photoId, entity_type: '_tag', entity_id: normalizedTag, entity_title: normalizedTag }),
        });
      } else {
        await enqueue({
          url: `/api/projects/${projectId}/photos/link`,
          method: 'POST',
          body: JSON.stringify({ photo_id: photoId, entity_type: '_tag', entity_id: normalizedTag, entity_title: normalizedTag }),
          contentType: 'application/json',
          isFormData: false,
        });
      }
      setPhotoTags(prev => [...prev, normalizedTag]);
    } catch {
      // Still add locally
      setPhotoTags(prev => [...prev, normalizedTag]);
    }
  };

  const removeTag = async (photoId: string, tag: string) => {
    if (!projectId) return;
    try {
      if (online) {
        await fetch(`/api/projects/${projectId}/photos/link?photo_id=${photoId}&entity_type=_tag&entity_id=${encodeURIComponent(tag)}`, { method: 'DELETE' });
      } else {
        await enqueue({
          url: `/api/projects/${projectId}/photos/link?photo_id=${photoId}&entity_type=_tag&entity_id=${encodeURIComponent(tag)}`,
          method: 'DELETE',
          body: null,
          contentType: '',
          isFormData: false,
        });
      }
      setPhotoTags(prev => prev.filter(t => t !== tag));
    } catch {
      setPhotoTags(prev => prev.filter(t => t !== tag));
    }
  };

  // Load tags from links (stored as entity_type='_tag')
  useEffect(() => {
    if (selected && selectedPhotoLinks.length > 0) {
      const tags = selectedPhotoLinks
        .filter(l => l.entity_type === '_tag')
        .map(l => l.entity_title || l.entity_id);
      setPhotoTags(tags);
    } else if (selected) {
      setPhotoTags([]);
    }
  }, [selected, selectedPhotoLinks]);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPendingPreview(String(ev.target?.result || ''));
    reader.readAsDataURL(file);
    e.target.value = '';
    setGpsLat(null);
    setGpsLng(null);
    if (navigator.geolocation) {
      setGpsLoading(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => { setGpsLat(pos.coords.latitude); setGpsLng(pos.coords.longitude); setGpsLoading(false); },
        () => setGpsLoading(false),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  };

  const cancelPending = () => {
    setPendingFile(null);
    setPendingPreview('');
    setPendingCaption('');
    setPendingCat('Progress');
  };

  const uploadPhoto = useCallback(async () => {
    if (!pendingFile) return;
    setUploading(true);

    const localPhoto: Photo = {
      id: `local-${Date.now()}`,
      url: pendingPreview,
      filename: pendingFile.name,
      category: pendingCat,
      caption: pendingCaption,
      uploaded: false,
      created_at: new Date().toISOString(),
      latitude: gpsLat ?? undefined,
      longitude: gpsLng ?? undefined,
    };

    try {
      if (!online) throw new Error('offline');
      const fd = new FormData();
      fd.append('file', pendingFile, pendingFile.name);
      fd.append('category', pendingCat);
      fd.append('caption', pendingCaption);
      if (gpsLat !== null) fd.append('gps_lat', String(gpsLat));
      if (gpsLng !== null) fd.append('gps_lng', String(gpsLng));

      const res = await fetch(`/api/projects/${projectId}/photos`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();

      const savedPhoto: Photo = {
        id: String(data.photo?.id || Date.now()),
        url: String(data.photo?.url || pendingPreview),
        filename: String(data.photo?.filename || pendingFile.name),
        category: pendingCat,
        caption: pendingCaption,
        uploaded: true,
        created_at: String(data.photo?.created_at || new Date().toISOString()),
        latitude: gpsLat ?? undefined,
        longitude: gpsLng ?? undefined,
      };
      setPhotos((prev) => [savedPhoto, ...prev]);
    } catch {
      const base64 = pendingPreview.split(',')[1] || '';
      await enqueue({
        url: `/api/projects/${projectId}/photos`,
        method: 'POST',
        body: null,
        contentType: '',
        isFormData: true,
        formDataEntries: [
          { name: 'file', value: base64, filename: pendingFile.name, type: pendingFile.type },
          { name: 'category', value: pendingCat },
          { name: 'caption', value: pendingCaption },
          ...(gpsLat !== null ? [{ name: 'gps_lat', value: String(gpsLat) }] : []),
          ...(gpsLng !== null ? [{ name: 'gps_lng', value: String(gpsLng) }] : []),
        ],
      });
      setPhotos((prev) => [localPhoto, ...prev]);
    }

    cancelPending();
    setUploading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFile, pendingPreview, pendingCat, pendingCaption, projectId, online, gpsLat, gpsLng]);

  const enterMarkup = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMarkupMode(true);
    setMarkupStrokes([]);
    setCurrentStroke([]);
    setTimeout(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    }, 50);
  };

  const exitMarkup = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMarkupMode(false);
    setMarkupStrokes([]);
    setCurrentStroke([]);
  };

  const undoStroke = (e: React.MouseEvent) => {
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const newStrokes = markupStrokes.slice(0, -1);
    setMarkupStrokes(newStrokes);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    newStrokes.forEach(stroke => {
      ctx.beginPath();
      stroke.forEach((pt, idx) => {
        if (idx === 0) { ctx.moveTo(pt.x, pt.y); }
        else {
          ctx.lineTo(pt.x, pt.y);
          ctx.strokeStyle = markupColor;
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.stroke();
        }
      });
    });
  };

  const saveMarkup = (e: React.MouseEvent) => {
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas || !selected) return;
    const dataUrl = canvas.toDataURL('image/png');
    const savedPhoto: Photo = {
      id: `markup-${Date.now()}`,
      url: dataUrl,
      filename: `markup-${selected.filename || 'photo'}.png`,
      category: selected.category,
      caption: `Markup of: ${selected.caption || selected.filename}`,
      uploaded: false,
      created_at: new Date().toISOString(),
    };
    setPhotos(prev => [savedPhoto, ...prev]);
    setMarkupMode(false);
    setMarkupStrokes([]);
    setCurrentStroke([]);
    setSelected(savedPhoto);
  };

  const handleCanvasTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (e.type === 'touchstart') {
      ctx.beginPath();
      ctx.moveTo(x, y);
      setCurrentStroke([{x, y, drawing: false}]);
    } else {
      ctx.lineTo(x, y);
      ctx.strokeStyle = markupColor;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.stroke();
      setCurrentStroke(prev => [...prev, {x, y, drawing: true}]);
    }
  };

  const handleCanvasTouchEnd = () => {
    if (currentStroke.length > 0) {
      setMarkupStrokes(prev => [...prev, currentStroke]);
      setCurrentStroke([]);
    }
  };

  const mouseDrawing = useRef(false);
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    mouseDrawing.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(x, y);
    setCurrentStroke([{x, y, drawing: false}]);
  };
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!mouseDrawing.current) return;
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(x, y);
    ctx.strokeStyle = markupColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    setCurrentStroke(prev => [...prev, {x, y, drawing: true}]);
  };
  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    mouseDrawing.current = false;
    if (currentStroke.length > 0) {
      setMarkupStrokes(prev => [...prev, currentStroke]);
      setCurrentStroke([]);
    }
  };

  const toggleBatchSelect = (photoId: string) => {
    setBatchSelected(prev => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  };

  const filteredPhotos = filterCat === 'All' ? photos : photos.filter((p) => p.category === filterCat);
  const entityLinksOnly = selectedPhotoLinks.filter(l => l.entity_type !== '_tag');

  const getEntityLabel = (type: string) => {
    const def = ENTITY_TYPES.find(e => e.value === type);
    return def?.label || type;
  };

  const clearFilters = () => {
    setFilterEntityType('');
    setFilterTag('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterUploader('');
    setSortBy('newest');
    setFilterCat('All');
  };

  const hasActiveFilters = filterEntityType || filterTag || filterDateFrom || filterDateTo || filterUploader || sortBy !== 'newest';

  return (
    <div style={{ padding: '18px 16px' }}>
      {/* Header */}
      <button onClick={() => router.back()} style={backBtn}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg></button>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>Photos</h1>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: DIM }}>{photos.length} photo{photos.length !== 1 ? 's' : ''} on this project</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!online && <span style={{ fontSize: 12, color: RED, fontWeight: 700 }}>Offline</span>}
          {/* Batch mode toggle */}
          <button
            onClick={() => { setBatchMode(!batchMode); setBatchSelected(new Set()); }}
            style={{ background: batchMode ? 'rgba(59,130,246,.2)' : 'transparent', border: `1px solid ${batchMode ? BLUE : BORDER}`, borderRadius: 8, padding: '6px 10px', color: batchMode ? BLUE : DIM, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            {batchMode ? 'Cancel' : 'Select'}
          </button>
          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{ background: hasActiveFilters ? 'rgba(212,160,23,.15)' : 'transparent', border: `1px solid ${hasActiveFilters ? GOLD : BORDER}`, borderRadius: 8, padding: '6px 10px', color: hasActiveFilters ? GOLD : DIM, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            Filters
          </button>
        </div>
      </div>

      {/* Batch action bar */}
      {batchMode && batchSelected.size > 0 && (
        <div style={{ background: 'rgba(59,130,246,.1)', border: `1px solid ${BLUE}`, borderRadius: 12, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: BLUE, fontSize: 14, fontWeight: 700 }}>{batchSelected.size} selected</span>
          <button
            onClick={() => setShowBatchLinkModal(true)}
            style={{ background: BLUE, border: 'none', borderRadius: 8, padding: '8px 14px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
            Link All to Item
          </button>
        </div>
      )}

      {/* Advanced filters panel */}
      {showFilters && (
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Filters & Sort</span>
            {hasActiveFilters && (
              <button onClick={clearFilters} style={{ background: 'transparent', border: 'none', color: RED, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Clear All</button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {/* Entity type filter */}
            <div>
              <label style={lbl}>Linked Entity Type</label>
              <select
                value={filterEntityType}
                onChange={e => setFilterEntityType(e.target.value)}
                style={{ ...inp, marginTop: 4, appearance: 'auto' as React.CSSProperties['appearance'] }}
              >
                <option value="">All Types</option>
                {ENTITY_TYPES.map(et => (
                  <option key={et.value} value={et.value}>{et.label}</option>
                ))}
              </select>
            </div>
            {/* Tag filter */}
            <div>
              <label style={lbl}>Tag</label>
              <select
                value={filterTag}
                onChange={e => setFilterTag(e.target.value)}
                style={{ ...inp, marginTop: 4, appearance: 'auto' as React.CSSProperties['appearance'] }}
              >
                <option value="">All Tags</option>
                {PRESET_TAGS.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            {/* Date from */}
            <div>
              <label style={lbl}>Date From</label>
              <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} style={{ ...inp, marginTop: 4 }} />
            </div>
            {/* Date to */}
            <div>
              <label style={lbl}>Date To</label>
              <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} style={{ ...inp, marginTop: 4 }} />
            </div>
            {/* Uploader */}
            <div>
              <label style={lbl}>Uploader</label>
              <input type="text" value={filterUploader} onChange={e => setFilterUploader(e.target.value)} placeholder="Email..." style={{ ...inp, marginTop: 4 }} />
            </div>
            {/* Sort */}
            <div>
              <label style={lbl}>Sort By</label>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                style={{ ...inp, marginTop: 4, appearance: 'auto' as React.CSSProperties['appearance'] }}
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="most_linked">Most Linked</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Capture button */}
      {!pendingPreview && (
        <>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFilePick} style={{ display: 'none' }} />
          <button
            onClick={() => fileRef.current?.click()}
            style={{ width: '100%', background: RAISED, border: `2px dashed rgba(212,160,23,.5)`, borderRadius: 14, padding: '22px', color: GOLD, fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 16 }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={32} height={32}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx={12} cy={13} r={4}/></svg>
            Take or Upload a Photo
          </button>
        </>
      )}

      {/* Preview + form */}
      {pendingPreview && (
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pendingPreview} alt="Preview" style={{ width: '100%', maxHeight: 280, objectFit: 'cover' }} />
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Category chips */}
            <div>
              <label style={lbl}>Category</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setPendingCat(c)}
                    style={{ background: pendingCat === c ? `rgba(${hexRgb(CAT_COLORS[c])}, .2)` : 'transparent', border: `1px solid ${pendingCat === c ? CAT_COLORS[c] : BORDER}`, borderRadius: 20, padding: '5px 12px', color: pendingCat === c ? CAT_COLORS[c] : DIM, fontSize: 13, fontWeight: pendingCat === c ? 700 : 400, cursor: 'pointer' }}
                  >{c}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={lbl}>Caption</label>
              <input type="text" value={pendingCaption} onChange={(e) => setPendingCaption(e.target.value)} placeholder="Describe what you're capturing..." style={{ ...inp, marginTop: 5 }} />
            </div>
            {/* GPS indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={gpsLat ? GREEN : DIM} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx={12} cy={10} r={3}/></svg>
              <span style={{ fontSize: 12, color: gpsLat ? GREEN : DIM }}>
                {gpsLoading ? 'Getting GPS...' : gpsLat ? `${gpsLat.toFixed(5)}, ${gpsLng?.toFixed(5)}` : 'No GPS data'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={cancelPending} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, color: DIM, fontSize: 15, cursor: 'pointer' }}>Cancel</button>
              <button
                type="button"
                onClick={uploadPhoto}
                disabled={uploading}
                style={{ flex: 2, background: uploading ? '#1E3A5F' : GOLD, border: 'none', borderRadius: 10, padding: 14, color: uploading ? DIM : '#000', fontSize: 15, fontWeight: 800, cursor: uploading ? 'wait' : 'pointer' }}
              >
                {uploading ? 'Uploading...' : online ? 'Upload Photo' : 'Save Offline'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category filter */}
      {photos.length > 0 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setFilterCat(c)}
              style={{ flexShrink: 0, background: filterCat === c ? (c === 'All' ? 'rgba(212,160,23,.2)' : `rgba(${hexRgb(CAT_COLORS[c])}, .2)`) : 'transparent', border: `1px solid ${filterCat === c ? (c === 'All' ? GOLD : CAT_COLORS[c]) : BORDER}`, borderRadius: 20, padding: '5px 12px', color: filterCat === c ? (c === 'All' ? GOLD : CAT_COLORS[c]) : DIM, fontSize: 12, fontWeight: filterCat === c ? 700 : 400, cursor: 'pointer' }}
            >
              {c}
              {c !== 'All' && photos.filter((p) => p.category === c).length > 0 && (
                <span style={{ marginLeft: 4, opacity: 0.7 }}>({photos.filter((p) => p.category === c).length})</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Gallery grid */}
      {loadingGallery ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: DIM, fontSize: 14 }}>Loading photos...</div>
      ) : filteredPhotos.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
          {filteredPhotos.map((p) => (
            <div
              key={p.id}
              onClick={() => {
                if (batchMode) { toggleBatchSelect(p.id); }
                else { setSelected(p); }
              }}
              style={{ position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', border: `1px solid ${batchSelected.has(p.id) ? BLUE : BORDER}`, boxShadow: batchSelected.has(p.id) ? `0 0 0 2px ${BLUE}` : 'none' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.caption} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              {/* Batch checkbox */}
              {batchMode && (
                <div style={{ position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: 6, background: batchSelected.has(p.id) ? BLUE : 'rgba(0,0,0,.6)', border: `2px solid ${batchSelected.has(p.id) ? BLUE : '#fff'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {batchSelected.has(p.id) && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><polyline points="20 6 9 17 4 12"/></svg>
                  )}
                </div>
              )}
              {!p.uploaded && (
                <div style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(239,68,68,.9)', borderRadius: 4, padding: '1px 5px', fontSize: 9, color: '#fff', fontWeight: 700 }}>PENDING</div>
              )}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent,rgba(0,0,0,.75))', padding: '10px 5px 4px' }}>
                <div style={{ display: 'inline-block', background: `rgba(${hexRgb(CAT_COLORS[p.category] || DIM)}, .6)`, borderRadius: 3, padding: '1px 5px', fontSize: 9, color: '#fff', fontWeight: 700 }}>{p.category}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        !pendingPreview && (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: DIM }}>
            <div style={{ display: 'flex', justifyContent: 'center', color: DIM, marginBottom: 8, opacity: 0.5 }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={40} height={40}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx={12} cy={13} r={4}/></svg></div>
            <p style={{ margin: 0, fontSize: 14 }}>{filterCat === 'All' ? 'No photos yet. Tap above to take the first one.' : `No ${filterCat} photos.`}</p>
          </div>
        )
      )}

      {/* Lightbox */}
      {selected && (
        <div
          onClick={() => { if (!markupMode && !showLinkModal && !showTagModal) { setSelected(null); setMarkupMode(false); } }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.96)', zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: 16, overflowY: 'auto' }}
        >
          {/* Image + canvas wrapper */}
          <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '50vh', display: 'flex', marginTop: 20 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selected.url}
              alt={selected.caption}
              style={{ maxWidth: '100%', maxHeight: '50vh', borderRadius: markupMode ? 0 : 12, objectFit: 'contain', display: 'block' }}
              id="lightbox-img"
            />
            {markupMode && (
              <canvas
                ref={canvasRef}
                width={canvasRef.current?.offsetWidth || 320}
                height={canvasRef.current?.offsetHeight || 240}
                onTouchStart={handleCanvasTouch}
                onTouchMove={handleCanvasTouch}
                onTouchEnd={handleCanvasTouchEnd}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'crosshair', touchAction: 'none', borderRadius: 0, zIndex: 10 }}
              />
            )}
          </div>

          {/* Controls */}
          <div
            onClick={e => e.stopPropagation()}
            style={{ marginTop: 14, textAlign: 'center', width: '100%', maxWidth: 500 }}
          >
            {/* Category + action buttons row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ background: `rgba(${hexRgb(CAT_COLORS[selected.category] || DIM)}, .25)`, border: `1px solid ${CAT_COLORS[selected.category] || DIM}`, borderRadius: 20, padding: '3px 14px', fontSize: 12, color: CAT_COLORS[selected.category] || DIM, fontWeight: 700 }}>
                {selected.category}
              </span>
              {!markupMode ? (
                <>
                  <button
                    onClick={enterMarkup}
                    style={{ background: 'rgba(245,158,11,.15)', border: '1px solid rgba(245,158,11,.4)', borderRadius: 20, padding: '3px 14px', fontSize: 12, color: AMBER, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={12} height={12}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Markup
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowLinkModal(true); }}
                    style={{ background: 'rgba(59,130,246,.15)', border: '1px solid rgba(59,130,246,.4)', borderRadius: 20, padding: '3px 14px', fontSize: 12, color: BLUE, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={12} height={12}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg> Link to Item
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowTagModal(true); }}
                    style={{ background: 'rgba(34,197,94,.15)', border: '1px solid rgba(34,197,94,.4)', borderRadius: 20, padding: '3px 14px', fontSize: 12, color: GREEN, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={12} height={12}><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1={7} y1={7} x2={7.01} y2={7}/></svg> Tags
                  </button>
                </>
              ) : (
                <span style={{ background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 20, padding: '3px 14px', fontSize: 12, color: RED, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={12} height={12}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Drawing...
                </span>
              )}
            </div>

            {/* Markup toolbar */}
            {markupMode && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: DIM }}>Color:</span>
                  {[RED, AMBER, BLUE, GREEN].map(color => (
                    <button
                      key={color}
                      onClick={e => { e.stopPropagation(); setMarkupColor(color); }}
                      style={{ width: 28, height: 28, borderRadius: '50%', background: color, cursor: 'pointer', border: markupColor === color ? '3px solid #fff' : '2px solid transparent', flexShrink: 0 }}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={undoStroke} disabled={markupStrokes.length === 0} style={{ background: 'rgba(255,255,255,.08)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 14px', color: markupStrokes.length === 0 ? DIM : TEXT, fontSize: 13, cursor: markupStrokes.length === 0 ? 'default' : 'pointer', fontWeight: 600 }}>
                    Undo
                  </button>
                  <button onClick={exitMarkup} style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, padding: '8px 14px', color: RED, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
                    Cancel
                  </button>
                  <button onClick={saveMarkup} style={{ background: GREEN, border: 'none', borderRadius: 10, padding: '8px 14px', color: '#000', fontSize: 13, cursor: 'pointer', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save Markup
                  </button>
                </div>
              </div>
            )}

            {/* Photo details (non-markup mode) */}
            {!markupMode && (
              <>
                {selected.caption && <p style={{ margin: '8px 0 0', color: TEXT, fontSize: 15 }}>{selected.caption}</p>}
                <p style={{ margin: '6px 0 0', color: DIM, fontSize: 12 }}>
                  {new Date(selected.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · Tap outside to close
                </p>
                {selected.latitude && selected.longitude && (
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={12} height={12}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx={12} cy={10} r={3}/></svg>
                    <span style={{ fontSize: 11, color: GREEN }}>{selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}</span>
                    <a
                      href={`https://www.google.com/maps?q=${selected.latitude},${selected.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ fontSize: 11, color: BLUE, textDecoration: 'underline', cursor: 'pointer' }}
                    >
                      View Map
                    </a>
                  </div>
                )}

                {/* Tags display */}
                {photoTags.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                    {photoTags.map(tag => (
                      <span key={tag} style={{ background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 16, padding: '3px 10px', fontSize: 11, color: GREEN, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {tag}
                        <button
                          onClick={(e) => { e.stopPropagation(); removeTag(selected.id, tag); }}
                          style={{ background: 'none', border: 'none', color: GREEN, cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1, display: 'flex' }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={10} height={10}><line x1={18} y1={6} x2={6} y2={18}/><line x1={6} y1={6} x2={18} y2={18}/></svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Linked entities display */}
                {linksLoading ? (
                  <div style={{ marginTop: 10, color: DIM, fontSize: 12 }}>Loading links...</div>
                ) : entityLinksOnly.length > 0 ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, color: DIM, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Linked Items</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                      {entityLinksOnly.map(link => (
                        <span key={link.id} style={{ background: 'rgba(59,130,246,.12)', border: '1px solid rgba(59,130,246,.3)', borderRadius: 16, padding: '4px 10px', fontSize: 11, color: BLUE, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 10, color: DIM }}>{getEntityLabel(link.entity_type)}:</span>
                          {link.entity_title || link.entity_id}
                          <button
                            onClick={(e) => { e.stopPropagation(); unlinkPhoto(link); }}
                            style={{ background: 'none', border: 'none', color: BLUE, cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1, display: 'flex' }}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={10} height={10}><line x1={18} y1={6} x2={6} y2={18}/><line x1={6} y1={6} x2={18} y2={18}/></svg>
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}

      {/* Link to Item Modal */}
      {showLinkModal && selected && (
        <div
          onClick={(e) => { e.stopPropagation(); setShowLinkModal(false); setLinkEntityType(''); setLinkSearchQuery(''); setLinkSearchResults([]); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#0A1929', border: `1px solid ${BORDER}`, borderRadius: 16, width: '100%', maxWidth: 440, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            {/* Modal header */}
            <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: TEXT }}>Link to Item</span>
              <button onClick={() => { setShowLinkModal(false); setLinkEntityType(''); setLinkSearchQuery(''); setLinkSearchResults([]); }} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 20 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><line x1={18} y1={6} x2={6} y2={18}/><line x1={6} y1={6} x2={18} y2={18}/></svg>
              </button>
            </div>
            {/* Entity type picker */}
            <div style={{ padding: '12px 18px' }}>
              <label style={lbl}>Entity Type</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {ENTITY_TYPES.map(et => (
                  <button
                    key={et.value}
                    onClick={() => { setLinkEntityType(et.value); setLinkSearchQuery(''); }}
                    style={{ background: linkEntityType === et.value ? 'rgba(59,130,246,.2)' : 'transparent', border: `1px solid ${linkEntityType === et.value ? BLUE : BORDER}`, borderRadius: 20, padding: '5px 12px', color: linkEntityType === et.value ? BLUE : DIM, fontSize: 12, fontWeight: linkEntityType === et.value ? 700 : 400, cursor: 'pointer' }}
                  >
                    {et.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Search */}
            {linkEntityType && (
              <div style={{ padding: '0 18px 12px' }}>
                <input
                  type="text"
                  value={linkSearchQuery}
                  onChange={e => setLinkSearchQuery(e.target.value)}
                  placeholder={`Search ${getEntityLabel(linkEntityType)}s...`}
                  style={{ ...inp }}
                  autoFocus
                />
              </div>
            )}
            {/* Results */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px 16px' }}>
              {linkSearchLoading ? (
                <div style={{ textAlign: 'center', padding: 16, color: DIM, fontSize: 13 }}>Loading...</div>
              ) : linkSearchResults.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {linkSearchResults.map(item => {
                    const alreadyLinked = entityLinksOnly.some(l => l.entity_type === linkEntityType && l.entity_id === item.id);
                    return (
                      <button
                        key={item.id}
                        disabled={alreadyLinked}
                        onClick={async () => {
                          await linkPhotoToEntity(selected.id, linkEntityType, item.id, item.title || item.id, selected.url);
                          // Stay in modal so user can link more
                        }}
                        style={{ textAlign: 'left', background: alreadyLinked ? 'rgba(34,197,94,.08)' : 'rgba(255,255,255,.03)', border: `1px solid ${alreadyLinked ? GREEN : BORDER}`, borderRadius: 10, padding: '10px 14px', color: TEXT, fontSize: 13, cursor: alreadyLinked ? 'default' : 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      >
                        <div>
                          <div style={{ fontWeight: 600 }}>{item.title || item.id}</div>
                          {item.number && <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>#{item.number}</div>}
                        </div>
                        {alreadyLinked ? (
                          <span style={{ fontSize: 11, color: GREEN, fontWeight: 700 }}>Linked</span>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><line x1={12} y1={5} x2={12} y2={19}/><line x1={5} y1={12} x2={19} y2={12}/></svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : linkEntityType ? (
                <div style={{ textAlign: 'center', padding: 16, color: DIM, fontSize: 13 }}>No items found</div>
              ) : (
                <div style={{ textAlign: 'center', padding: 16, color: DIM, fontSize: 13 }}>Select an entity type above</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tag Management Modal */}
      {showTagModal && selected && (
        <div
          onClick={(e) => { e.stopPropagation(); setShowTagModal(false); setCustomTagInput(''); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#0A1929', border: `1px solid ${BORDER}`, borderRadius: 16, width: '100%', maxWidth: 400, overflow: 'hidden' }}
          >
            {/* Modal header */}
            <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: TEXT }}>Manage Tags</span>
              <button onClick={() => { setShowTagModal(false); setCustomTagInput(''); }} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 20 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><line x1={18} y1={6} x2={6} y2={18}/><line x1={6} y1={6} x2={18} y2={18}/></svg>
              </button>
            </div>
            {/* Preset tags */}
            <div style={{ padding: '14px 18px' }}>
              <label style={lbl}>Preset Tags</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {PRESET_TAGS.map(tag => {
                  const active = photoTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => active ? removeTag(selected.id, tag) : addTag(selected.id, tag)}
                      style={{ background: active ? 'rgba(34,197,94,.2)' : 'transparent', border: `1px solid ${active ? GREEN : BORDER}`, borderRadius: 20, padding: '5px 12px', color: active ? GREEN : DIM, fontSize: 12, fontWeight: active ? 700 : 400, cursor: 'pointer' }}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Custom tag input */}
            <div style={{ padding: '0 18px 16px' }}>
              <label style={lbl}>Custom Tag</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input
                  type="text"
                  value={customTagInput}
                  onChange={e => setCustomTagInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && customTagInput.trim()) {
                      addTag(selected.id, customTagInput.trim());
                      setCustomTagInput('');
                    }
                  }}
                  placeholder="Add custom tag..."
                  style={{ ...inp, flex: 1 }}
                />
                <button
                  onClick={() => {
                    if (customTagInput.trim()) {
                      addTag(selected.id, customTagInput.trim());
                      setCustomTagInput('');
                    }
                  }}
                  disabled={!customTagInput.trim()}
                  style={{ background: customTagInput.trim() ? GREEN : BORDER, border: 'none', borderRadius: 10, padding: '0 16px', color: customTagInput.trim() ? '#000' : DIM, fontWeight: 700, cursor: customTagInput.trim() ? 'pointer' : 'default', fontSize: 13 }}
                >
                  Add
                </button>
              </div>
            </div>
            {/* Current tags */}
            {photoTags.length > 0 && (
              <div style={{ padding: '0 18px 16px' }}>
                <label style={lbl}>Active Tags</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {photoTags.map(tag => (
                    <span key={tag} style={{ background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 16, padding: '4px 10px', fontSize: 12, color: GREEN, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      {tag}
                      <button
                        onClick={() => removeTag(selected.id, tag)}
                        style={{ background: 'none', border: 'none', color: GREEN, cursor: 'pointer', padding: 0, display: 'flex' }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={11} height={11}><line x1={18} y1={6} x2={6} y2={18}/><line x1={6} y1={6} x2={18} y2={18}/></svg>
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Batch Link Modal */}
      {showBatchLinkModal && (
        <div
          onClick={() => { setShowBatchLinkModal(false); setLinkEntityType(''); setLinkSearchQuery(''); setLinkSearchResults([]); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#0A1929', border: `1px solid ${BORDER}`, borderRadius: 16, width: '100%', maxWidth: 440, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 16, fontWeight: 800, color: TEXT }}>Batch Link Photos</span>
                <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>{batchSelected.size} photo{batchSelected.size !== 1 ? 's' : ''} selected</div>
              </div>
              <button onClick={() => { setShowBatchLinkModal(false); setLinkEntityType(''); setLinkSearchQuery(''); setLinkSearchResults([]); }} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><line x1={18} y1={6} x2={6} y2={18}/><line x1={6} y1={6} x2={18} y2={18}/></svg>
              </button>
            </div>
            <div style={{ padding: '12px 18px' }}>
              <label style={lbl}>Entity Type</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {ENTITY_TYPES.map(et => (
                  <button
                    key={et.value}
                    onClick={() => { setLinkEntityType(et.value); setLinkSearchQuery(''); }}
                    style={{ background: linkEntityType === et.value ? 'rgba(59,130,246,.2)' : 'transparent', border: `1px solid ${linkEntityType === et.value ? BLUE : BORDER}`, borderRadius: 20, padding: '5px 12px', color: linkEntityType === et.value ? BLUE : DIM, fontSize: 12, fontWeight: linkEntityType === et.value ? 700 : 400, cursor: 'pointer' }}
                  >
                    {et.label}
                  </button>
                ))}
              </div>
            </div>
            {linkEntityType && (
              <div style={{ padding: '0 18px 12px' }}>
                <input
                  type="text"
                  value={linkSearchQuery}
                  onChange={e => setLinkSearchQuery(e.target.value)}
                  placeholder={`Search ${getEntityLabel(linkEntityType)}s...`}
                  style={{ ...inp }}
                  autoFocus
                />
              </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px 16px' }}>
              {linkSearchLoading ? (
                <div style={{ textAlign: 'center', padding: 16, color: DIM, fontSize: 13 }}>Loading...</div>
              ) : linkSearchResults.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {linkSearchResults.map(item => (
                    <button
                      key={item.id}
                      onClick={async () => {
                        await batchLinkToEntity(linkEntityType, item.id, item.title || item.id);
                      }}
                      style={{ textAlign: 'left', background: 'rgba(255,255,255,.03)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', color: TEXT, fontSize: 13, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>{item.title || item.id}</div>
                        {item.number && <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>#{item.number}</div>}
                      </div>
                      <span style={{ fontSize: 11, color: BLUE, fontWeight: 700 }}>Link {batchSelected.size}</span>
                    </button>
                  ))}
                </div>
              ) : linkEntityType ? (
                <div style={{ textAlign: 'center', padding: 16, color: DIM, fontSize: 13 }}>No items found</div>
              ) : (
                <div style={{ textAlign: 'center', padding: 16, color: DIM, fontSize: 13 }}>Select an entity type above</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FieldPhotosPage() {
  return <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center' }}>Loading...</div>}><PhotosPage /></Suspense>;
}

const lbl: React.CSSProperties = { fontSize: 12, color: '#8BAAC8', fontWeight: 600 };
const inp: React.CSSProperties = { width: '100%', background: '#07101C', border: '1px solid #1E3A5F', borderRadius: 10, padding: '11px 14px', color: '#F0F4FF', fontSize: 15, outline: 'none' };
const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#8BAAC8', fontSize: 14, cursor: 'pointer', padding: '0 0 10px', display: 'block' };

function hexRgb(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}
