'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import {
  loadMemoryProfile,
  saveMemoryProfile,
  createFreshProfile,
  analyzeAndUpdateStyle,
  generateStyleMirrorInstructions,
  buildMemoryContextBlock,
  summarizeSession,
  extractProjectMentions,
  UserMemoryProfile,
} from '@/lib/sage-memory';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  quickActions?: QuickAction[];
}

interface QuickAction {
  label: string;
  href: string;
  icon: string;
  description: string;
}

interface SaguaroChatWidgetProps {
  variant: 'marketing' | 'crm';
  userId?: string | null;
  projectList?: Array<{ id: string; name: string }>;
}

const MARKETING_CHIPS = [
  'How does AI takeoff work?',
  'How much does it cost?',
  'Compare vs Procore',
  'How do lien waivers work?',
  'What is a G702?',
  'Certified payroll help',
];

const CRM_CHIPS = [
  'Generate a pay app',
  'Check my lien deadlines',
  'Walk me through takeoff',
  'Help me write an RFI',
  'What needs attention?',
  'Change order best practices',
];

const QUICK_ACTION_MAP: Record<string, { label: string; icon: string; description: string; hrefTemplate: string }> = {
  'takeoff': { label: 'Open AI Takeoff', icon: '📐', description: 'Start a new takeoff', hrefTemplate: '/app/projects/{id}/takeoff' },
  'pay app': { label: 'New Pay Application', icon: '📄', description: 'Generate G702/G703', hrefTemplate: '/app/projects/{id}/pay-apps' },
  'g702': { label: 'New Pay Application', icon: '📄', description: 'Generate G702/G703', hrefTemplate: '/app/projects/{id}/pay-apps' },
  'lien waiver': { label: 'Lien Waivers', icon: '🔒', description: 'Manage lien waivers', hrefTemplate: '/app/projects/{id}/lien-waivers' },
  'change order': { label: 'Change Orders', icon: '🔄', description: 'View change orders', hrefTemplate: '/app/projects/{id}/change-orders' },
  'autopilot': { label: 'Open Autopilot', icon: '🤖', description: 'View all alerts & deadlines', hrefTemplate: '/app/autopilot' },
  'bid package': { label: 'Bid Packages', icon: '📦', description: 'Manage bid packages', hrefTemplate: '/app/bid-packages' },
  'reports': { label: 'Reports', icon: '📊', description: 'View all reports', hrefTemplate: '/app/reports' },
};

import { renderSafeMarkdown } from '@/lib/sanitize-html';

function renderMarkdown(text: string): string {
  return renderSafeMarkdown(text);
}

function extractQuickActions(
  content: string,
  projectList: Array<{ id: string; name: string }>
): QuickAction[] {
  const actions: QuickAction[] = [];
  const firstProjectId = projectList[0]?.id ?? 'default';

  const navigationPatterns = [/\bgo to\b|\bnavigate to\b|\bopen\b|\bclick on\b|\bhead to\b/i];
  const hasNavigation = navigationPatterns.some(p => p.test(content));
  if (!hasNavigation) return actions;

  for (const [keyword, actionDef] of Object.entries(QUICK_ACTION_MAP)) {
    if (content.toLowerCase().includes(keyword)) {
      let projectId = firstProjectId;
      for (const project of projectList) {
        if (content.toLowerCase().includes(project.name.toLowerCase())) {
          projectId = project.id;
          break;
        }
      }
      const href = actionDef.hrefTemplate.replace('{id}', projectId);
      if (!actions.find(a => a.href === href)) {
        actions.push({ label: actionDef.label, href, icon: actionDef.icon, description: actionDef.description });
      }
    }
  }

  return actions.slice(0, 3);
}

function generateReturningUserGreeting(profile: UserMemoryProfile): string | null {
  if (profile.totalSessionCount < 2) return null;

  const name = profile.identity.firstName;
  const lastSession = profile.sessionHistory[profile.sessionHistory.length - 1];
  const openLoops = lastSession?.openLoops ?? [];
  const lastTopic = lastSession?.keyTopicsDiscussed[0];

  const greetings: string[] = [];

  if (name) greetings.push(`Hey ${name}, welcome back.`);
  else greetings.push('Welcome back.');

  if (openLoops.length > 0) {
    greetings.push('Last time we were working through something — want to pick that up?');
  } else if (lastTopic) {
    greetings.push(`Last time you were working on ${lastTopic}.`);
  }

  if (profile.engagement.currentStreak > 3) {
    greetings.push(`${profile.engagement.currentStreak}-day streak — you're on it. 🔥`);
  }

  greetings.push('What do you need?');
  return greetings.join(' ');
}

function getPersonalizedChips(
  profile: UserMemoryProfile,
  projectList: Array<{ id: string; name: string }>,
  variant: 'marketing' | 'crm'
): string[] {
  if (profile.totalSessionCount < 3) {
    return variant === 'crm' ? CRM_CHIPS : MARKETING_CHIPS;
  }

  const chips: string[] = [];

  const mostMentioned = profile.projectMemories
    .sort((a, b) => b.mentionCount - a.mentionCount)[0];

  if (mostMentioned) {
    chips.push(`Status of ${mostMentioned.projectName}?`);
    if (mostMentioned.openIssues.length > 0) {
      chips.push(`Update on ${mostMentioned.openIssues[0].slice(0, 30)}`);
    }
  }

  const topFeature = profile.interests.topFeatures[0];
  if (topFeature === 'pay applications') chips.push('New pay app — this month');
  if (topFeature === 'lien rights/waivers') chips.push('Send lien waivers to all subs');
  if (topFeature === 'AI takeoff') chips.push('Start new takeoff');

  const lastSession = profile.sessionHistory[profile.sessionHistory.length - 1];
  if (lastSession?.openLoops.length > 0) {
    chips.push('Follow up from last time');
  }

  const defaults = variant === 'crm' ? CRM_CHIPS : MARKETING_CHIPS;
  for (const d of defaults) {
    if (chips.length >= 6) break;
    if (!chips.includes(d)) chips.push(d);
  }

  return chips.slice(0, 6);
}

export default function SaguaroChatWidget({
  variant,
  userId = null,
  projectList = [],
}: SaguaroChatWidgetProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [memoryProfile, setMemoryProfile] = useState<UserMemoryProfile | null>(null);
  const [sessionId] = useState(() => {
    if (typeof window !== 'undefined') {
      let id = sessionStorage.getItem('sage_anon_session_id');
      if (!id) { id = Math.random().toString(36).slice(2); sessionStorage.setItem('sage_anon_session_id', id); }
      return id;
    }
    return Math.random().toString(36).slice(2);
  });
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [isTyping, setIsTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const panelRef = useRef<HTMLDivElement>(null);

  function getDefaultWelcome(v: 'marketing' | 'crm'): string {
    if (v === 'marketing') {
      return "Hey 👋 I'm Sage — Saguaro's AI construction advisor.\n\nI can help with:\n- **Product questions** — what Saguaro does and how it works\n- **Construction questions** — lien rights, AIA contracts, pay apps, prevailing wage\n- **Pricing and comparisons** — how we stack up vs Procore, Buildertrend, and others\n\nWhat can I help you with?";
    }
    return "Hey, I'm Sage — your AI project assistant.\n\nI have context on your active projects. Ask me:\n- How do I generate a G702 for [project name]?\n- What lien waivers are due this month?\n- Help me write an RFI response\n- Walk me through the AI takeoff\n- What should I do next on [project]?\n\nWhat do you need?";
  }

  // Load memory profile on mount
  useEffect(() => {
    let profile = loadMemoryProfile(userId, sessionId);
    if (!profile) {
      profile = createFreshProfile(userId, sessionId);
    }
    setMemoryProfile(profile);

    const isReturning = profile.totalSessionCount > 1 && profile.totalMessagesSent > 3;
    let welcomeContent: string;

    if (isReturning) {
      const returningGreeting = generateReturningUserGreeting(profile);
      welcomeContent = returningGreeting ?? getDefaultWelcome(variant);
    } else {
      welcomeContent = getDefaultWelcome(variant);
    }

    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: welcomeContent,
      timestamp: new Date(),
    }]);

    const timer = setTimeout(() => {
      if (!isOpen) setHasNewMessage(true);
    }, 4000);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, sessionId, variant]);

  // Restore CRM message history
  useEffect(() => {
    if (!userId) return;
    try {
      const savedMessages = localStorage.getItem(`sage_messages_v2_${userId}`);
      if (savedMessages) {
        const parsed = JSON.parse(savedMessages) as Message[];
        if (parsed.length > 0) {
          const separator: Message = {
            id: 'separator-' + Date.now(),
            role: 'assistant',
            content: '— Continuing from your last session —',
            timestamp: new Date(),
          };
          // Restore timestamps as Date objects
          const restored = parsed.map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
          setMessages(prev => [...restored, separator, ...prev.filter(m => m.id !== 'welcome')]);
        }
      }
    } catch { /* ignore */ }
  }, [userId]);

  // Save messages after every update (CRM only)
  useEffect(() => {
    if (!userId || messages.length <= 1) return;
    try {
      const toSave = messages
        .filter(m => m.content !== '__TYPING__' && m.id !== 'welcome' && !m.id.startsWith('separator'))
        .slice(-50);
      localStorage.setItem(`sage_messages_v2_${userId}`, JSON.stringify(toSave));
    } catch { /* ignore quota errors */ }
  }, [messages, userId]);

  // Auto-scroll
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Save session on unmount
  useEffect(() => {
    return () => {
      if (memoryProfile && messages.length > 1) {
        const { updatedProfile } = summarizeSession(
          sessionId,
          messages.map(m => ({ role: m.role, content: m.content })),
          memoryProfile
        );
        saveMemoryProfile(updatedProfile, userId, sessionId);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoryProfile, messages, sessionId, userId]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  };

  const handleOpen = () => {
    setIsOpen(true);
    setHasNewMessage(false);
    setIsMinimized(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleClose = () => {
    if (memoryProfile && messages.length > 2) {
      const { updatedProfile } = summarizeSession(
        sessionId,
        messages.map(m => ({ role: m.role, content: m.content })),
        memoryProfile
      );
      saveMemoryProfile(updatedProfile, userId, sessionId);
      setMemoryProfile(updatedProfile);
    }
    setIsOpen(false);
  };

  const clearMemory = () => {
    try {
      const key = userId ? `sage_memory_v2_${userId}` : `sage_session_v2_${sessionId}`;
      const storage = userId ? localStorage : sessionStorage;
      storage.removeItem(key);
      if (userId) localStorage.removeItem(`sage_messages_v2_${userId}`);
    } catch { /* ignore */ }
    const freshProfile = createFreshProfile(userId, sessionId);
    setMemoryProfile(freshProfile);
    setMessages([{
      id: 'welcome-reset-' + Date.now(),
      role: 'assistant',
      content: 'Memory cleared. Starting fresh. What can I help you with?',
      timestamp: new Date(),
    }]);
    setShowMenu(false);
  };

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    let updatedProfile = memoryProfile ?? createFreshProfile(userId, sessionId);
    updatedProfile = analyzeAndUpdateStyle(updatedProfile, text);
    if (projectList.length > 0) {
      updatedProfile = extractProjectMentions(text, updatedProfile, projectList);
    }
    setMemoryProfile(updatedProfile);
    saveMemoryProfile(updatedProfile, userId, sessionId);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsStreaming(true);
    setIsTyping(true);

    if (inputRef.current) inputRef.current.style.height = 'auto';

    const assistantMsgId = (Date.now() + 1).toString();

    setMessages(prev => [...prev, {
      id: assistantMsgId,
      role: 'assistant',
      content: '__TYPING__',
      timestamp: new Date(),
    }]);

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const apiPath = variant === 'crm' ? '/api/chat/crm' : '/api/chat/marketing';

      const memoryContext = buildMemoryContextBlock(updatedProfile);
      const styleInstructions = generateStyleMirrorInstructions(updatedProfile);

      // For CRM, attach auth token and extract projectId from URL
      const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      let projectId: string | null = null;
      if (variant === 'crm') {
        const { data: { session } } = await getSupabaseBrowser().auth.getSession();
        if (session?.access_token) {
          requestHeaders['Authorization'] = `Bearer ${session.access_token}`;
        }
        projectId = pathname?.match(/\/projects\/([a-f0-9-]{36})/)?.[1] ?? null;
      }

      const response = await fetch(apiPath, {
        method: 'POST',
        headers: requestHeaders,
        signal: controller.signal,
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          memoryContext,
          styleInstructions,
          currentPage: pathname,
          ...(projectId ? { projectId } : {}),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error ?? 'Chat failed');
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      setIsTyping(false);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                accumulated += parsed.text;
                setMessages(prev => prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, content: accumulated }
                    : m
                ));
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }

      if (variant === 'crm' && accumulated && projectList.length > 0) {
        const quickActions = extractQuickActions(accumulated, projectList);
        if (quickActions.length > 0) {
          setMessages(prev => prev.map(m =>
            m.id === assistantMsgId ? { ...m, quickActions } : m
          ));
        }
      }

      // Update learned preferences every 10 messages
      if (updatedProfile.totalMessagesSent % 10 === 0) {
        const finalProfile = { ...updatedProfile };
        if (finalProfile.style.avgMessageLength === 'short' && finalProfile.style.directnessScore > 7) {
          finalProfile.learnedPreferences.preferredResponseLength = 'brief';
        }
        saveMemoryProfile(finalProfile, userId, sessionId);
        setMemoryProfile(finalProfile);
      }

      // Generate sage notes at milestones
      if (updatedProfile.totalMessagesSent === 20 || updatedProfile.totalMessagesSent === 50 || updatedProfile.totalMessagesSent % 100 === 0) {
        fetch('/api/chat/sage-notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageCount: updatedProfile.totalMessagesSent,
            recentMessages: newMessages.slice(-20).map(m => ({ role: m.role, content: m.content })),
            existingNotes: updatedProfile.sageNotes,
            identity: updatedProfile.identity,
          }),
        }).then(r => r.json()).then(({ notes }) => {
          if (notes && Array.isArray(notes)) {
            const p2 = { ...updatedProfile, sageNotes: notes };
            saveMemoryProfile(p2, userId, sessionId);
            setMemoryProfile(p2);
          }
        }).catch(() => {/* ignore */});
      }

    } catch (error: unknown) {
      setIsTyping(false);
      if (error instanceof Error && error.name === 'AbortError') {
        setMessages(prev => prev.filter(m => m.id !== assistantMsgId));
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Connection error';
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId
            ? { ...m, content: errorMessage.includes('limit')
                ? errorMessage
                : 'Having trouble connecting right now. Try again in a moment.' }
            : m
        ));
      }
    } finally {
      setIsStreaming(false);
      setIsTyping(false);
      setAbortController(null);
      scrollToBottom();
    }
  }, [messages, isStreaming, memoryProfile, userId, sessionId, variant, projectList, pathname, scrollToBottom]);

  const stopStreaming = () => { abortController?.abort(); };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const copyTranscript = () => {
    const text = messages
      .filter(m => m.content !== '__TYPING__')
      .map(m => `${m.role === 'user' ? 'You' : 'Sage'}: ${m.content}`)
      .join('\n\n');
    navigator.clipboard.writeText(text);
    setShowMenu(false);
  };

  const clearConversation = () => {
    setMessages([{ id: 'welcome-' + Date.now(), role: 'assistant', content: getDefaultWelcome(variant), timestamp: new Date() }]);
    setShowMenu(false);
  };

  const emailTranscript = () => {
    const text = messages
      .filter(m => m.content !== '__TYPING__')
      .map(m => `${m.role === 'user' ? 'You' : 'Sage'}: ${m.content}`)
      .join('\n\n');
    const subject = encodeURIComponent('Sage AI Chat Transcript');
    const body = encodeURIComponent(text);
    window.open(`mailto:?subject=${subject}&body=${body}`);
    setShowMenu(false);
  };

  const showChips = messages.filter(m => m.content !== '__TYPING__').length <= 1;
  const chips = memoryProfile
    ? getPersonalizedChips(memoryProfile, projectList, variant)
    : (variant === 'crm' ? CRM_CHIPS : MARKETING_CHIPS);

  const handleLauncherMouseEnter = () => {
    tooltipTimerRef.current = setTimeout(() => setShowTooltip(true), 1000);
  };
  const handleLauncherMouseLeave = () => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    setShowTooltip(false);
  };

  // Suppress unused variable warning for isTyping
  void isTyping;

  return (
    <>
      <style>{`
        @keyframes hexPulse {
          0%, 100% { box-shadow: 0 8px 32px rgba(212,160,23,0.4), 0 2px 8px rgba(0,0,0,0.3); }
          50% { box-shadow: 0 12px 48px rgba(212,160,23,0.6), 0 2px 8px rgba(0,0,0,0.3); }
        }
        @keyframes badgePulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.25); opacity: 0.8; }
        }
        @keyframes dotBlink {
          0%, 60%, 100% { opacity: 0.2; transform: scale(0.8); }
          30% { opacity: 1; transform: scale(1); }
        }
        @keyframes onlinePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes messageIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes panelIn {
          from { opacity: 0; transform: scale(0.85) translateY(16px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes tooltipFade {
          from { opacity: 0; transform: translateX(-50%) translateY(4px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes streakFlicker {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        .sage-scroll::-webkit-scrollbar { width: 4px; }
        .sage-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); }
        .sage-scroll::-webkit-scrollbar-thumb { background: rgba(212,160,23,0.25); border-radius: 2px; }
        .sage-msg-bubble strong { color: #D4A017; }
        .sage-msg-bubble code { background: rgba(212,160,23,0.12); color: #D4A017; padding: 1px 5px; border-radius: 4px; font-size: 12px; }
        .sage-msg-bubble ul { margin: 4px 0; padding-left: 16px; }
        .sage-msg-bubble li { margin: 2px 0; }
        .sage-msg-bubble p { margin: 0 0 8px; }
        .sage-msg-bubble p:last-child { margin: 0; }
        .sage-chip:hover { background: rgba(212,160,23,0.18) !important; transform: translateY(-1px); }
        .sage-action-card:hover { background: rgba(212,160,23,0.1) !important; border-color: rgba(212,160,23,0.5) !important; }
        .sage-send-btn:hover:not(:disabled) { transform: scale(1.08); }
        .sage-close-btn:hover { background: rgba(239,68,68,0.2) !important; color: #EF4444 !important; }
      `}</style>

      {/* LAUNCHER */}
      {!isOpen && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999 }}>
          {showTooltip && (
            <div style={{
              position: 'absolute', bottom: '100%', left: '50%',
              transform: 'translateX(-50%)', marginBottom: 10,
              background: 'rgba(0,0,0,0.88)', color: '#fff', fontSize: 11,
              padding: '7px 14px', borderRadius: 20, whiteSpace: 'nowrap',
              animation: 'tooltipFade 0.2s ease forwards', pointerEvents: 'none',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              Chat with Sage — AI Construction Expert
              <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid rgba(0,0,0,0.88)' }} />
            </div>
          )}
          {hasNewMessage && (
            <div style={{
              position: 'absolute', top: -4, right: -4, width: 18, height: 18,
              borderRadius: '50%', background: '#EF4444', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 10,
              fontWeight: 700, color: '#fff', zIndex: 1,
              animation: 'badgePulse 2s ease-in-out infinite',
              border: '2px solid #0D1520',
            }}>1</div>
          )}
          <button
            onClick={handleOpen}
            onMouseEnter={handleLauncherMouseEnter}
            onMouseLeave={handleLauncherMouseLeave}
            style={{ width: 62, height: 62, border: 'none', cursor: 'pointer', padding: 0, background: 'transparent', position: 'relative' }}
          >
            <svg width="62" height="62" viewBox="0 0 62 62"
              style={{ filter: 'drop-shadow(0 8px 24px rgba(212,160,23,0.45)) drop-shadow(0 2px 8px rgba(0,0,0,0.4))', transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.2s' }}
              onMouseEnter={e => { (e.currentTarget as SVGElement).style.transform = 'scale(1.1)'; }}
              onMouseLeave={e => { (e.currentTarget as SVGElement).style.transform = 'scale(1)'; }}
            >
              <defs>
                <linearGradient id="hexGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#E8B420" />
                  <stop offset="100%" stopColor="#9A7412" />
                </linearGradient>
              </defs>
              <polygon points="31,4 56,18 56,44 31,58 6,44 6,18" fill="url(#hexGrad)" />
              <text x="31" y="37" textAnchor="middle" fontSize="22" fill="#000">🌵</text>
            </svg>
          </button>
        </div>
      )}

      {/* CHAT PANEL */}
      {isOpen && (
        <div
          ref={panelRef}
          style={{
            position: 'fixed', bottom: 24, right: 24,
            width: 'min(420px, calc(100vw - 32px))',
            height: isMinimized ? 72 : 'min(620px, 80vh)',
            zIndex: 9998, background: '#0C1420',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 20, overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 32px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.04)',
            animation: 'panelIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
            transformOrigin: 'bottom right',
            transition: 'height 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          {/* HEADER */}
          <div
            onClick={isMinimized ? () => setIsMinimized(false) : undefined}
            style={{
              height: 72, minHeight: 72,
              background: 'linear-gradient(135deg, #131C2A 0%, #0C1420 100%)',
              borderBottom: isMinimized ? 'none' : '1px solid rgba(255,255,255,0.07)',
              padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12,
              cursor: isMinimized ? 'pointer' : 'default', flexShrink: 0,
            }}
          >
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, #D4A017, #8B6210)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, boxShadow: '0 2px 12px rgba(212,160,23,0.35)', flexShrink: 0 }}>🌵</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: '-0.2px' }}>
                Sage
                {memoryProfile?.identity.firstName && (
                  <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}> — hey {memoryProfile.identity.firstName}</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', animation: 'onlinePulse 2s ease-in-out infinite', flexShrink: 0 }} />
                AI Construction Expert · Online
                {memoryProfile && memoryProfile.engagement.currentStreak > 2 && (
                  <span style={{ marginLeft: 6, color: '#D4A017', fontSize: 10, animation: 'streakFlicker 3s ease-in-out infinite' }}>
                    🔥 {memoryProfile.engagement.currentStreak}d
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0, position: 'relative' }}>
              <button
                onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.13)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
              >⋯</button>
              {showMenu && (
                <div style={{ position: 'absolute', top: '110%', right: 0, background: '#1A2535', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, overflow: 'hidden', zIndex: 100, minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                  {[
                    { label: '🗑 Clear conversation', action: clearConversation },
                    { label: '📋 Copy transcript', action: copyTranscript },
                    { label: '✉️ Email this chat', action: emailTranscript },
                    { label: '🧠 Delete my memory', action: clearMemory },
                  ].map(item => (
                    <button key={item.label} onClick={item.action}
                      style={{ display: 'block', width: '100%', padding: '10px 14px', background: 'none', border: 'none', color: 'rgba(255,255,255,0.75)', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >{item.label}</button>
                  ))}
                </div>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
                title={isMinimized ? 'Expand' : 'Minimize'}
                style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.13)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
              >{isMinimized ? '□' : '─'}</button>
              <button
                className="sage-close-btn"
                onClick={(e) => { e.stopPropagation(); handleClose(); }}
                style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s, color 0.15s' }}
              >×</button>
            </div>
          </div>

          {/* BODY */}
          {!isMinimized && (
            <>
              {/* MESSAGES */}
              <div className="sage-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 14 }} onClick={() => setShowMenu(false)}>
                {messages.map((msg, idx) => (
                  <div key={msg.id} style={{
                    animation: idx === messages.length - 1 ? 'messageIn 0.3s ease forwards' : 'none',
                    display: 'flex', flexDirection: 'column',
                    alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 6,
                  }}>
                    {msg.role === 'user' ? (
                      <>
                        <div style={{ maxWidth: '80%', background: 'linear-gradient(135deg, #D4A017 0%, #C8960F 100%)', color: '#000', fontSize: 14, fontWeight: 500, padding: '10px 16px', borderRadius: '18px 18px 4px 18px', boxShadow: '0 2px 12px rgba(212,160,23,0.2)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {msg.content}
                        </div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', paddingRight: 4 }}>
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </>
                    ) : (
                      <div style={{ display: 'flex', gap: 10, maxWidth: '88%', alignItems: 'flex-start' }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #D4A017, #8B6210)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0, marginTop: 2 }}>🌵</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {msg.content === '__TYPING__' ? (
                            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', padding: '14px 18px', borderRadius: '4px 18px 18px 18px', display: 'flex', gap: 6, alignItems: 'center' }}>
                              {[0, 0.2, 0.4].map((delay, i) => (
                                <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#D4A017', animation: 'dotBlink 1.2s ease-in-out infinite', animationDelay: `${delay}s` }} />
                              ))}
                            </div>
                          ) : (
                            <div
                              className="sage-msg-bubble"
                              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.88)', fontSize: 14, lineHeight: 1.65, padding: '12px 16px', borderRadius: '4px 18px 18px 18px', wordBreak: 'break-word' }}
                              dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                            />
                          )}
                          {msg.quickActions && msg.quickActions.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                              {msg.quickActions.map(action => (
                                <button key={action.href} className="sage-action-card"
                                  onClick={() => { router.push(action.href); setIsOpen(false); }}
                                  style={{ background: 'rgba(212,160,23,0.05)', border: '1px solid rgba(212,160,23,0.25)', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', transition: 'all 0.15s' }}
                                >
                                  <span style={{ fontSize: 18 }}>{action.icon}</span>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#D4A017' }}>{action.label}</div>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{action.description}</div>
                                  </div>
                                  <span style={{ fontSize: 12, color: '#D4A017', opacity: 0.7 }}>→</span>
                                </button>
                              ))}
                            </div>
                          )}
                          {msg.content !== '__TYPING__' && (
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', paddingLeft: 4 }}>
                              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* CHIPS */}
              {showChips && (
                <div style={{ padding: '0 14px 12px', display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {chips.map(chip => (
                    <button key={chip} className="sage-chip" onClick={() => sendMessage(chip)}
                      style={{ background: 'rgba(212,160,23,0.07)', border: '1px solid rgba(212,160,23,0.22)', borderRadius: 20, padding: '6px 14px', fontSize: 12, color: '#D4A017', cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit' }}
                    >{chip}</button>
                  ))}
                </div>
              )}

              {/* INPUT */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '14px', background: 'rgba(0,0,0,0.15)', flexShrink: 0 }}>
                <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, display: 'flex', alignItems: 'flex-end', padding: '10px 12px', gap: 10, transition: 'border-color 0.2s, box-shadow 0.2s' }}>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={handleTextareaChange}
                    onKeyDown={handleKeyDown}
                    placeholder={variant === 'crm' ? 'Ask Sage about your projects...' : 'Ask Sage anything about construction...'}
                    rows={1}
                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 14, lineHeight: 1.5, resize: 'none', minHeight: 22, maxHeight: 120, fontFamily: 'inherit' }}
                    onFocus={e => {
                      const c = e.currentTarget.parentElement;
                      if (c) { c.style.borderColor = 'rgba(212,160,23,0.4)'; c.style.boxShadow = '0 0 0 3px rgba(212,160,23,0.08)'; }
                    }}
                    onBlur={e => {
                      const c = e.currentTarget.parentElement;
                      if (c) { c.style.borderColor = 'rgba(255,255,255,0.09)'; c.style.boxShadow = 'none'; }
                    }}
                  />
                  <button
                    className="sage-send-btn"
                    onClick={isStreaming ? stopStreaming : () => sendMessage(input)}
                    disabled={!isStreaming && !input.trim()}
                    style={{
                      width: 34, height: 34, borderRadius: '50%', border: 'none',
                      cursor: isStreaming || input.trim() ? 'pointer' : 'default',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      transition: 'all 0.15s',
                      background: isStreaming ? 'rgba(239,68,68,0.2)' : input.trim() ? 'linear-gradient(135deg, #D4A017, #C8960F)' : 'rgba(255,255,255,0.05)',
                      boxShadow: input.trim() && !isStreaming ? '0 2px 12px rgba(212,160,23,0.3)' : 'none',
                    }}
                  >
                    {isStreaming ? (
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: '#EF4444' }} />
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke={input.trim() ? '#000' : 'rgba(255,255,255,0.2)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.16)', textAlign: 'center', marginTop: 8, letterSpacing: '0.3px' }}>
                  Sage · Powered by Claude AI · Knows construction inside and out
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
