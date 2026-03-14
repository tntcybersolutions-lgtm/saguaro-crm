'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';

/* ── Palette ──────────────────────────────────────────────────────── */
const GOLD = '#D4A017';
const BG = '#07101C';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const GREEN = '#22C55E';
const RED = '#EF4444';
const AMBER = '#F59E0B';
const BLUE = '#3B82F6';
const PURPLE = '#8B5CF6';

/* ── Helpers ──────────────────────────────────────────────────────── */
const fmt = (n: number) =>
  '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const fmtTime = (d: string | null | undefined) => {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};
const pct = (v: number, t: number) => (t > 0 ? Math.round((v / t) * 100) : 0);

/* ── Inline Types ─────────────────────────────────────────────────── */
type TabId = 'dashboard' | 'approvals' | 'financials' | 'messages' | 'documents' | 'warranty' | 'ai';

type ProjectInfo = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  client_name: string;
  company_name: string;
  percent_complete: number;
  start_date: string;
  end_date: string;
  original_contract: number;
  committed_cost: number;
  spent_to_date: number;
  total_budget: number;
  payments_made: number;
  open_items: number;
};

type SchedulePhase = {
  id: string;
  name: string;
  start: string;
  end: string;
  percent_complete: number;
};

type Photo = { id: string; url: string; caption: string; date: string };

type ChangeOrderSummary = { pending: number; approved: number; rejected: number };

type WeatherInfo = { city: string; temp: number; conditions: string; icon: string };

type ApprovalItem = {
  id: string;
  type: 'change_order' | 'pay_app' | 'selection';
  title: string;
  amount: number;
  submitted_date: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected';
};

type ApprovalHistory = {
  id: string;
  item_title: string;
  action: 'approved' | 'rejected';
  date: string;
  notes: string;
};

type Invoice = {
  id: string;
  number: string;
  amount: number;
  date: string;
  due_date: string;
  status: 'paid' | 'pending' | 'overdue';
};

type BudgetLine = {
  id: string;
  code: string;
  description: string;
  original: number;
  changes: number;
  current: number;
  committed: number;
  spent: number;
  remaining: number;
};

type Payment = {
  id: string;
  amount: number;
  date: string;
  method: string;
  reference: string;
};

type Message = {
  id: string;
  sender: string;
  sender_type: 'gc' | 'client';
  text: string;
  timestamp: string;
  read: boolean;
  attachment?: { name: string; url: string };
};

type Document = {
  id: string;
  title: string;
  category: string;
  version: string;
  date: string;
  uploaded_by: string;
  url: string;
  size: string;
};

type WarrantyClaim = {
  id: string;
  description: string;
  category: string;
  location: string;
  status: 'submitted' | 'assigned' | 'in_progress' | 'resolved';
  created_at: string;
  photos: string[];
};

type PunchItem = {
  id: string;
  title: string;
  location: string;
  status: 'open' | 'completed' | 'signed_off';
  photo?: string;
};

type AISummary = {
  id: string;
  week_of: string;
  work_completed: string;
  upcoming_milestones: string;
  budget_status: string;
  weather_delays: string;
  generated_at: string;
};

type DashboardData = {
  project: ProjectInfo;
  phases: SchedulePhase[];
  photos: Photo[];
  change_orders: ChangeOrderSummary;
  weather: WeatherInfo;
};

/* ── Tab Config ───────────────────────────────────────────────────── */
const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'approvals', label: 'Approvals', icon: '✅' },
  { id: 'financials', label: 'Financials', icon: '💰' },
  { id: 'messages', label: 'Messages', icon: '💬' },
  { id: 'documents', label: 'Documents', icon: '📁' },
  { id: 'warranty', label: 'Warranty & Punch', icon: '🔧' },
  { id: 'ai', label: 'AI Summary', icon: '🤖' },
];

const DOC_CATEGORIES = ['All', 'Contracts', 'Drawings', 'Specs', 'Permits', 'Reports', 'Photos', 'Other'];

/* ══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════════ */
export default function ClientPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  /* ── Dashboard state ──────────────────────────────────────────── */
  const [dashLoading, setDashLoading] = useState(true);
  const [dashError, setDashError] = useState('');
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [phases, setPhases] = useState<SchedulePhase[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [coSummary, setCoSummary] = useState<ChangeOrderSummary>({ pending: 0, approved: 0, rejected: 0 });
  const [weather, setWeather] = useState<WeatherInfo | null>(null);

  /* ── Approvals state ──────────────────────────────────────────── */
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [approvalHistory, setApprovalHistory] = useState<ApprovalHistory[]>([]);
  const [approvalNotes, setApprovalNotes] = useState<Record<string, string>>({});
  const [processingApproval, setProcessingApproval] = useState<string | null>(null);
  const [signatureData, setSignatureData] = useState<string | null>(null);

  /* ── Financials state ─────────────────────────────────────────── */
  const [finLoading, setFinLoading] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expandedBudget, setExpandedBudget] = useState<Record<string, boolean>>({});
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentProcessing, setPaymentProcessing] = useState(false);

  /* ── Messages state ───────────────────────────────────────────── */
  const [msgLoading, setMsgLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionList] = useState(['Project Manager', 'Superintendent', 'Architect', 'Engineer']);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /* ── Documents state ──────────────────────────────────────────── */
  const [docsLoading, setDocsLoading] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [docCategory, setDocCategory] = useState('All');
  const [docSearch, setDocSearch] = useState('');

  /* ── Warranty & Punch state ───────────────────────────────────── */
  const [warLoading, setWarLoading] = useState(false);
  const [warrantyClaims, setWarrantyClaims] = useState<WarrantyClaim[]>([]);
  const [punchItems, setPunchItems] = useState<PunchItem[]>([]);
  const [newClaim, setNewClaim] = useState({ description: '', category: 'Plumbing', location: '' });
  const [submittingClaim, setSubmittingClaim] = useState(false);

  /* ── AI Summary state ─────────────────────────────────────────── */
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummaries, setAiSummaries] = useState<AISummary[]>([]);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [emailSending, setEmailSending] = useState(false);

  /* ── Global feedback ──────────────────────────────────────────── */
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  /* ── Signature canvas ref ─────────────────────────────────────── */
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const sigDrawing = useRef(false);

  /* ══════════════════════════════════════════════════════════════════
     DATA FETCHING
     ══════════════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!token) return;
    setDashLoading(true);
    setDashError('');
    fetch(`/api/portal/client/dashboard?token=${token}`, {
      headers: { 'x-portal-token': token },
    })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load portal');
        return r.json();
      })
      .then((d: DashboardData) => {
        setProject(d.project);
        setPhases(d.phases || []);
        setPhotos((d.photos || []).slice(0, 12));
        setCoSummary(d.change_orders || { pending: 0, approved: 0, rejected: 0 });
        setWeather(d.weather || null);
      })
      .catch((e) => setDashError(e.message))
      .finally(() => setDashLoading(false));
  }, [token]);

  /* Fetch tab data on tab change */
  useEffect(() => {
    if (!token) return;
    if (activeTab === 'approvals' && approvals.length === 0 && !approvalsLoading) {
      setApprovalsLoading(true);
      fetch(`/api/portal/client/approvals?token=${token}`, { headers: { 'x-portal-token': token } })
        .then((r) => r.json())
        .then((d) => {
          setApprovals(d.pending || []);
          setApprovalHistory(d.history || []);
        })
        .catch(() => showToast('Failed to load approvals', 'error'))
        .finally(() => setApprovalsLoading(false));
    }
    if (activeTab === 'financials' && invoices.length === 0 && !finLoading) {
      setFinLoading(true);
      fetch(`/api/portal/client/financials?token=${token}`, { headers: { 'x-portal-token': token } })
        .then((r) => r.json())
        .then((d) => {
          setInvoices(d.invoices || []);
          setBudgetLines(d.budget_lines || []);
          setPayments(d.payments || []);
        })
        .catch(() => showToast('Failed to load financials', 'error'))
        .finally(() => setFinLoading(false));
    }
    if (activeTab === 'messages' && messages.length === 0 && !msgLoading) {
      setMsgLoading(true);
      fetch(`/api/portal/client/messages?token=${token}`, { headers: { 'x-portal-token': token } })
        .then((r) => r.json())
        .then((d) => setMessages(d.messages || []))
        .catch(() => showToast('Failed to load messages', 'error'))
        .finally(() => setMsgLoading(false));
    }
    if (activeTab === 'documents' && documents.length === 0 && !docsLoading) {
      setDocsLoading(true);
      fetch(`/api/portal/client/documents?token=${token}`, { headers: { 'x-portal-token': token } })
        .then((r) => r.json())
        .then((d) => setDocuments(d.documents || []))
        .catch(() => showToast('Failed to load documents', 'error'))
        .finally(() => setDocsLoading(false));
    }
    if (activeTab === 'warranty' && warrantyClaims.length === 0 && punchItems.length === 0 && !warLoading) {
      setWarLoading(true);
      fetch(`/api/portal/client/warranty?token=${token}`, { headers: { 'x-portal-token': token } })
        .then((r) => r.json())
        .then((d) => {
          setWarrantyClaims(d.claims || []);
          setPunchItems(d.punch_items || []);
        })
        .catch(() => showToast('Failed to load warranty data', 'error'))
        .finally(() => setWarLoading(false));
    }
    if (activeTab === 'ai' && aiSummaries.length === 0 && !aiLoading) {
      setAiLoading(true);
      fetch(`/api/portal/client/ai-summary?token=${token}`, { headers: { 'x-portal-token': token } })
        .then((r) => r.json())
        .then((d) => setAiSummaries(d.summaries || []))
        .catch(() => showToast('Failed to load AI summaries', 'error'))
        .finally(() => setAiLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, token]);

  /* Auto-scroll messages */
  useEffect(() => {
    if (activeTab === 'messages') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  /* ══════════════════════════════════════════════════════════════════
     ACTION HANDLERS
     ══════════════════════════════════════════════════════════════════ */
  const handleApproval = async (id: string, action: 'approved' | 'rejected') => {
    setProcessingApproval(id);
    try {
      const res = await fetch(`/api/portal/client/approvals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-portal-token': token },
        body: JSON.stringify({
          token,
          approval_id: id,
          action,
          notes: approvalNotes[id] || '',
          signature: signatureData,
        }),
      });
      const d = await res.json();
      if (d.success) {
        setApprovals((prev) => prev.map((a) => (a.id === id ? { ...a, status: action } : a)));
        setApprovalHistory((prev) => [
          { id: Date.now().toString(), item_title: approvals.find((a) => a.id === id)?.title || '', action, date: new Date().toISOString(), notes: approvalNotes[id] || '' },
          ...prev,
        ]);
        showToast(`Item ${action} successfully`);
      } else {
        showToast(d.error || 'Failed to process', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
    setProcessingApproval(null);
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    setSendingMsg(true);
    try {
      const res = await fetch(`/api/portal/client/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-portal-token': token },
        body: JSON.stringify({ token, text: newMessage }),
      });
      const d = await res.json();
      if (d.success) {
        setMessages((prev) => [
          ...prev,
          {
            id: d.id || Date.now().toString(),
            sender: project?.client_name || 'You',
            sender_type: 'client',
            text: newMessage,
            timestamp: new Date().toISOString(),
            read: true,
          },
        ]);
        setNewMessage('');
      } else {
        showToast('Failed to send message', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
    setSendingMsg(false);
  };

  const submitWarrantyClaim = async () => {
    if (!newClaim.description.trim() || !newClaim.location.trim()) {
      showToast('Please fill in all required fields', 'error');
      return;
    }
    setSubmittingClaim(true);
    try {
      const res = await fetch(`/api/portal/client/warranty`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-portal-token': token },
        body: JSON.stringify({ token, ...newClaim }),
      });
      const d = await res.json();
      if (d.success) {
        setWarrantyClaims((prev) => [
          {
            id: d.id || Date.now().toString(),
            ...newClaim,
            status: 'submitted',
            created_at: new Date().toISOString(),
            photos: [],
          },
          ...prev,
        ]);
        setNewClaim({ description: '', category: 'Plumbing', location: '' });
        showToast('Warranty claim submitted');
      } else {
        showToast(d.error || 'Failed to submit claim', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
    setSubmittingClaim(false);
  };

  const makePayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast('Enter a valid payment amount', 'error');
      return;
    }
    setPaymentProcessing(true);
    try {
      const res = await fetch(`/api/portal/client/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-portal-token': token },
        body: JSON.stringify({ token, amount }),
      });
      const d = await res.json();
      if (d.success) {
        setPayments((prev) => [
          { id: d.id || Date.now().toString(), amount, date: new Date().toISOString(), method: 'Portal', reference: d.reference || 'N/A' },
          ...prev,
        ]);
        setPaymentAmount('');
        showToast('Payment recorded successfully');
      } else {
        showToast(d.error || 'Payment failed', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
    setPaymentProcessing(false);
  };

  const generateAiSummary = async () => {
    setGeneratingAi(true);
    try {
      const res = await fetch(`/api/portal/client/ai-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-portal-token': token },
        body: JSON.stringify({ token, action: 'generate' }),
      });
      const d = await res.json();
      if (d.success && d.summary) {
        setAiSummaries((prev) => [d.summary, ...prev]);
        showToast('Summary generated');
      } else {
        showToast(d.error || 'Failed to generate summary', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
    setGeneratingAi(false);
  };

  const emailSummary = async (summaryId: string) => {
    setEmailSending(true);
    try {
      const res = await fetch(`/api/portal/client/ai-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-portal-token': token },
        body: JSON.stringify({ token, action: 'email', summary_id: summaryId }),
      });
      const d = await res.json();
      if (d.success) showToast('Summary emailed successfully');
      else showToast(d.error || 'Failed to send email', 'error');
    } catch {
      showToast('Network error', 'error');
    }
    setEmailSending(false);
  };

  const handlePunchSignOff = async (id: string) => {
    try {
      const res = await fetch(`/api/portal/client/warranty`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-portal-token': token },
        body: JSON.stringify({ token, punch_id: id, action: 'sign_off' }),
      });
      const d = await res.json();
      if (d.success) {
        setPunchItems((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'signed_off' as const } : p)));
        showToast('Punch item signed off');
      } else {
        showToast(d.error || 'Failed', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
  };

  /* ── Signature canvas handlers ────────────────────────────────── */
  const initSignature = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = TEXT;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  };

  const startSigDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    sigDrawing.current = true;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const drawSig = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!sigDrawing.current) return;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const endSigDraw = () => {
    sigDrawing.current = false;
    const canvas = sigCanvasRef.current;
    if (canvas) {
      setSignatureData(canvas.toDataURL());
    }
  };

  const clearSignature = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureData(null);
  };

  /* ── Mention handling ─────────────────────────────────────────── */
  const handleMessageInput = (val: string) => {
    setNewMessage(val);
    const lastChar = val.slice(-1);
    if (lastChar === '@') {
      setShowMentions(true);
    } else if (showMentions && val.includes('@')) {
      // keep open
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (name: string) => {
    const atIdx = newMessage.lastIndexOf('@');
    setNewMessage(newMessage.slice(0, atIdx) + `@${name} `);
    setShowMentions(false);
  };

  /* ── Notification badge counts ──────────────────────────────── */
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);

  useEffect(() => {
    setUnreadMessages(messages.filter((m) => m.sender_type === 'gc' && !m.read).length);
  }, [messages]);

  useEffect(() => {
    setPendingApprovalCount(approvals.filter((a) => a.status === 'pending').length);
  }, [approvals]);

  /* ── Scroll-to-top visibility ─────────────────────────────── */
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ── Keyboard shortcuts ───────────────────────────────────── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key >= '1' && e.key <= '7') {
        e.preventDefault();
        const tabIndex = parseInt(e.key) - 1;
        if (TABS[tabIndex]) {
          setActiveTab(TABS[tabIndex].id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  /* ── Computed ──────────────────────────────────────────────────── */
  const daysRemaining = project
    ? Math.max(0, Math.ceil((new Date(project.end_date).getTime() - Date.now()) / 86400000))
    : 0;
  const daysElapsed = project
    ? Math.max(0, Math.ceil((Date.now() - new Date(project.start_date).getTime()) / 86400000))
    : 0;
  const totalDuration = daysRemaining + daysElapsed;

  const filteredDocs = documents.filter((d) => {
    const matchCat = docCategory === 'All' || d.category === docCategory;
    const matchSearch = !docSearch || d.title.toLowerCase().includes(docSearch.toLowerCase());
    return matchCat && matchSearch;
  });

  /* ══════════════════════════════════════════════════════════════════
     SHARED STYLES
     ══════════════════════════════════════════════════════════════════ */
  const cardStyle: React.CSSProperties = {
    background: RAISED,
    border: `1px solid ${BORDER}`,
    borderRadius: 12,
    padding: 24,
  };

  const btnPrimary: React.CSSProperties = {
    background: GOLD,
    color: BG,
    border: 'none',
    borderRadius: 8,
    padding: '10px 20px',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    transition: 'opacity .2s',
  };

  const btnOutline: React.CSSProperties = {
    background: 'transparent',
    color: GOLD,
    border: `1px solid ${GOLD}`,
    borderRadius: 8,
    padding: '10px 20px',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  };

  const btnDanger: React.CSSProperties = {
    background: RED,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 20px',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
  };

  const btnSuccess: React.CSSProperties = {
    background: GREEN,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 20px',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
  };

  const inputStyle: React.CSSProperties = {
    background: BG,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    padding: '10px 14px',
    color: TEXT,
    fontSize: 14,
    width: '100%',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    minHeight: 80,
    resize: 'vertical' as const,
    fontFamily: 'inherit',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: DIM,
    marginBottom: 6,
    display: 'block',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  };

  const badgeStyle = (color: string): React.CSSProperties => ({
    display: 'inline-block',
    background: `${color}20`,
    color,
    padding: '4px 10px',
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  });

  const statusColor = (s: string) => {
    if (s === 'approved' || s === 'paid' || s === 'completed' || s === 'resolved' || s === 'signed_off') return GREEN;
    if (s === 'rejected' || s === 'overdue') return RED;
    if (s === 'pending' || s === 'submitted' || s === 'open') return AMBER;
    if (s === 'in_progress' || s === 'assigned') return BLUE;
    return DIM;
  };

  /* ══════════════════════════════════════════════════════════════════
     LOADING / ERROR STATES
     ══════════════════════════════════════════════════════════════════ */
  if (dashLoading) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, border: `3px solid ${BORDER}`, borderTopColor: GOLD, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ color: DIM, fontSize: 16 }}>Loading your project portal...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    );
  }

  if (dashError || !project) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center', maxWidth: 420, padding: 32 }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🔒</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: TEXT, marginBottom: 8 }}>Portal Unavailable</div>
          <div style={{ color: DIM, fontSize: 14, lineHeight: 1.6 }}>
            {dashError || 'This portal link is invalid or has expired. Please contact your contractor for a new link.'}
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════
     RENDER HELPERS — LOADING & EMPTY
     ══════════════════════════════════════════════════════════════════ */
  const LoadingBlock = () => (
    <div style={{ textAlign: 'center', padding: 64 }}>
      <div style={{ width: 36, height: 36, border: `3px solid ${BORDER}`, borderTopColor: GOLD, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
      <div style={{ color: DIM, fontSize: 14 }}>Loading...</div>
    </div>
  );

  const EmptyState = ({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) => (
    <div style={{ textAlign: 'center', padding: 64 }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 6 }}>{title}</div>
      <div style={{ color: DIM, fontSize: 14 }}>{subtitle}</div>
    </div>
  );

  /* ══════════════════════════════════════════════════════════════════
     SVG DONUT CHART
     ══════════════════════════════════════════════════════════════════ */
  const DonutChart = ({ original, committed, spent }: { original: number; committed: number; spent: number }) => {
    const size = 180;
    const stroke = 20;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const spentPct = pct(spent, original);
    const committedPct = pct(committed, original);
    const spentDash = (spentPct / 100) * circumference;
    const committedDash = (committedPct / 100) * circumference;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
          {/* Background ring */}
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={BORDER} strokeWidth={stroke} />
          {/* Committed ring */}
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none"
            stroke={AMBER} strokeWidth={stroke}
            strokeDasharray={`${committedDash} ${circumference - committedDash}`}
            strokeLinecap="round" opacity={0.5}
          />
          {/* Spent ring */}
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none"
            stroke={spentPct > 90 ? RED : GREEN} strokeWidth={stroke}
            strokeDasharray={`${spentDash} ${circumference - spentDash}`}
            strokeLinecap="round"
          />
        </svg>
        <div style={{ marginTop: -110, textAlign: 'center', position: 'relative' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: TEXT }}>{spentPct}%</div>
          <div style={{ fontSize: 11, color: DIM }}>Budget Used</div>
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 48, fontSize: 11 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: BORDER }} />
            <span style={{ color: DIM }}>Original</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: AMBER, opacity: 0.5 }} />
            <span style={{ color: DIM }}>Committed</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: GREEN }} />
            <span style={{ color: DIM }}>Spent</span>
          </div>
        </div>
      </div>
    );
  };

  /* ══════════════════════════════════════════════════════════════════
     TAB: DASHBOARD
     ══════════════════════════════════════════════════════════════════ */
  const renderDashboard = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Welcome Banner */}
      <div style={{ ...cardStyle, background: `linear-gradient(135deg, ${RAISED} 0%, #0A2540 100%)`, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: `${GOLD}10` }} />
        <div style={{ position: 'absolute', bottom: -20, right: 40, width: 80, height: 80, borderRadius: '50%', background: `${GOLD}08` }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 12, color: GOLD, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Welcome to Your Project</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: TEXT, marginBottom: 4 }}>{project.name}</div>
          <div style={{ fontSize: 14, color: DIM, marginBottom: 16 }}>
            {project.address}{project.city ? `, ${project.city}` : ''}{project.state ? `, ${project.state}` : ''}
          </div>
          {/* Progress bar */}
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: DIM }}>Overall Progress</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: GOLD }}>{project.percent_complete}%</span>
            </div>
            <div style={{ height: 8, background: BG, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${project.percent_complete}%`, background: `linear-gradient(90deg, ${GOLD}, #E8B82E)`, borderRadius: 4, transition: 'width 1s ease' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
        {[
          { label: 'Days Remaining', value: daysRemaining.toString(), icon: '📅', color: BLUE },
          { label: 'Total Budget', value: fmt(project.total_budget), icon: '💵', color: GREEN },
          { label: 'Payments Made', value: fmt(project.payments_made), icon: '✅', color: PURPLE },
          { label: 'Open Items', value: project.open_items.toString(), icon: '📋', color: AMBER },
        ].map((stat) => (
          <div key={stat.label} style={{ ...cardStyle, padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 22 }}>{stat.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: stat.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>{stat.label}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: TEXT }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Budget Gauge + Weather row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        {/* Budget Burn Gauge */}
        <div style={{ ...cardStyle }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 20 }}>Budget Burn Rate</div>
          <DonutChart original={project.original_contract} committed={project.committed_cost} spent={project.spent_to_date} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 20, textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 11, color: DIM }}>Original</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{fmt(project.original_contract)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: DIM }}>Committed</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: AMBER }}>{fmt(project.committed_cost)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: DIM }}>Spent</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: GREEN }}>{fmt(project.spent_to_date)}</div>
            </div>
          </div>
        </div>

        {/* Weather + Change Order Summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Weather */}
          <div style={{ ...cardStyle }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 12 }}>Job Site Weather</div>
            {weather ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ fontSize: 48 }}>{weather.icon || '☀️'}</div>
                <div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: TEXT }}>{weather.temp}°F</div>
                  <div style={{ fontSize: 14, color: DIM }}>{weather.conditions}</div>
                  <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>{weather.city}</div>
                </div>
              </div>
            ) : (
              <div style={{ color: DIM, fontSize: 14 }}>Weather data unavailable</div>
            )}
          </div>

          {/* Change Order Summary */}
          <div style={{ ...cardStyle }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Change Order Summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, textAlign: 'center' }}>
              <div style={{ background: `${AMBER}15`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: AMBER }}>{coSummary.pending}</div>
                <div style={{ fontSize: 11, color: DIM, marginTop: 4 }}>Pending</div>
              </div>
              <div style={{ background: `${GREEN}15`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: GREEN }}>{coSummary.approved}</div>
                <div style={{ fontSize: 11, color: DIM, marginTop: 4 }}>Approved</div>
              </div>
              <div style={{ background: `${RED}15`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: RED }}>{coSummary.rejected}</div>
                <div style={{ fontSize: 11, color: DIM, marginTop: 4 }}>Rejected</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Schedule Timeline */}
      <div style={{ ...cardStyle }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 20 }}>Schedule Timeline</div>
        {phases.length === 0 ? (
          <div style={{ color: DIM, fontSize: 14, textAlign: 'center', padding: 32 }}>No schedule phases available yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {phases.map((phase) => (
              <div key={phase.id} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ minWidth: 160, fontSize: 13, fontWeight: 600, color: TEXT }}>{phase.name}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: DIM }}>{fmtDate(phase.start)} - {fmtDate(phase.end)}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: phase.percent_complete === 100 ? GREEN : GOLD }}>{phase.percent_complete}%</span>
                  </div>
                  <div style={{ height: 6, background: BG, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${phase.percent_complete}%`,
                      background: phase.percent_complete === 100 ? GREEN : `linear-gradient(90deg, ${BLUE}, ${GOLD})`,
                      borderRadius: 3,
                      transition: 'width 0.8s ease',
                    }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Latest Photos */}
      <div style={{ ...cardStyle }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Latest Photos</div>
        {photos.length === 0 ? (
          <EmptyState icon="📷" title="No Photos Yet" subtitle="Project photos will appear here as they are uploaded." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
            {photos.map((photo) => (
              <div key={photo.id} style={{ position: 'relative', paddingBottom: '100%', borderRadius: 8, overflow: 'hidden', background: BG, border: `1px solid ${BORDER}` }}>
                <img
                  src={photo.url}
                  alt={photo.caption || 'Project photo'}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: 'linear-gradient(transparent, rgba(0,0,0,.7))',
                  padding: '16px 8px 8px',
                }}>
                  <div style={{ fontSize: 10, color: '#fff', fontWeight: 600 }}>{photo.caption}</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,.6)' }}>{fmtDate(photo.date)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  /* ══════════════════════════════════════════════════════════════════
     TAB: APPROVALS
     ══════════════════════════════════════════════════════════════════ */
  const renderApprovals = () => {
    if (approvalsLoading) return <LoadingBlock />;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Pending Approvals */}
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Pending Approvals</div>
          {approvals.filter((a) => a.status === 'pending').length === 0 ? (
            <EmptyState icon="✅" title="All Caught Up" subtitle="No pending approvals at this time." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {approvals
                .filter((a) => a.status === 'pending')
                .map((item) => (
                  <div key={item.id} style={{ ...cardStyle }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                      <div>
                        <span style={badgeStyle(statusColor(item.status))}>{item.status}</span>
                        <span style={{ ...badgeStyle(BLUE), marginLeft: 8 }}>{item.type.replace('_', ' ')}</span>
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: GOLD }}>{fmt(item.amount)}</div>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 6 }}>{item.title}</div>
                    <div style={{ fontSize: 13, color: DIM, marginBottom: 4 }}>Submitted: {fmtDate(item.submitted_date)}</div>
                    <div style={{ fontSize: 14, color: DIM, lineHeight: 1.6, marginBottom: 16 }}>{item.description}</div>

                    {/* Notes */}
                    <div style={{ marginBottom: 12 }}>
                      <label style={labelStyle}>Add Notes (Optional)</label>
                      <textarea
                        style={textareaStyle}
                        placeholder="Enter any notes or conditions for this approval..."
                        value={approvalNotes[item.id] || ''}
                        onChange={(e) => setApprovalNotes({ ...approvalNotes, [item.id]: e.target.value })}
                      />
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <button
                        style={{ ...btnSuccess, opacity: processingApproval === item.id ? 0.6 : 1 }}
                        disabled={processingApproval === item.id}
                        onClick={() => handleApproval(item.id, 'approved')}
                      >
                        {processingApproval === item.id ? 'Processing...' : '✓ Approve'}
                      </button>
                      <button
                        style={{ ...btnDanger, opacity: processingApproval === item.id ? 0.6 : 1 }}
                        disabled={processingApproval === item.id}
                        onClick={() => handleApproval(item.id, 'rejected')}
                      >
                        {processingApproval === item.id ? 'Processing...' : '✗ Reject'}
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* E-Signature Pad */}
        <div style={{ ...cardStyle }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 12 }}>E-Signature</div>
          <div style={{ fontSize: 13, color: DIM, marginBottom: 12 }}>
            Draw your signature below. This will be applied to any approvals you submit.
          </div>
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
            <canvas
              ref={sigCanvasRef}
              width={400}
              height={150}
              style={{ width: '100%', maxWidth: 400, height: 150, background: BG, cursor: 'crosshair', display: 'block' }}
              onMouseDown={(e) => { initSignature(); startSigDraw(e); }}
              onMouseMove={drawSig}
              onMouseUp={endSigDraw}
              onMouseLeave={endSigDraw}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button style={btnOutline} onClick={clearSignature}>Clear Signature</button>
            {signatureData && <span style={{ fontSize: 12, color: GREEN }}>✓ Signature captured</span>}
          </div>
        </div>

        {/* Approval History */}
        <div style={{ ...cardStyle }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Approval History</div>
          {approvalHistory.length === 0 ? (
            <div style={{ color: DIM, fontSize: 14, textAlign: 'center', padding: 24 }}>No approval history yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {approvalHistory.map((h) => (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${statusColor(h.action)}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 16 }}>{h.action === 'approved' ? '✓' : '✗'}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{h.item_title}</div>
                    <div style={{ fontSize: 12, color: DIM }}>{fmtDate(h.date)} at {fmtTime(h.date)}</div>
                    {h.notes && <div style={{ fontSize: 12, color: DIM, marginTop: 4, fontStyle: 'italic' }}>"{h.notes}"</div>}
                  </div>
                  <span style={badgeStyle(statusColor(h.action))}>{h.action}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ══════════════════════════════════════════════════════════════════
     TAB: FINANCIALS
     ══════════════════════════════════════════════════════════════════ */
  const renderFinancials = () => {
    if (finLoading) return <LoadingBlock />;

    const projectedFinal = (project.original_contract || 0) + (project.committed_cost - project.original_contract);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Contract Comparison */}
        <div style={{ ...cardStyle }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 20 }}>Contract Summary</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div style={{ background: BG, borderRadius: 10, padding: 20, textAlign: 'center', border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Original Contract</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: TEXT }}>{fmt(project.original_contract)}</div>
            </div>
            <div style={{ background: BG, borderRadius: 10, padding: 20, textAlign: 'center', border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Current Contract</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: GOLD }}>{fmt(project.committed_cost)}</div>
              {project.committed_cost !== project.original_contract && (
                <div style={{ fontSize: 12, color: project.committed_cost > project.original_contract ? RED : GREEN, marginTop: 4 }}>
                  {project.committed_cost > project.original_contract ? '+' : ''}{fmt(project.committed_cost - project.original_contract)}
                </div>
              )}
            </div>
            <div style={{ background: BG, borderRadius: 10, padding: 20, textAlign: 'center', border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Projected Final Cost</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: projectedFinal > project.original_contract ? AMBER : GREEN }}>{fmt(projectedFinal)}</div>
            </div>
          </div>
        </div>

        {/* Invoice History */}
        <div style={{ ...cardStyle }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Invoice History</div>
          {invoices.length === 0 ? (
            <EmptyState icon="🧾" title="No Invoices" subtitle="Invoices will appear here as they are generated." />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr>
                    {['Invoice #', 'Date', 'Due Date', 'Amount', 'Status'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} style={{ borderBottom: `1px solid ${BORDER}22` }}>
                      <td style={{ padding: '12px', color: TEXT, fontWeight: 600 }}>{inv.number}</td>
                      <td style={{ padding: '12px', color: DIM }}>{fmtDate(inv.date)}</td>
                      <td style={{ padding: '12px', color: DIM }}>{fmtDate(inv.due_date)}</td>
                      <td style={{ padding: '12px', color: TEXT, fontWeight: 700 }}>{fmt(inv.amount)}</td>
                      <td style={{ padding: '12px' }}><span style={badgeStyle(statusColor(inv.status))}>{inv.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Budget Line Items */}
        <div style={{ ...cardStyle }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Budget Breakdown</div>
          {budgetLines.length === 0 ? (
            <EmptyState icon="📊" title="No Budget Data" subtitle="Budget line items will appear here." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Header row */}
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 100px 100px 100px 100px 100px', gap: 8, padding: '8px 12px', fontSize: 11, color: DIM, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: `1px solid ${BORDER}` }}>
                <div>Code</div><div>Description</div><div style={{ textAlign: 'right' }}>Original</div><div style={{ textAlign: 'right' }}>Changes</div><div style={{ textAlign: 'right' }}>Current</div><div style={{ textAlign: 'right' }}>Spent</div><div style={{ textAlign: 'right' }}>Remaining</div>
              </div>
              {budgetLines.map((line) => (
                <div key={line.id}>
                  <div
                    style={{ display: 'grid', gridTemplateColumns: '80px 1fr 100px 100px 100px 100px 100px', gap: 8, padding: '10px 12px', fontSize: 13, cursor: 'pointer', borderBottom: `1px solid ${BORDER}22`, transition: 'background .15s' }}
                    onClick={() => setExpandedBudget({ ...expandedBudget, [line.id]: !expandedBudget[line.id] })}
                    onMouseEnter={(e) => (e.currentTarget.style.background = `${BORDER}33`)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ color: GOLD, fontWeight: 600 }}>{line.code}</div>
                    <div style={{ color: TEXT, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, color: DIM }}>{expandedBudget[line.id] ? '▼' : '▶'}</span>
                      {line.description}
                    </div>
                    <div style={{ textAlign: 'right', color: DIM }}>{fmt(line.original)}</div>
                    <div style={{ textAlign: 'right', color: line.changes > 0 ? AMBER : line.changes < 0 ? GREEN : DIM }}>{fmt(line.changes)}</div>
                    <div style={{ textAlign: 'right', color: TEXT }}>{fmt(line.current)}</div>
                    <div style={{ textAlign: 'right', color: TEXT }}>{fmt(line.spent)}</div>
                    <div style={{ textAlign: 'right', color: line.remaining < 0 ? RED : GREEN }}>{fmt(line.remaining)}</div>
                  </div>
                  {expandedBudget[line.id] && (
                    <div style={{ padding: '12px 24px', background: `${BG}80`, borderBottom: `1px solid ${BORDER}22` }}>
                      <div style={{ display: 'flex', gap: 24, fontSize: 12, color: DIM }}>
                        <div>Committed: <span style={{ color: TEXT, fontWeight: 600 }}>{fmt(line.committed)}</span></div>
                        <div>% Complete: <span style={{ color: GOLD, fontWeight: 600 }}>{line.current > 0 ? pct(line.spent, line.current) : 0}%</span></div>
                      </div>
                      <div style={{ marginTop: 8, height: 4, background: BORDER, borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${line.current > 0 ? pct(line.spent, line.current) : 0}%`, background: GOLD, borderRadius: 2 }} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Make Payment */}
        <div style={{ ...cardStyle }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Make a Payment</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={labelStyle}>Payment Amount ($)</label>
              <input
                type="number"
                style={inputStyle}
                placeholder="0.00"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>
            <button
              style={{ ...btnPrimary, opacity: paymentProcessing ? 0.6 : 1 }}
              disabled={paymentProcessing}
              onClick={makePayment}
            >
              {paymentProcessing ? 'Processing...' : '💳 Submit Payment'}
            </button>
          </div>
        </div>

        {/* Payment History */}
        <div style={{ ...cardStyle }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Payment History</div>
          {payments.length === 0 ? (
            <EmptyState icon="💳" title="No Payments" subtitle="Payment history will appear here." />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr>
                    {['Date', 'Amount', 'Method', 'Reference'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} style={{ borderBottom: `1px solid ${BORDER}22` }}>
                      <td style={{ padding: '12px', color: DIM }}>{fmtDate(p.date)}</td>
                      <td style={{ padding: '12px', color: GREEN, fontWeight: 700 }}>{fmt(p.amount)}</td>
                      <td style={{ padding: '12px', color: TEXT }}>{p.method}</td>
                      <td style={{ padding: '12px', color: DIM }}>{p.reference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ══════════════════════════════════════════════════════════════════
     TAB: MESSAGES
     ══════════════════════════════════════════════════════════════════ */
  const renderMessages = () => {
    if (msgLoading) return <LoadingBlock />;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 240px)', minHeight: 500 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Project Messages</div>

        {/* Message list */}
        <div style={{ ...cardStyle, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: 20, marginBottom: 16 }}>
          {messages.length === 0 ? (
            <EmptyState icon="💬" title="No Messages" subtitle="Start a conversation with your project team." />
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  justifyContent: msg.sender_type === 'client' ? 'flex-end' : 'flex-start',
                }}
              >
                <div style={{
                  maxWidth: '70%',
                  background: msg.sender_type === 'client' ? `${GOLD}20` : `${BORDER}80`,
                  borderRadius: msg.sender_type === 'client' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  padding: '12px 16px',
                  border: `1px solid ${msg.sender_type === 'client' ? GOLD + '30' : BORDER}`,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: msg.sender_type === 'client' ? GOLD : BLUE, marginBottom: 4 }}>
                    {msg.sender}
                  </div>
                  <div style={{ fontSize: 14, color: TEXT, lineHeight: 1.5 }}>{msg.text}</div>
                  {msg.attachment && (
                    <div style={{ marginTop: 8, padding: '6px 10px', background: `${BG}80`, borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 14 }}>📎</span>
                      <span style={{ fontSize: 12, color: BLUE }}>{msg.attachment.name}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: 10, color: DIM }}>{fmtTime(msg.timestamp)}</span>
                    {msg.sender_type === 'client' && msg.read && (
                      <span style={{ fontSize: 10, color: BLUE }}>✓✓</span>
                    )}
                    {msg.sender_type === 'client' && !msg.read && (
                      <span style={{ fontSize: 10, color: DIM }}>✓</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Mention popup */}
        {showMentions && (
          <div style={{
            background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 8,
            position: 'relative', marginBottom: 8, zIndex: 10,
          }}>
            <div style={{ fontSize: 11, color: DIM, padding: '4px 8px', fontWeight: 700, textTransform: 'uppercase' }}>Mention</div>
            {mentionList.map((name) => (
              <div
                key={name}
                style={{ padding: '8px 12px', borderRadius: 6, cursor: 'pointer', color: TEXT, fontSize: 13, transition: 'background .15s' }}
                onClick={() => insertMention(name)}
                onMouseEnter={(e) => (e.currentTarget.style.background = `${BORDER}60`)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                @{name}
              </div>
            ))}
          </div>
        )}

        {/* Compose bar */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <button
            style={{ ...btnOutline, padding: '10px 14px', flexShrink: 0 }}
            onClick={() => showToast('File upload coming soon')}
            title="Attach file"
          >
            📎
          </button>
          <div style={{ flex: 1, position: 'relative' }}>
            <textarea
              style={{ ...inputStyle, minHeight: 44, maxHeight: 120, resize: 'none' }}
              placeholder="Type a message... (use @ to mention)"
              value={newMessage}
              onChange={(e) => handleMessageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
          </div>
          <button
            style={{ ...btnPrimary, padding: '10px 20px', flexShrink: 0, opacity: sendingMsg ? 0.6 : 1 }}
            disabled={sendingMsg || !newMessage.trim()}
            onClick={sendMessage}
          >
            {sendingMsg ? '...' : 'Send ➤'}
          </button>
        </div>
      </div>
    );
  };

  /* ══════════════════════════════════════════════════════════════════
     TAB: DOCUMENTS
     ══════════════════════════════════════════════════════════════════ */
  const renderDocuments = () => {
    if (docsLoading) return <LoadingBlock />;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>Document Vault</div>

        {/* Search and category filter */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <input
              type="text"
              style={inputStyle}
              placeholder="🔍 Search documents..."
              value={docSearch}
              onChange={(e) => setDocSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Category tabs */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {DOC_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setDocCategory(cat)}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: `1px solid ${docCategory === cat ? GOLD : BORDER}`,
                background: docCategory === cat ? `${GOLD}20` : 'transparent',
                color: docCategory === cat ? GOLD : DIM,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all .15s',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Documents grid */}
        {filteredDocs.length === 0 ? (
          <EmptyState icon="📁" title="No Documents Found" subtitle={docSearch ? 'Try a different search term.' : 'Documents will appear here as they are shared.'} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {filteredDocs.map((doc) => (
              <div key={doc.id} style={{ ...cardStyle, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 8, background: `${BLUE}20`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0,
                  }}>
                    {doc.category === 'Drawings' ? '📐' : doc.category === 'Contracts' ? '📄' : doc.category === 'Specs' ? '📋' : doc.category === 'Permits' ? '🏛️' : doc.category === 'Photos' ? '📷' : '📁'}
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</div>
                    <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{doc.category} · v{doc.version}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: DIM }}>
                  <div>
                    <div>{fmtDate(doc.date)}</div>
                    <div style={{ marginTop: 2 }}>By: {doc.uploaded_by}</div>
                  </div>
                  <div style={{ fontSize: 11, color: DIM }}>{doc.size}</div>
                </div>
                <button
                  style={{ ...btnOutline, padding: '8px 14px', fontSize: 12, marginTop: 4, width: '100%', textAlign: 'center' }}
                  onClick={() => showToast('Download started')}
                >
                  ⬇ Download
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  /* ══════════════════════════════════════════════════════════════════
     TAB: WARRANTY & PUNCH
     ══════════════════════════════════════════════════════════════════ */
  const warrantyStatusSteps = ['submitted', 'assigned', 'in_progress', 'resolved'];

  const renderWarranty = () => {
    if (warLoading) return <LoadingBlock />;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Submit warranty claim */}
        <div style={{ ...cardStyle }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Submit Warranty Claim</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Category</label>
              <select
                style={{ ...inputStyle, appearance: 'none' as const }}
                value={newClaim.category}
                onChange={(e) => setNewClaim({ ...newClaim, category: e.target.value })}
              >
                {['Plumbing', 'Electrical', 'HVAC', 'Roofing', 'Flooring', 'Painting', 'Windows/Doors', 'Structural', 'Other'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Location</label>
              <input
                style={inputStyle}
                placeholder="e.g., Kitchen, Master Bath..."
                value={newClaim.location}
                onChange={(e) => setNewClaim({ ...newClaim, location: e.target.value })}
              />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Description</label>
            <textarea
              style={textareaStyle}
              placeholder="Describe the issue in detail..."
              value={newClaim.description}
              onChange={(e) => setNewClaim({ ...newClaim, description: e.target.value })}
            />
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              style={{ ...btnOutline, padding: '10px 16px' }}
              onClick={() => showToast('Photo upload coming soon')}
            >
              📷 Attach Photos
            </button>
            <button
              style={{ ...btnPrimary, opacity: submittingClaim ? 0.6 : 1 }}
              disabled={submittingClaim}
              onClick={submitWarrantyClaim}
            >
              {submittingClaim ? 'Submitting...' : 'Submit Claim'}
            </button>
          </div>
        </div>

        {/* Active Claims */}
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Warranty Claims</div>
          {warrantyClaims.length === 0 ? (
            <EmptyState icon="🔧" title="No Warranty Claims" subtitle="Submit a warranty claim above if you encounter any issues." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {warrantyClaims.map((claim) => (
                <div key={claim.id} style={{ ...cardStyle }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                    <div>
                      <span style={badgeStyle(statusColor(claim.status))}>{claim.status.replace('_', ' ')}</span>
                      <span style={{ ...badgeStyle(PURPLE), marginLeft: 8 }}>{claim.category}</span>
                    </div>
                    <div style={{ fontSize: 12, color: DIM }}>{fmtDate(claim.created_at)}</div>
                  </div>
                  <div style={{ fontSize: 14, color: TEXT, marginBottom: 8 }}>{claim.description}</div>
                  <div style={{ fontSize: 12, color: DIM, marginBottom: 16 }}>Location: {claim.location}</div>

                  {/* Status timeline */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 12 }}>
                    {warrantyStatusSteps.map((step, idx) => {
                      const stepIdx = warrantyStatusSteps.indexOf(claim.status);
                      const isActive = idx <= stepIdx;
                      const isCurrent = idx === stepIdx;
                      return (
                        <React.Fragment key={step}>
                          <div style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, position: 'relative',
                          }}>
                            <div style={{
                              width: isCurrent ? 28 : 20, height: isCurrent ? 28 : 20,
                              borderRadius: '50%',
                              background: isActive ? statusColor(step) : BORDER,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              border: isCurrent ? `3px solid ${TEXT}` : 'none',
                              transition: 'all .3s',
                            }}>
                              {isActive && <span style={{ color: '#fff', fontSize: 10, fontWeight: 800 }}>✓</span>}
                            </div>
                            <div style={{ fontSize: 9, color: isActive ? TEXT : DIM, textTransform: 'capitalize', whiteSpace: 'nowrap', fontWeight: isCurrent ? 700 : 400 }}>
                              {step.replace('_', ' ')}
                            </div>
                          </div>
                          {idx < warrantyStatusSteps.length - 1 && (
                            <div style={{ flex: 1, height: 2, background: idx < stepIdx ? statusColor(step) : BORDER, minWidth: 20, marginTop: -16 }} />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>

                  {/* Photos */}
                  {claim.photos.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                      {claim.photos.map((url, i) => (
                        <div key={i} style={{ width: 64, height: 64, borderRadius: 6, overflow: 'hidden', border: `1px solid ${BORDER}`, background: BG }}>
                          <img src={url} alt={`Evidence ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Punch List */}
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Punch List Items</div>
          {punchItems.length === 0 ? (
            <EmptyState icon="📋" title="No Punch List Items" subtitle="Punch list items will appear here during project closeout." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {punchItems.map((item) => (
                <div key={item.id} style={{ ...cardStyle, padding: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: item.status === 'signed_off' ? `${GREEN}20` : item.status === 'completed' ? `${BLUE}20` : `${AMBER}20`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 16 }}>
                      {item.status === 'signed_off' ? '✓' : item.status === 'completed' ? '🔍' : '🔨'}
                    </span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: DIM }}>Location: {item.location}</div>
                  </div>
                  <span style={badgeStyle(statusColor(item.status))}>{item.status.replace('_', ' ')}</span>
                  {item.status === 'completed' && (
                    <button
                      style={{ ...btnSuccess, padding: '8px 16px', fontSize: 12 }}
                      onClick={() => handlePunchSignOff(item.id)}
                    >
                      ✓ Sign Off
                    </button>
                  )}
                  {item.photo && (
                    <div style={{ width: 48, height: 48, borderRadius: 6, overflow: 'hidden', border: `1px solid ${BORDER}`, flexShrink: 0 }}>
                      <img src={item.photo} alt="Punch item" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ══════════════════════════════════════════════════════════════════
     TAB: AI SUMMARY
     ══════════════════════════════════════════════════════════════════ */
  const renderAiSummary = () => {
    if (aiLoading) return <LoadingBlock />;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>AI Project Summaries</div>
            <div style={{ fontSize: 13, color: DIM, marginTop: 4 }}>Weekly AI-generated insights about your project</div>
          </div>
          <button
            style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 8, opacity: generatingAi ? 0.6 : 1 }}
            disabled={generatingAi}
            onClick={generateAiSummary}
          >
            {generatingAi ? (
              <>
                <div style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,.3)', borderTopColor: BG, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                Generating...
              </>
            ) : (
              <>🤖 Generate Summary</>
            )}
          </button>
        </div>

        {aiSummaries.length === 0 ? (
          <EmptyState icon="🤖" title="No Summaries Yet" subtitle="Click 'Generate Summary' to create your first AI project summary." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {aiSummaries.map((summary) => (
              <div key={summary.id} style={{ ...cardStyle, position: 'relative', overflow: 'hidden' }}>
                {/* Decorative gradient */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${PURPLE}, ${BLUE}, ${GOLD})` }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>Week of {fmtDate(summary.week_of)}</div>
                    <div style={{ fontSize: 11, color: DIM, marginTop: 4 }}>Generated {fmtDate(summary.generated_at)} at {fmtTime(summary.generated_at)}</div>
                  </div>
                  <button
                    style={{ ...btnOutline, padding: '8px 14px', fontSize: 12, opacity: emailSending ? 0.6 : 1 }}
                    disabled={emailSending}
                    onClick={() => emailSummary(summary.id)}
                  >
                    {emailSending ? 'Sending...' : '📧 Send to Email'}
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                  {/* Work Completed */}
                  <div style={{ background: BG, borderRadius: 10, padding: 16, border: `1px solid ${BORDER}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 18 }}>🏗️</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: GREEN }}>Work Completed</span>
                    </div>
                    <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.7 }}>{summary.work_completed}</div>
                  </div>

                  {/* Upcoming Milestones */}
                  <div style={{ background: BG, borderRadius: 10, padding: 16, border: `1px solid ${BORDER}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 18 }}>🎯</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: BLUE }}>Upcoming Milestones</span>
                    </div>
                    <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.7 }}>{summary.upcoming_milestones}</div>
                  </div>

                  {/* Budget Status */}
                  <div style={{ background: BG, borderRadius: 10, padding: 16, border: `1px solid ${BORDER}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 18 }}>💰</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: GOLD }}>Budget Status</span>
                    </div>
                    <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.7 }}>{summary.budget_status}</div>
                  </div>

                  {/* Weather Delays */}
                  <div style={{ background: BG, borderRadius: 10, padding: 16, border: `1px solid ${BORDER}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 18 }}>🌧️</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: AMBER }}>Weather Delays</span>
                    </div>
                    <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.7 }}>{summary.weather_delays}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  /* ══════════════════════════════════════════════════════════════════
     TAB CONTENT ROUTER
     ══════════════════════════════════════════════════════════════════ */
  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard': return renderDashboard();
      case 'approvals': return renderApprovals();
      case 'financials': return renderFinancials();
      case 'messages': return renderMessages();
      case 'documents': return renderDocuments();
      case 'warranty': return renderWarranty();
      case 'ai': return renderAiSummary();
      default: return renderDashboard();
    }
  };

  /* ══════════════════════════════════════════════════════════════════
     MAIN RENDER
     ══════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: 'system-ui, -apple-system, sans-serif', color: TEXT, display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: ${BG}; }
        ::-webkit-scrollbar-thumb { background: ${BORDER}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${DIM}; }
        body { margin: 0; padding: 0; }
        select option { background: ${BG}; color: ${TEXT}; }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────── */}
      <header style={{
        background: `linear-gradient(180deg, ${RAISED} 0%, ${BG} 100%)`,
        borderBottom: `1px solid ${BORDER}`,
        padding: '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          {/* Logo area */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 28 }}>🌵</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: GOLD, letterSpacing: 1.5, lineHeight: 1 }}>SAGUARO</div>
              <div style={{ fontSize: 9, color: DIM, letterSpacing: 2, textTransform: 'uppercase' }}>Client Portal</div>
            </div>
          </div>

          {/* Project & client info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{project.name}</div>
              <div style={{ fontSize: 11, color: DIM }}>{project.client_name}{project.company_name ? ` · ${project.company_name}` : ''}</div>
            </div>
            <div style={{
              width: 38, height: 38, borderRadius: '50%', background: `${GOLD}20`, border: `2px solid ${GOLD}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: GOLD,
            }}>
              {(project.client_name || 'C').charAt(0)}
            </div>
          </div>

          {/* Mobile hamburger */}
          <button
            style={{
              display: 'none',
              background: 'transparent', border: 'none', color: TEXT, fontSize: 24, cursor: 'pointer', padding: 4,
            }}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>

      {/* ── Tab Navigation ──────────────────────────────────────── */}
      <nav style={{
        background: RAISED,
        borderBottom: `1px solid ${BORDER}`,
        overflowX: 'auto',
        position: 'sticky',
        top: 64,
        zIndex: 99,
      }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', padding: '0 16px' }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setMobileMenuOpen(false); }}
              style={{
                padding: '14px 20px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.id ? `3px solid ${GOLD}` : '3px solid transparent',
                color: activeTab === tab.id ? GOLD : DIM,
                fontSize: 13,
                fontWeight: activeTab === tab.id ? 700 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all .2s',
              }}
            >
              <span style={{ fontSize: 15 }}>{tab.icon}</span>
              {tab.label}
              {/* Notification badges */}
              {tab.id === 'messages' && unreadMessages > 0 && (
                <span style={{
                  background: RED, color: '#fff', fontSize: 10, fontWeight: 800,
                  borderRadius: 10, padding: '2px 6px', minWidth: 18, textAlign: 'center',
                  lineHeight: '14px',
                }}>
                  {unreadMessages}
                </span>
              )}
              {tab.id === 'approvals' && pendingApprovalCount > 0 && (
                <span style={{
                  background: AMBER, color: BG, fontSize: 10, fontWeight: 800,
                  borderRadius: 10, padding: '2px 6px', minWidth: 18, textAlign: 'center',
                  lineHeight: '14px',
                }}>
                  {pendingApprovalCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* ── Mobile Menu Overlay ─────────────────────────────────── */}
      {mobileMenuOpen && (
        <div style={{
          position: 'fixed', top: 64, left: 0, right: 0, bottom: 0,
          background: `${BG}F0`, zIndex: 98, padding: 24,
          animation: 'fadeIn .2s ease',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setMobileMenuOpen(false); }}
                style={{
                  padding: '16px 20px',
                  background: activeTab === tab.id ? `${GOLD}15` : 'transparent',
                  border: `1px solid ${activeTab === tab.id ? GOLD : BORDER}`,
                  borderRadius: 10,
                  color: activeTab === tab.id ? GOLD : TEXT,
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <span style={{ fontSize: 20 }}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Main Content ────────────────────────────────────────── */}
      <main style={{ flex: 1, maxWidth: 1400, margin: '0 auto', width: '100%', padding: '32px 24px' }}>
        <div style={{ animation: 'slideUp .3s ease' }} key={activeTab}>
          {renderTabContent()}
        </div>
      </main>

      {/* ── Toast Notification ──────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: toast.type === 'success' ? GREEN : RED,
          color: '#fff', padding: '14px 24px', borderRadius: 10,
          fontWeight: 600, fontSize: 14, zIndex: 200,
          boxShadow: '0 8px 32px rgba(0,0,0,.3)',
          animation: 'slideUp .3s ease',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>{toast.type === 'success' ? '✓' : '✗'}</span>
          {toast.msg}
        </div>
      )}

      {/* ── Scroll to Top FAB ──────────────────────────────────── */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          style={{
            position: 'fixed',
            bottom: 80,
            right: 24,
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: GOLD,
            color: BG,
            border: 'none',
            fontSize: 20,
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0,0,0,.4)',
            zIndex: 150,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'fadeIn .2s ease',
            transition: 'transform .2s',
          }}
          title="Scroll to top"
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          ↑
        </button>
      )}

      {/* ── Quick Actions FAB ──────────────────────────────────── */}
      <div style={{
        position: 'fixed',
        bottom: 24,
        left: 24,
        zIndex: 150,
      }}>
        <div style={{
          background: RAISED,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: '8px',
          display: 'flex',
          gap: 4,
          boxShadow: '0 4px 20px rgba(0,0,0,.4)',
        }}>
          {[
            { label: 'Dashboard', tab: 'dashboard' as TabId, icon: '📊' },
            { label: 'Messages', tab: 'messages' as TabId, icon: '💬' },
            { label: 'Approvals', tab: 'approvals' as TabId, icon: '✅' },
          ].map((qa) => (
            <button
              key={qa.tab}
              onClick={() => setActiveTab(qa.tab)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                border: 'none',
                background: activeTab === qa.tab ? `${GOLD}30` : 'transparent',
                cursor: 'pointer',
                fontSize: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background .15s',
              }}
              title={qa.label}
            >
              {qa.icon}
            </button>
          ))}
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer style={{
        borderTop: `1px solid ${BORDER}`,
        padding: '24px',
        background: RAISED,
      }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          {/* Project timeline mini bar */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: DIM }}>Project Timeline</span>
              <span style={{ fontSize: 11, color: DIM }}>
                {fmtDate(project.start_date)} — {fmtDate(project.end_date)}
              </span>
            </div>
            <div style={{ height: 4, background: BG, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${totalDuration > 0 ? Math.min(100, pct(daysElapsed, totalDuration)) : 0}%`,
                background: `linear-gradient(90deg, ${GREEN}, ${GOLD})`,
                borderRadius: 2,
                transition: 'width 1s ease',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 10, color: DIM }}>{daysElapsed} days elapsed</span>
              <span style={{ fontSize: 10, color: GOLD, fontWeight: 600 }}>{daysRemaining} days remaining</span>
            </div>
          </div>

          {/* Footer links & branding */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}44` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>🌵</span>
              <div>
                <div style={{ fontSize: 12, color: DIM }}>
                  Powered by <span style={{ color: GOLD, fontWeight: 700 }}>Saguaro CRM</span>
                </div>
                <div style={{ fontSize: 10, color: `${DIM}60`, marginTop: 2 }}>
                  Secure client portal · All data encrypted in transit
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: DIM }}>
              <span style={{ cursor: 'pointer' }} onClick={() => showToast('Help center coming soon')}>Help</span>
              <span style={{ cursor: 'pointer' }} onClick={() => showToast('Privacy policy coming soon')}>Privacy</span>
              <span style={{ cursor: 'pointer' }} onClick={() => showToast('Terms coming soon')}>Terms</span>
            </div>
          </div>

          {/* Keyboard shortcuts hint */}
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <span style={{ fontSize: 10, color: `${DIM}40` }}>
              Tip: Use Alt+1 through Alt+7 to quickly switch tabs
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
