/**
 * lib/sage-intelligence-v6.ts
 * Sage AI — Full Intelligence Engine v6
 * Server-only. All Supabase calls use the service role client.
 */

import { createServerClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTED TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface SageUserProfile {
  id: string;
  user_id: string;
  tenant_id: string;
  // Identity
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  email: string | null;
  role: string | null;
  company_name: string | null;
  years_in_construction: number | null;
  primary_specialty: string | null;
  primary_markets: string[] | null;
  team_size: string | null;
  annual_volume: string | null;
  why_switched_to_saguaro: string | null;
  // Communication
  communication_style: string | null;
  language_formality: string | null;
  preferred_response_length: string | null;
  prefers_bullet_points: boolean | null;
  // Engagement metrics
  total_sessions: number | null;
  total_messages_sent: number | null;
  total_messages_received: number | null;
  current_streak_days: number | null;
  longest_streak_days: number | null;
  avg_messages_per_session: number | null;
  avg_session_duration_minutes: number | null;
  last_seen_at: string | null;
  first_seen_at: string | null;
  // Sentiment & health
  overall_sentiment: string | null;
  satisfaction_with_saguaro: number | null;
  current_stress_level: number | null;
  churn_risk: 'low' | 'medium' | 'high' | null;
  satisfaction_trend: number | null;
  days_since_last_visit: number | null;
  // Memory
  primary_pain_points: string[] | null;
  frustration_triggers: string[] | null;
  delight_triggers: string[] | null;
  open_loops: string[] | null;
  pending_follow_up: string | null;
  pending_follow_up_urgency: string | null;
  pending_follow_up_timing: string | null;
  last_topic: string | null;
  last_question_asked: string | null;
  // Sage's notes
  sage_notes: string | null;
  sage_observations: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface SageSessionSummary {
  id: string;
  user_id: string;
  tenant_id: string | null;
  session_id: string;
  one_line_summary: string | null;
  full_summary: string | null;
  topics_discussed: string[] | null;
  projects_mentioned: string[] | null;
  problems_raised: string[] | null;
  problems_resolved: string[] | null;
  questions_unanswered: string[] | null;
  pain_points_expressed: string[] | null;
  frustrations_expressed: string[] | null;
  wins_celebrated: string[] | null;
  goals_mentioned: string[] | null;
  decisions_made: string[] | null;
  follow_up_worthy: boolean | null;
  follow_up_question: string | null;
  follow_up_urgency: string | null;
  follow_up_timing: string | null;
  open_loops: string[] | null;
  name_learned: string | null;
  role_learned: string | null;
  communication_style_observed: string | null;
  session_sentiment: string | null;
  satisfaction_score: number | null;
  stress_indicators: string[] | null;
  message_count: number | null;
  created_at: string | null;
}

export interface SageConversationMessage {
  id: string;
  user_id: string;
  tenant_id: string | null;
  session_id: string;
  message_index: number;
  role: 'user' | 'assistant';
  content: string;
  // Context
  page_context: string | null;
  project_id: string | null;
  project_name: string | null;
  feature_context: string | null;
  url_path: string | null;
  // Classification
  intent: string | null;
  primary_topic: string | null;
  topic_tags: string[] | null;
  sentiment: string | null;
  sentiment_score: number | null;
  urgency_level: string | null;
  contains_math_question: boolean | null;
  contains_complaint: boolean | null;
  contains_praise: boolean | null;
  contains_personal_info: boolean | null;
  contains_project_name: boolean | null;
  contains_dollar_amount: boolean | null;
  contains_deadline: boolean | null;
  contains_risk_indicator: boolean | null;
  requires_calculation: boolean | null;
  requires_draft: boolean | null;
  // Feedback
  thumbs_up: boolean | null;
  thumbs_down: boolean | null;
  feedback_note: string | null;
  was_helpful: boolean | null;
  created_at: string | null;
}

export interface SageKnowledgeFact {
  id: string;
  category: string;
  key: string;
  value: string;
  confidence: number;
  source_type: string;
}

export interface SageProactiveInsight {
  id: string;
  insight_type: string;
  priority: number;
  urgency: string;
  title: string;
  message: string;
  detail?: string;
  action_suggestion?: string;
  related_project?: string;
  related_amount?: number;
  related_deadline?: string;
}

export interface ProjectSnapshot {
  id: string;
  name: string;
  status: string;
  contract_amount: number;
}

export interface PortfolioHealth {
  totalActiveProjects: number;
  totalContractValue: number;
  riskFlags: string[];
}

export interface SageIntelligence {
  profile: SageUserProfile | null;
  recentSessions: SageSessionSummary[];
  recentMessages: SageConversationMessage[];
  topKnowledge: SageKnowledgeFact[];
  pendingInsights: SageProactiveInsight[];
  activeProjects: ProjectSnapshot[];
  portfolioHealth: PortfolioHealth;
  engagementScore: number;
  relationshipDepth: 'new' | 'acquaintance' | 'familiar' | 'deep';
  predictedNeeds: string[];
  communicationDirective: string;
  stressLevel: number;
  churnRisk: 'low' | 'medium' | 'high';
}

export interface MessageContext {
  pageContext?: string;
  projectId?: string;
  projectName?: string;
  featureContext?: string;
  urlPath?: string;
}

export interface MessageClassification {
  intent: string;
  primaryTopic: string;
  topicTags: string[];
  sentiment: string;
  sentimentScore: number;
  urgencyLevel: string;
  containsMathQuestion: boolean;
  containsComplaint: boolean;
  containsPraise: boolean;
  containsPersonalInfo: boolean;
  containsProjectName: boolean;
  containsDollarAmount: boolean;
  containsDeadline: boolean;
  containsRiskIndicator: boolean;
  requiresCalculation: boolean;
  requiresDraft: boolean;
}

export interface NewFact {
  category: string;
  key: string;
  value: string;
  confidence: number;
}

export interface SessionSummaryResult {
  one_line_summary: string;
  full_summary: string;
  topics_discussed: string[];
  projects_mentioned: string[];
  problems_raised: string[];
  problems_resolved: string[];
  questions_unanswered: string[];
  pain_points_expressed: string[];
  frustrations_expressed: string[];
  wins_celebrated: string[];
  goals_mentioned: string[];
  decisions_made: string[];
  follow_up_worthy: boolean;
  follow_up_question: string;
  follow_up_urgency: string;
  follow_up_timing: string;
  open_loops: string[];
  name_learned: string;
  role_learned: string;
  communication_style_observed: string;
  new_facts: NewFact[];
  session_sentiment: string;
  satisfaction_score: number;
  stress_indicators: string[];
  proactive_insights_to_generate: {
    type: string;
    priority: number;
    title: string;
    message: string;
    action: string;
  }[];
}

export interface CommunicationStyleAnalysis {
  formality_score: number;
  avg_message_length: number;
  uses_slang: boolean;
  uses_abbreviations: boolean;
  response_speed_preference: string;
  vocabulary_level: string;
  humor_level: number;
  directness_level: number;
  preferred_format: string;
  sentence_structure: string;
}

export interface SuggestionChip {
  label: string;
  prompt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 1: loadFullIntelligence
// ─────────────────────────────────────────────────────────────────────────────

export async function loadFullIntelligence(
  userId: string,
  tenantId: string
): Promise<SageIntelligence> {
  const supabase = createServerClient();

  // Run all queries in parallel
  const [
    profileResult,
    sessionsResult,
    messagesResult,
    knowledgeResult,
    insightsResult,
    projectsResult,
  ] = await Promise.all([
    supabase
      .from('sage_user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single(),
    supabase
      .from('sage_session_summaries')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('sage_conversations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(40),
    supabase
      .from('sage_knowledge_base')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('confidence', { ascending: false })
      .limit(30),
    supabase
      .from('sage_proactive_insights')
      .select('*')
      .eq('user_id', userId)
      .eq('delivered', false)
      .eq('dismissed', false)
      .order('priority', { ascending: false }),
    supabase
      .from('projects')
      .select('id, name, status, contract_amount')
      .eq('tenant_id', tenantId)
      .in('status', ['active', 'in_progress', 'bidding'])
      .limit(20),
  ]);

  const profile = (profileResult.data as SageUserProfile | null) ?? null;
  const recentSessions = (sessionsResult.data as SageSessionSummary[]) ?? [];
  const recentMessages = (messagesResult.data as SageConversationMessage[]) ?? [];
  const topKnowledge = (knowledgeResult.data as SageKnowledgeFact[]) ?? [];
  const pendingInsights = (insightsResult.data as SageProactiveInsight[]) ?? [];
  const activeProjects: ProjectSnapshot[] = (projectsResult.data ?? []).map(
    (p: { id: string; name: string; status: string; contract_amount: number }) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      contract_amount: p.contract_amount ?? 0,
    })
  );

  // ── Engagement Score (0-100) ──────────────────────────────────────────────
  const totalSessions = profile?.total_sessions ?? 0;
  const streakDays = profile?.current_streak_days ?? 0;
  const avgMsgsPerSession = profile?.avg_messages_per_session ?? 0;

  const sessionScore = Math.min(totalSessions / 50, 1) * 40;
  const streakScore = Math.min(streakDays / 30, 1) * 30;
  const activityScore = Math.min(avgMsgsPerSession / 20, 1) * 30;
  const engagementScore = Math.round(sessionScore + streakScore + activityScore);

  // ── Relationship Depth ────────────────────────────────────────────────────
  let relationshipDepth: SageIntelligence['relationshipDepth'];
  if (totalSessions < 3) relationshipDepth = 'new';
  else if (totalSessions <= 10) relationshipDepth = 'acquaintance';
  else if (totalSessions <= 30) relationshipDepth = 'familiar';
  else relationshipDepth = 'deep';

  // ── Predicted Needs ───────────────────────────────────────────────────────
  const predictedNeeds = predictNextNeedsFromData(
    profile,
    recentSessions,
    pendingInsights,
    activeProjects
  );

  // ── Communication Directive ───────────────────────────────────────────────
  const communicationDirective = buildCommunicationDirective(profile);

  // ── Stress Level (1-10) ───────────────────────────────────────────────────
  let stressLevel = profile?.current_stress_level ?? 3;
  if (stressLevel < 1) stressLevel = 1;
  if (stressLevel > 10) stressLevel = 10;
  // Infer from recent sessions if not set
  if (!profile?.current_stress_level && recentSessions.length > 0) {
    const recentStressIndicators = recentSessions
      .slice(0, 5)
      .flatMap((s) => s.stress_indicators ?? []);
    if (recentStressIndicators.length >= 5) stressLevel = 8;
    else if (recentStressIndicators.length >= 3) stressLevel = 6;
    else if (recentStressIndicators.length >= 1) stressLevel = 4;
    else stressLevel = 2;
  }

  // ── Churn Risk ────────────────────────────────────────────────────────────
  let churnRisk: SageIntelligence['churnRisk'] = profile?.churn_risk ?? 'low';
  if (!profile?.churn_risk) {
    const daysSince = profile?.days_since_last_visit ?? 0;
    const satisfaction = profile?.satisfaction_with_saguaro ?? 7;
    if (satisfaction < 4 || daysSince > 30) churnRisk = 'high';
    else if (satisfaction < 6 || daysSince > 14) churnRisk = 'medium';
    else churnRisk = 'low';
  }

  // ── Portfolio Health ──────────────────────────────────────────────────────
  const totalContractValue = activeProjects.reduce(
    (sum, p) => sum + (p.contract_amount ?? 0),
    0
  );
  const riskFlags: string[] = [];
  if (activeProjects.length > 10) riskFlags.push('High project volume — capacity risk');
  if (totalContractValue > 10_000_000) riskFlags.push('Large portfolio — cash flow management critical');
  const biddingProjects = activeProjects.filter((p) => p.status === 'bidding');
  if (biddingProjects.length > 3) riskFlags.push(`${biddingProjects.length} bids in progress`);

  const portfolioHealth: PortfolioHealth = {
    totalActiveProjects: activeProjects.length,
    totalContractValue,
    riskFlags,
  };

  return {
    profile,
    recentSessions,
    recentMessages,
    topKnowledge,
    pendingInsights,
    activeProjects,
    portfolioHealth,
    engagementScore,
    relationshipDepth,
    predictedNeeds,
    communicationDirective,
    stressLevel,
    churnRisk,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 2: buildUltraMemoryBlock
// ─────────────────────────────────────────────────────────────────────────────

export function buildUltraMemoryBlock(intelligence: SageIntelligence): string {
  const { profile, recentSessions, activeProjects, pendingInsights, portfolioHealth } =
    intelligence;

  const lines: string[] = [];
  const sep = '═══════════════════════════════════════════════════════════';

  const u = (val: string | null | undefined, fallback = 'Not yet known') =>
    val?.trim() || fallback;

  // ── SECTION 1: WHO THIS PERSON IS ─────────────────────────────────────────
  lines.push(`${sep}`);
  lines.push(`═══ 1. WHO THIS PERSON IS ═══`);
  lines.push(`${sep}`);
  lines.push(`Name:           ${u(profile?.preferred_name ?? profile?.first_name)}`);
  lines.push(`Role:           ${u(profile?.role)}`);
  lines.push(`Company:        ${u(profile?.company_name)}`);
  lines.push(`Years in field: ${profile?.years_in_construction ?? 'Unknown'}`);
  lines.push(
    `Markets:        ${profile?.primary_markets?.join(', ') ?? 'Not yet known'}`
  );
  lines.push(`Specialty:      ${u(profile?.primary_specialty)}`);
  lines.push(`Team size:      ${u(profile?.team_size)}`);
  lines.push(`Annual volume:  ${u(profile?.annual_volume)}`);
  lines.push(`Why Saguaro:    ${u(profile?.why_switched_to_saguaro)}`);

  // ── SECTION 2: THEIR BUSINESS RIGHT NOW ───────────────────────────────────
  lines.push('');
  lines.push(`${sep}`);
  lines.push(`═══ 2. THEIR BUSINESS RIGHT NOW ═══`);
  lines.push(`${sep}`);
  lines.push(
    `Active projects: ${portfolioHealth.totalActiveProjects} | Total value: $${portfolioHealth.totalContractValue.toLocaleString()}`
  );
  for (const p of activeProjects.slice(0, 10)) {
    lines.push(
      `  • ${p.name} [${p.status}] — $${(p.contract_amount ?? 0).toLocaleString()}`
    );
  }
  if (activeProjects.length === 0) lines.push('  No active projects loaded.');
  lines.push(`Risk flags:`);
  for (const flag of portfolioHealth.riskFlags) {
    lines.push(`  ⚑ ${flag}`);
  }
  if (portfolioHealth.riskFlags.length === 0) lines.push('  No risk flags detected.');

  const openLoops = profile?.open_loops ?? [];
  lines.push(`Current challenges / open loops:`);
  for (const loop of openLoops.slice(0, 5)) {
    lines.push(`  → ${loop}`);
  }
  if (openLoops.length === 0) lines.push('  None on file.');

  // ── SECTION 3: COMMUNICATION DNA ──────────────────────────────────────────
  lines.push('');
  lines.push(`${sep}`);
  lines.push(`═══ 3. COMMUNICATION DNA ═══`);
  lines.push(`${sep}`);
  lines.push(`Directive: ${intelligence.communicationDirective}`);
  lines.push(`Style on file: ${u(profile?.communication_style)}`);
  lines.push(`Formality: ${u(profile?.language_formality)}`);
  lines.push(
    `Response length preference: ${u(profile?.preferred_response_length, 'adaptive')}`
  );
  lines.push(
    `Prefers bullets: ${profile?.prefers_bullet_points != null ? profile.prefers_bullet_points : 'Unknown'}`
  );
  lines.push(`Relationship depth: ${intelligence.relationshipDepth}`);
  lines.push(`Engagement score: ${intelligence.engagementScore}/100`);

  // ── SECTION 4: RELATIONSHIP HISTORY ───────────────────────────────────────
  lines.push('');
  lines.push(`${sep}`);
  lines.push(`═══ 4. RELATIONSHIP HISTORY ═══`);
  lines.push(`${sep}`);
  lines.push(`Total sessions:    ${profile?.total_sessions ?? 0}`);
  lines.push(`First seen:        ${u(profile?.first_seen_at)}`);
  lines.push(`Last seen:         ${u(profile?.last_seen_at)}`);
  lines.push(`Current streak:    ${profile?.current_streak_days ?? 0} days`);
  lines.push(`Relationship depth: ${intelligence.relationshipDepth}`);
  lines.push(`Last 5 session summaries:`);
  for (const session of recentSessions.slice(0, 5)) {
    const date = session.created_at
      ? new Date(session.created_at).toLocaleDateString()
      : 'Unknown date';
    lines.push(`  [${date}] ${session.one_line_summary ?? 'No summary'}`);
  }
  if (recentSessions.length === 0) lines.push('  No sessions on file yet.');

  // ── SECTION 5: OPEN LOOPS ─────────────────────────────────────────────────
  lines.push('');
  lines.push(`${sep}`);
  lines.push(`═══ 5. OPEN LOOPS ═══`);
  lines.push(`${sep}`);
  if (profile?.pending_follow_up) {
    lines.push(
      `PENDING FOLLOW-UP [${u(profile.pending_follow_up_urgency, 'normal')}]: ${profile.pending_follow_up}`
    );
    lines.push(`  Timing: ${u(profile.pending_follow_up_timing, 'next session')}`);
  }
  const sessionOpenLoops = recentSessions
    .flatMap((s) => s.open_loops ?? [])
    .filter(Boolean);
  const uniqueOpenLoops = [...new Set([...openLoops, ...sessionOpenLoops])];
  for (const loop of uniqueOpenLoops.slice(0, 8)) {
    lines.push(`  • ${loop}`);
  }
  if (uniqueOpenLoops.length === 0 && !profile?.pending_follow_up) {
    lines.push('  No open loops on file.');
  }

  // ── SECTION 6: WHAT THEY CARE ABOUT MOST ──────────────────────────────────
  lines.push('');
  lines.push(`${sep}`);
  lines.push(`═══ 6. WHAT THEY CARE ABOUT MOST ═══`);
  lines.push(`${sep}`);
  lines.push(
    `Primary pain points: ${(profile?.primary_pain_points ?? []).join(', ') || 'Not yet known'}`
  );
  lines.push(
    `Frustration triggers: ${(profile?.frustration_triggers ?? []).join(', ') || 'Not yet known'}`
  );
  lines.push(
    `Delight triggers: ${(profile?.delight_triggers ?? []).join(', ') || 'Not yet known'}`
  );
  lines.push(`Stress level: ${intelligence.stressLevel}/10`);
  lines.push(`Churn risk: ${intelligence.churnRisk}`);
  lines.push(
    `Satisfaction: ${profile?.satisfaction_with_saguaro ?? 'Unknown'}/10`
  );

  // ── SECTION 7: FOLLOW-UP QUESTIONS TO DELIVER ─────────────────────────────
  lines.push('');
  lines.push(`${sep}`);
  lines.push(`═══ 7. FOLLOW-UP QUESTIONS TO DELIVER ═══`);
  lines.push(`${sep}`);
  lines.push(`RULE: Deliver ONE follow-up per response, highest urgency first.`);
  const followUps = recentSessions
    .filter((s) => s.follow_up_worthy && s.follow_up_question)
    .sort((a, b) => {
      const urgencyOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return (
        (urgencyOrder[a.follow_up_urgency ?? 'low'] ?? 2) -
        (urgencyOrder[b.follow_up_urgency ?? 'low'] ?? 2)
      );
    });
  for (const fu of followUps.slice(0, 5)) {
    lines.push(
      `  [${u(fu.follow_up_urgency, 'normal')}] ${fu.follow_up_question} (timing: ${u(fu.follow_up_timing, 'next session')})`
    );
  }
  if (followUps.length === 0) lines.push('  No pending follow-up questions.');

  // ── SECTION 8: PROACTIVE INSIGHTS QUEUED ─────────────────────────────────
  lines.push('');
  lines.push(`${sep}`);
  lines.push(`═══ 8. PROACTIVE INSIGHTS QUEUED ═══`);
  lines.push(`${sep}`);
  for (const insight of pendingInsights.slice(0, 5)) {
    lines.push(
      `  [P${insight.priority}][${insight.urgency}] ${insight.title}: ${insight.message}`
    );
    if (insight.action_suggestion) {
      lines.push(`    Action: ${insight.action_suggestion}`);
    }
  }
  if (pendingInsights.length === 0) lines.push('  No pending insights.');

  // ── SECTION 9: SAGE'S PRIVATE NOTES ──────────────────────────────────────
  lines.push('');
  lines.push(`${sep}`);
  lines.push(`═══ 9. SAGE'S PRIVATE NOTES ═══`);
  lines.push(`${sep}`);
  if (profile?.sage_notes) {
    lines.push(`NOTES: ${profile.sage_notes}`);
  } else {
    lines.push(`NOTES: None yet.`);
  }
  if (profile?.sage_observations) {
    lines.push(`OBSERVATIONS: ${profile.sage_observations}`);
  } else {
    lines.push(`OBSERVATIONS: None yet.`);
  }

  // ── SECTION 10: HOW TO ENGAGE RIGHT NOW ───────────────────────────────────
  lines.push('');
  lines.push(`${sep}`);
  lines.push(`═══ 10. HOW TO ENGAGE RIGHT NOW ═══`);
  lines.push(`${sep}`);
  const name = profile?.preferred_name ?? profile?.first_name ?? 'this person';
  const depthNote =
    intelligence.relationshipDepth === 'new'
      ? 'This is a new relationship — be warm and welcoming, make them feel heard.'
      : intelligence.relationshipDepth === 'deep'
      ? 'Deep relationship — be direct, skip pleasantries, reference history naturally.'
      : 'Developing relationship — balance familiarity with professionalism.';
  const stressNote =
    intelligence.stressLevel >= 7
      ? 'They appear stressed — be empathetic, concise, action-oriented.'
      : intelligence.stressLevel <= 3
      ? 'They are calm — you can be thorough.'
      : 'Moderate stress — balance thoroughness with brevity.';
  const churnNote =
    intelligence.churnRisk === 'high'
      ? 'CHURN RISK HIGH — be extra helpful, surface value, make them feel seen.'
      : '';

  lines.push(
    `Engage ${name} with: ${intelligence.communicationDirective}. ${depthNote} ${stressNote} ${churnNote}`.trim()
  );
  if (pendingInsights.length > 0) {
    lines.push(
      `Top priority insight to weave in: [${pendingInsights[0].title}] ${pendingInsights[0].message}`
    );
  }
  if (uniqueOpenLoops.length > 0) {
    lines.push(`Top open loop to address: ${uniqueOpenLoops[0]}`);
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 3: detectCommunicationStyle + detectAndSaveStyle
// ─────────────────────────────────────────────────────────────────────────────

export function detectCommunicationStyle(
  messages: string[]
): CommunicationStyleAnalysis {
  if (messages.length === 0) {
    return {
      formality_score: 5,
      avg_message_length: 0,
      uses_slang: false,
      uses_abbreviations: false,
      response_speed_preference: 'normal',
      vocabulary_level: 'intermediate',
      humor_level: 3,
      directness_level: 5,
      preferred_format: 'prose',
      sentence_structure: 'mixed',
    };
  }

  const totalChars = messages.reduce((sum, m) => sum + m.length, 0);
  const avgMessageLength = Math.round(totalChars / messages.length);

  const slangWords = [
    'gonna', 'wanna', 'gotta', 'ya', 'nah', 'yep', 'nope', 'lemme', 'kinda',
    'sorta', 'lol', 'lmao', 'bruh', 'bro', 'yo', 'tbh', 'imo', 'rn', 'fyi',
    'idk', 'omg', 'wtf', 'fr', 'ngl', 'asap', 'dude', 'legit',
  ];
  const allText = messages.join(' ').toLowerCase();
  const slangCount = slangWords.filter((w) =>
    new RegExp(`\\b${w}\\b`).test(allText)
  ).length;
  const uses_slang = slangCount >= 2;

  const constructionAbbrevs = [
    'RFI', 'CO', 'GC', 'PM', 'SOV', 'PCO', 'NOP', 'NOC', 'COI', 'AIA',
    'G702', 'G703', 'WH-347', 'CSI', 'OCIP', 'CCIP', 'NTO', 'NOI', 'SUB',
  ];
  const abbrevPattern = new RegExp(
    `\\b(${constructionAbbrevs.join('|')})\\b`
  );
  const abbrevCount = (messages.join(' ').match(abbrevPattern) ?? []).length;
  const uses_abbreviations = abbrevCount >= 3;

  const bulletLines = messages.filter((m) => /^[\s]*[•\-\*\d+\.]/m.test(m)).length;
  const preferred_format =
    bulletLines > messages.length * 0.3 ? 'bullets' : 'prose';

  const avgWordCount = messages.map((m) => m.split(/\s+/).length);
  const meanWords =
    avgWordCount.reduce((a, b) => a + b, 0) / avgWordCount.length;
  const avgSentenceLength = meanWords;

  const humorPhrases = [
    /lol/i, /lmao/i, /haha/i, /😂/, /🤣/, /jk\b/i, /kidding/i, /just kidding/i,
  ];
  const humorMatches = humorPhrases.filter((p) =>
    messages.some((m) => p.test(m))
  ).length;
  const humor_level = Math.min(10, Math.round((humorMatches / humorPhrases.length) * 10));

  // Formality: start at 5, adjust
  let formality_score = 5;
  if (uses_slang) formality_score -= 2;
  if (uses_abbreviations) formality_score -= 1;
  if (humor_level > 4) formality_score -= 1;
  const formalIndicators = [
    /please\b/i, /thank you\b/i, /sincerely\b/i, /regarding\b/i,
    /pursuant\b/i, /enclosed\b/i,
  ];
  const formalCount = formalIndicators.filter((p) =>
    messages.some((m) => p.test(m))
  ).length;
  formality_score += formalCount;
  formality_score = Math.max(1, Math.min(10, formality_score));

  // Directness: commands and short requests score higher
  const commandPattern = /^(get|show|give|tell|make|run|check|find|create|generate|send|write|calculate|fix|help)\b/i;
  const commandMessages = messages.filter((m) => commandPattern.test(m.trim())).length;
  const questionMessages = messages.filter((m) => m.trim().endsWith('?')).length;
  let directness_level = 5;
  if (commandMessages > messages.length * 0.4) directness_level = 8;
  else if (commandMessages > messages.length * 0.2) directness_level = 6;
  if (questionMessages > messages.length * 0.5) directness_level = Math.max(3, directness_level - 1);
  directness_level = Math.max(1, Math.min(10, directness_level));

  // Vocabulary level
  const expertTerms = [
    /\b(CSI|AIA|G702|G703|Davis-Bacon|prevailing wage|lien waiver|retainage|PCO|OCIP|CCIP|MasterFormat|constructive change|substantial completion)\b/i,
  ];
  const expertMatches = messages.filter((m) => expertTerms[0].test(m)).length;
  let vocabulary_level = 'intermediate';
  if (expertMatches > messages.length * 0.3) vocabulary_level = 'expert';
  else if (uses_slang && !uses_abbreviations) vocabulary_level = 'basic';

  // Sentence structure
  const fragmentMessages = messages.filter(
    (m) => m.split(/\s+/).length < 8 && !/[.!?]$/.test(m.trim())
  ).length;
  let sentence_structure = 'mixed';
  if (fragmentMessages > messages.length * 0.5) sentence_structure = 'fragments';
  else if (avgSentenceLength > 20) sentence_structure = 'complete';

  // Response speed preference
  const urgencyWords = /\b(asap|urgent|now|today|right now|immediately)\b/i;
  const urgentMessages = messages.filter((m) => urgencyWords.test(m)).length;
  const response_speed_preference =
    urgentMessages > messages.length * 0.2 ? 'fast' : 'normal';

  return {
    formality_score,
    avg_message_length: avgMessageLength,
    uses_slang,
    uses_abbreviations,
    response_speed_preference,
    vocabulary_level,
    humor_level,
    directness_level,
    preferred_format,
    sentence_structure,
  };
}

export async function detectAndSaveStyle(
  userId: string,
  messages: string[]
): Promise<CommunicationStyleAnalysis> {
  const analysis = detectCommunicationStyle(messages);

  try {
    const supabase = createServerClient();

    const formalityLabel =
      analysis.formality_score <= 3
        ? 'casual'
        : analysis.formality_score <= 6
        ? 'semi-formal'
        : 'formal';

    await supabase
      .from('sage_user_profiles')
      .update({
        communication_style: `${formalityLabel}, ${analysis.preferred_format}, directness:${analysis.directness_level}/10`,
        language_formality: formalityLabel,
        prefers_bullet_points: analysis.preferred_format === 'bullets',
        preferred_response_length:
          analysis.avg_message_length < 80
            ? 'short'
            : analysis.avg_message_length < 200
            ? 'medium'
            : 'detailed',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
  } catch {
    // Non-fatal — return analysis regardless
  }

  return analysis;
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 4: classifyMessage
// ─────────────────────────────────────────────────────────────────────────────

export function classifyMessage(content: string): MessageClassification {
  const lower = content.toLowerCase();

  // ── Intent ────────────────────────────────────────────────────────────────
  let intent = 'statement';
  if (/^(what|who|when|where|why|how|which|can you|could you|would you|is there|are there|do you|does)/i.test(content.trim())) {
    intent = 'question';
  } else if (/^(help|show|get|give|find|create|generate|write|draft|run|calculate|make|send|check|fix|update|delete|remove|add)/i.test(content.trim())) {
    intent = 'command';
  } else if (/\b(broken|doesn't work|not working|issue|problem|bug|error|wrong|failed|can't|cannot)\b/i.test(lower)) {
    intent = 'complaint';
  } else if (/\b(great|awesome|perfect|love|excellent|amazing|fantastic|thank you|thanks|appreciate|wonderful)\b/i.test(lower)) {
    intent = 'praise';
  } else if (content.trim().endsWith('?')) {
    intent = 'question';
  }

  // ── Topic detection ───────────────────────────────────────────────────────
  const topicMap: Array<[string, string[]]> = [
    ['lien', ['lien', 'preliminary notice', 'prelim', 'nop', 'noi', 'lien waiver', 'mechanics lien']],
    ['change_order', ['change order', 'co ', ' co,', 'pco', 'change directive', 'scope change']],
    ['pay_app', ['pay app', 'pay application', 'g702', 'g703', 'billing', 'draw', 'payment application']],
    ['rfi', ['rfi', 'request for information']],
    ['submittal', ['submittal', 'submittals', 'shop drawing']],
    ['takeoff', ['takeoff', 'take-off', 'take off', 'blueprint', 'quantity', 'material list']],
    ['certified_payroll', ['certified payroll', 'wh-347', 'davis-bacon', 'prevailing wage', 'dol']],
    ['bid', ['bid', 'estimate', 'proposal', 'quote', 'bidding']],
    ['insurance', ['insurance', 'coi', 'acord', 'certificate of insurance', 'liability']],
    ['punch_list', ['punch list', 'punch item', 'closeout', 'substantial completion']],
    ['schedule', ['schedule', 'delay', 'deadline', 'milestone', 'gantt']],
    ['subcontractor', ['sub ', 'subcontractor', 'subs ', 'subie', 'vendor']],
    ['retainage', ['retainage', 'retention']],
    ['safety', ['safety', 'osha', 'incident', 'injury', 'hazard']],
    ['permit', ['permit', 'inspection', 'building department', 'code']],
    ['general', []],
  ];

  let primaryTopic = 'general';
  for (const [topic, keywords] of topicMap) {
    if (keywords.some((kw) => lower.includes(kw))) {
      primaryTopic = topic;
      break;
    }
  }

  const topicTags: string[] = [];
  for (const [topic, keywords] of topicMap) {
    if (topic !== 'general' && keywords.some((kw) => lower.includes(kw))) {
      topicTags.push(topic);
    }
  }

  // ── Sentiment ─────────────────────────────────────────────────────────────
  const positiveWords = [
    'great', 'awesome', 'perfect', 'love', 'excellent', 'amazing', 'fantastic',
    'thank you', 'thanks', 'appreciate', 'wonderful', 'helpful', 'works', 'solved',
  ];
  const negativeWords = [
    'broken', 'wrong', 'bad', 'terrible', 'awful', 'hate', 'frustrated', 'annoying',
    'issue', 'problem', 'bug', 'error', 'failed', 'missing', 'not working', 'slow',
  ];
  const frustrationPhrases = [
    'why is this', 'why does it', 'why cant', "why can't", 'why wont', "why won't",
    'still not', 'always', 'every time', 'once again', 'again', 'still broken',
  ];

  const posScore = positiveWords.filter((w) => lower.includes(w)).length;
  const negScore = negativeWords.filter((w) => lower.includes(w)).length;
  const frustScore = frustrationPhrases.filter((p) => lower.includes(p)).length;

  let sentiment = 'neutral';
  let sentimentScore = 0;
  if (frustScore > 0) {
    sentiment = 'frustrated';
    sentimentScore = -(negScore + frustScore * 2);
  } else if (negScore > posScore) {
    sentiment = 'negative';
    sentimentScore = -negScore;
  } else if (posScore > negScore) {
    sentiment = 'positive';
    sentimentScore = posScore;
  }
  sentimentScore = Math.max(-10, Math.min(10, sentimentScore));

  // ── Urgency ───────────────────────────────────────────────────────────────
  let urgencyLevel = 'normal';
  if (/\b(urgent|asap|right now|immediately|today|emergency|critical|now|deadline|due today|overdue)\b/i.test(lower)) {
    urgencyLevel = 'high';
  } else if (/\b(soon|this week|whenever|eventually|sometime|no rush|low priority|when you can)\b/i.test(lower)) {
    urgencyLevel = 'low';
  }

  // ── Content flags ─────────────────────────────────────────────────────────
  const containsDollarAmount = /\$[\d,]+|\d+[\s]*(dollars|k\b|million|M\b)/i.test(content);
  const containsDeadline =
    /\b(deadline|due date|by\s+\w+day|by\s+\w+\s+\d+|expires|expiration|end of\s+(week|month|quarter|year))\b/i.test(
      lower
    ) || /\d{1,2}\/\d{1,2}(\/\d{2,4})?/.test(content);
  const containsRiskIndicator = /\b(lien|default|dispute|claim|lawsuit|attorney|legal|violation|non-compliance|penalty|fine|overdue|past due)\b/i.test(lower);
  const containsPersonalInfo =
    /\b(my name is|i am|i'm|we are|our company|our team|i work)\b/i.test(lower);
  const containsProjectName = /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(content) ||
    /\b(project|job|site)\s+[A-Z0-9\-#]+/i.test(content);
  const containsComplaint = intent === 'complaint' || frustScore > 0;
  const containsPraise = intent === 'praise' || posScore >= 2;
  const requiresCalculation =
    /[+\-*\/=]|how much|calculate|what is .+ percent|what.*total|what.*cost|add up|compute|figure out\s+\w+\s*(cost|price|amount|total|value)/i.test(
      lower
    );
  const requiresDraft =
    /\b(write|draft|compose|create a letter|send a|template for|help me write|generate a|make a letter|email template)\b/i.test(
      lower
    );
  const containsMathQuestion =
    requiresCalculation ||
    /\b(how much|what percent|what is the total|calculate|multiply|divide|subtract|add)\b/i.test(lower);

  return {
    intent,
    primaryTopic,
    topicTags,
    sentiment,
    sentimentScore,
    urgencyLevel,
    containsMathQuestion,
    containsComplaint,
    containsPraise,
    containsPersonalInfo,
    containsProjectName,
    containsDollarAmount,
    containsDeadline,
    containsRiskIndicator,
    requiresCalculation,
    requiresDraft,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 5: saveMessageWithIntelligence
// ─────────────────────────────────────────────────────────────────────────────

export async function saveMessageWithIntelligence(
  userId: string,
  tenantId: string,
  sessionId: string,
  messageIndex: number,
  role: 'user' | 'assistant',
  content: string,
  context: MessageContext
): Promise<string> {
  const supabase = createServerClient();

  const classification = role === 'user' ? classifyMessage(content) : null;

  const insertData: Record<string, unknown> = {
    user_id: userId,
    tenant_id: tenantId,
    session_id: sessionId,
    message_index: messageIndex,
    role,
    content,
    page_context: context.pageContext ?? null,
    project_id: context.projectId ?? null,
    project_name: context.projectName ?? null,
    feature_context: context.featureContext ?? null,
    url_path: context.urlPath ?? null,
    created_at: new Date().toISOString(),
  };

  if (classification) {
    insertData.intent = classification.intent;
    insertData.primary_topic = classification.primaryTopic;
    insertData.topic_tags = classification.topicTags;
    insertData.sentiment = classification.sentiment;
    insertData.sentiment_score = classification.sentimentScore;
    insertData.urgency_level = classification.urgencyLevel;
    insertData.contains_math_question = classification.containsMathQuestion;
    insertData.contains_complaint = classification.containsComplaint;
    insertData.contains_praise = classification.containsPraise;
    insertData.contains_personal_info = classification.containsPersonalInfo;
    insertData.contains_project_name = classification.containsProjectName;
    insertData.contains_dollar_amount = classification.containsDollarAmount;
    insertData.contains_deadline = classification.containsDeadline;
    insertData.contains_risk_indicator = classification.containsRiskIndicator;
    insertData.requires_calculation = classification.requiresCalculation;
    insertData.requires_draft = classification.requiresDraft;
  }

  const { data, error } = await supabase
    .from('sage_conversations')
    .insert(insertData)
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to save message: ${error?.message ?? 'Unknown error'}`);
  }

  // Update profile stats asynchronously (best effort)
  try {
    if (role === 'user') {
      const profileUpdates: Record<string, unknown> = {
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (classification?.intent === 'question') {
        profileUpdates.last_question_asked = content.slice(0, 500);
      }
      if (classification?.primaryTopic && classification.primaryTopic !== 'general') {
        profileUpdates.last_topic = classification.primaryTopic;
      }
      // Increment total_messages_sent using rpc or raw update
      await supabase.rpc('increment_sage_profile_counter', {
        p_user_id: userId,
        p_column: 'total_messages_sent',
        p_extra: profileUpdates,
      }).then(async (rpcResult) => {
        // Fallback if rpc doesn't exist
        if (rpcResult.error) {
          const { data: existing } = await supabase
            .from('sage_user_profiles')
            .select('total_messages_sent')
            .eq('user_id', userId)
            .single();
          await supabase
            .from('sage_user_profiles')
            .update({
              ...profileUpdates,
              total_messages_sent: ((existing as { total_messages_sent: number } | null)?.total_messages_sent ?? 0) + 1,
            })
            .eq('user_id', userId);
        }
      });
    } else {
      // assistant message — increment received counter
      await supabase.rpc('increment_sage_profile_counter', {
        p_user_id: userId,
        p_column: 'total_messages_received',
        p_extra: {},
      }).then(async (rpcResult) => {
        if (rpcResult.error) {
          const { data: existing } = await supabase
            .from('sage_user_profiles')
            .select('total_messages_received')
            .eq('user_id', userId)
            .single();
          await supabase
            .from('sage_user_profiles')
            .update({
              total_messages_received:
                ((existing as { total_messages_received: number } | null)?.total_messages_received ?? 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId);
        }
      });
    }
  } catch {
    // Non-fatal
  }

  return (data as { id: string }).id;
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 6: generateSessionSummary
// ─────────────────────────────────────────────────────────────────────────────

export async function generateSessionSummary(
  userId: string,
  tenantId: string,
  sessionId: string,
  messages: Array<{ role: string; content: string }>
): Promise<SessionSummaryResult> {
  const anthropic = new Anthropic();
  const supabase = createServerClient();

  const transcript = messages
    .map((m, i) => `[${i + 1}] ${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  const schema = `{
  "one_line_summary": "string — one sentence summary",
  "full_summary": "string — 3-5 sentence summary",
  "topics_discussed": ["array of topic strings"],
  "projects_mentioned": ["array of project names"],
  "problems_raised": ["array of problems mentioned"],
  "problems_resolved": ["array of problems that were resolved"],
  "questions_unanswered": ["array of questions that were not answered"],
  "pain_points_expressed": ["array of pain points expressed by user"],
  "frustrations_expressed": ["array of frustrations"],
  "wins_celebrated": ["array of wins or successes mentioned"],
  "goals_mentioned": ["array of goals the user mentioned"],
  "decisions_made": ["array of decisions reached"],
  "follow_up_worthy": true/false,
  "follow_up_question": "string — best follow-up question to ask",
  "follow_up_urgency": "high|medium|low",
  "follow_up_timing": "string — e.g. 'next session', 'within 3 days'",
  "open_loops": ["array of unresolved items"],
  "name_learned": "string or empty",
  "role_learned": "string or empty",
  "communication_style_observed": "string describing their communication style",
  "new_facts": [{"category": "string", "key": "string", "value": "string", "confidence": 0.0-1.0}],
  "session_sentiment": "positive|neutral|negative|frustrated|mixed",
  "satisfaction_score": 1-10,
  "stress_indicators": ["array of stress indicator phrases"],
  "proactive_insights_to_generate": [{"type": "string", "priority": 1-10, "title": "string", "message": "string", "action": "string"}]
}`;

  const systemPrompt =
    'You are a construction AI analyst. Analyze this conversation and return a JSON object with the exact structure provided. Be specific and extract real content — names, project names, dollar amounts, specific problems — not generic summaries. Return only valid JSON, no markdown.';

  const userPrompt = `Analyze this conversation and return a JSON object matching this schema exactly:\n\n${schema}\n\nCONVERSATION TRANSCRIPT:\n${transcript}`;

  let summaryResult: SessionSummaryResult;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const rawText =
      response.content[0]?.type === 'text' ? response.content[0].text : '';

    // Strip markdown code blocks if present
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    summaryResult = JSON.parse(cleaned) as SessionSummaryResult;
  } catch {
    // Fallback summary if AI call fails
    summaryResult = {
      one_line_summary: `Session with ${messages.length} messages`,
      full_summary: `User had a ${messages.length}-message conversation covering various construction topics.`,
      topics_discussed: [],
      projects_mentioned: [],
      problems_raised: [],
      problems_resolved: [],
      questions_unanswered: [],
      pain_points_expressed: [],
      frustrations_expressed: [],
      wins_celebrated: [],
      goals_mentioned: [],
      decisions_made: [],
      follow_up_worthy: false,
      follow_up_question: '',
      follow_up_urgency: 'low',
      follow_up_timing: 'next session',
      open_loops: [],
      name_learned: '',
      role_learned: '',
      communication_style_observed: '',
      new_facts: [],
      session_sentiment: 'neutral',
      satisfaction_score: 5,
      stress_indicators: [],
      proactive_insights_to_generate: [],
    };
  }

  // Insert into sage_session_summaries
  try {
    await supabase.from('sage_session_summaries').insert({
      user_id: userId,
      tenant_id: tenantId,
      session_id: sessionId,
      one_line_summary: summaryResult.one_line_summary,
      full_summary: summaryResult.full_summary,
      topics_discussed: summaryResult.topics_discussed,
      projects_mentioned: summaryResult.projects_mentioned,
      problems_raised: summaryResult.problems_raised,
      problems_resolved: summaryResult.problems_resolved,
      questions_unanswered: summaryResult.questions_unanswered,
      pain_points_expressed: summaryResult.pain_points_expressed,
      frustrations_expressed: summaryResult.frustrations_expressed,
      wins_celebrated: summaryResult.wins_celebrated,
      goals_mentioned: summaryResult.goals_mentioned,
      decisions_made: summaryResult.decisions_made,
      follow_up_worthy: summaryResult.follow_up_worthy,
      follow_up_question: summaryResult.follow_up_question,
      follow_up_urgency: summaryResult.follow_up_urgency,
      follow_up_timing: summaryResult.follow_up_timing,
      open_loops: summaryResult.open_loops,
      name_learned: summaryResult.name_learned,
      role_learned: summaryResult.role_learned,
      communication_style_observed: summaryResult.communication_style_observed,
      session_sentiment: summaryResult.session_sentiment,
      satisfaction_score: summaryResult.satisfaction_score,
      stress_indicators: summaryResult.stress_indicators,
      message_count: messages.length,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Non-fatal — still return the summary
  }

  return summaryResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 7: updateUserProfile
// ─────────────────────────────────────────────────────────────────────────────

export async function updateUserProfile(
  userId: string,
  summaryData: SessionSummaryResult
): Promise<void> {
  const supabase = createServerClient();

  try {
    // Fetch existing profile
    const { data: existing } = await supabase
      .from('sage_user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    const profile = existing as SageUserProfile | null;

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      total_sessions: (profile?.total_sessions ?? 0) + 1,
      overall_sentiment: summaryData.session_sentiment,
    };

    // Name
    if (summaryData.name_learned && !profile?.first_name) {
      const nameParts = summaryData.name_learned.trim().split(/\s+/);
      updates.first_name = nameParts[0];
      updates.preferred_name = nameParts[0];
    }

    // Role
    if (summaryData.role_learned && !profile?.role) {
      updates.role = summaryData.role_learned;
    }

    // Communication style
    if (summaryData.communication_style_observed) {
      updates.communication_style = summaryData.communication_style_observed;
    }

    // Pain points — deduplicated merge
    if (summaryData.pain_points_expressed.length > 0) {
      const existing_pain = profile?.primary_pain_points ?? [];
      const merged = [...new Set([...existing_pain, ...summaryData.pain_points_expressed])];
      updates.primary_pain_points = merged.slice(0, 20);
    }

    // Open loops — deduplicated merge
    if (summaryData.open_loops.length > 0) {
      const existing_loops = profile?.open_loops ?? [];
      const merged = [...new Set([...existing_loops, ...summaryData.open_loops])];
      updates.open_loops = merged.slice(0, 15);
    }

    // Satisfaction score
    if (summaryData.satisfaction_score) {
      updates.satisfaction_with_saguaro = summaryData.satisfaction_score;
    }

    // Stress level
    if (summaryData.stress_indicators.length > 0) {
      const stressLevel = Math.min(
        10,
        Math.max(1, Math.round(summaryData.stress_indicators.length * 2))
      );
      updates.current_stress_level = stressLevel;
    } else {
      updates.current_stress_level = 2;
    }

    // Follow-up
    if (summaryData.follow_up_worthy && summaryData.follow_up_question) {
      updates.pending_follow_up = summaryData.follow_up_question;
      updates.pending_follow_up_urgency = summaryData.follow_up_urgency;
      updates.pending_follow_up_timing = summaryData.follow_up_timing;
    }

    // Churn risk recompute
    const satisfaction = (summaryData.satisfaction_score ?? profile?.satisfaction_with_saguaro ?? 7) as number;
    const daysSince = (profile?.days_since_last_visit ?? 0) as number;
    if (satisfaction < 4 || daysSince > 30) {
      updates.churn_risk = 'high';
    } else if (satisfaction < 6 || daysSince > 14) {
      updates.churn_risk = 'medium';
    } else {
      updates.churn_risk = 'low';
    }

    // Upsert profile
    if (profile) {
      await supabase
        .from('sage_user_profiles')
        .update(updates)
        .eq('user_id', userId);
    } else {
      await supabase.from('sage_user_profiles').insert({
        user_id: userId,
        ...updates,
        first_seen_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
    }

    // Upsert new facts into sage_knowledge_base
    for (const fact of summaryData.new_facts) {
      try {
        const { data: existingFact } = await supabase
          .from('sage_knowledge_base')
          .select('id, times_confirmed')
          .eq('user_id', userId)
          .eq('key', fact.key)
          .single();

        if (existingFact) {
          await supabase
            .from('sage_knowledge_base')
            .update({
              value: fact.value,
              confidence: fact.confidence,
              times_confirmed: ((existingFact as { times_confirmed: number }).times_confirmed ?? 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq('id', (existingFact as { id: string }).id);
        } else {
          await supabase.from('sage_knowledge_base').insert({
            user_id: userId,
            category: fact.category,
            key: fact.key,
            value: fact.value,
            confidence: fact.confidence,
            source_type: 'conversation',
            is_active: true,
            times_confirmed: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      } catch {
        // Skip individual fact errors
      }
    }
  } catch {
    // Non-fatal
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 8: generateProactiveInsights
// ─────────────────────────────────────────────────────────────────────────────

export async function generateProactiveInsights(
  userId: string,
  tenantId: string,
  summaryData: SessionSummaryResult,
  activeProjects: ProjectSnapshot[]
): Promise<void> {
  const supabase = createServerClient();
  const now = new Date();

  const insightsToInsert: Record<string, unknown>[] = [];

  const makeExpiry = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    return d.toISOString();
  };

  // ── From proactive_insights_to_generate ───────────────────────────────────
  for (const insight of summaryData.proactive_insights_to_generate) {
    insightsToInsert.push({
      user_id: userId,
      tenant_id: tenantId,
      insight_type: insight.type,
      priority: insight.priority,
      urgency: insight.priority >= 8 ? 'high' : insight.priority >= 5 ? 'medium' : 'low',
      title: insight.title,
      message: insight.message,
      action_suggestion: insight.action,
      delivered: false,
      dismissed: false,
      expires_at: makeExpiry(insight.priority >= 7 ? 7 : 14),
      created_at: now.toISOString(),
    });
  }

  // ── From questions_unanswered ─────────────────────────────────────────────
  for (const question of summaryData.questions_unanswered.slice(0, 3)) {
    insightsToInsert.push({
      user_id: userId,
      tenant_id: tenantId,
      insight_type: 'follow_up',
      priority: 6,
      urgency: 'medium',
      title: 'Unanswered Question',
      message: `You asked: "${question.slice(0, 200)}" — I didn't fully answer this yet.`,
      action_suggestion: 'Ask again in your next session',
      delivered: false,
      dismissed: false,
      expires_at: makeExpiry(14),
      created_at: now.toISOString(),
    });
  }

  // ── From unresolved problems ───────────────────────────────────────────────
  const resolvedSet = new Set(
    summaryData.problems_resolved.map((p) => p.toLowerCase())
  );
  const openProblems = summaryData.problems_raised.filter(
    (p) => !resolvedSet.has(p.toLowerCase())
  );

  for (const problem of openProblems.slice(0, 5)) {
    const lowerProblem = problem.toLowerCase();
    let insightType = 'follow_up';
    let priority = 5;
    let title = 'Open Issue';

    if (/lien/i.test(lowerProblem)) {
      insightType = 'risk_alert';
      priority = 9;
      title = 'Lien Risk — Needs Attention';
    } else if (/change order|co\b/i.test(lowerProblem)) {
      insightType = 'risk_alert';
      priority = 8;
      title = 'Change Order Issue — Unresolved';
    } else if (/bid/i.test(lowerProblem)) {
      insightType = 'follow_up';
      priority = 5;
      title = 'Bid Issue Follow-Up';
    } else if (/pay app|payment/i.test(lowerProblem)) {
      insightType = 'risk_alert';
      priority = 8;
      title = 'Payment Issue — Needs Action';
    }

    insightsToInsert.push({
      user_id: userId,
      tenant_id: tenantId,
      insight_type: insightType,
      priority,
      urgency: priority >= 8 ? 'high' : 'medium',
      title,
      message: problem.slice(0, 500),
      action_suggestion: `Review and resolve: "${problem.slice(0, 100)}"`,
      delivered: false,
      dismissed: false,
      expires_at: makeExpiry(priority >= 8 ? 7 : 14),
      created_at: now.toISOString(),
    });
  }

  // ── From active projects ───────────────────────────────────────────────────
  for (const project of activeProjects.slice(0, 3)) {
    if (project.contract_amount > 0) {
      insightsToInsert.push({
        user_id: userId,
        tenant_id: tenantId,
        insight_type: 'project_check',
        priority: 4,
        urgency: 'low',
        title: `Active Project: ${project.name}`,
        message: `${project.name} (${project.status}) — $${project.contract_amount.toLocaleString()} contract. Review status and upcoming milestones.`,
        action_suggestion: `Open ${project.name} to review billing, submittals, and open RFIs`,
        related_project: project.id,
        related_amount: project.contract_amount,
        delivered: false,
        dismissed: false,
        expires_at: makeExpiry(14),
        created_at: now.toISOString(),
      });
    }
  }

  // Batch insert — skip duplicates gracefully
  if (insightsToInsert.length > 0) {
    try {
      await supabase.from('sage_proactive_insights').insert(insightsToInsert);
    } catch {
      // Try one at a time as fallback
      for (const insight of insightsToInsert) {
        try {
          await supabase.from('sage_proactive_insights').insert(insight);
        } catch {
          // Skip
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 9: generatePersonalizedGreeting
// ─────────────────────────────────────────────────────────────────────────────

export async function generatePersonalizedGreeting(
  userId: string,
  tenantId: string,
  intelligence: SageIntelligence
): Promise<string> {
  const { profile, recentSessions, pendingInsights } = intelligence;
  const anthropic = new Anthropic();
  const supabase = createServerClient();

  const name =
    profile?.preferred_name ?? profile?.first_name ?? null;

  // Days since last visit
  let daysSinceLastVisit = 0;
  if (profile?.last_seen_at) {
    const lastSeen = new Date(profile.last_seen_at);
    const now = new Date();
    daysSinceLastVisit = Math.floor(
      (now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  const timeAwayBucket =
    daysSinceLastVisit === 0
      ? 'same_day'
      : daysSinceLastVisit <= 3
      ? '1_3_days'
      : daysSinceLastVisit <= 14
      ? '4_14_days'
      : '2_weeks_plus';

  const lastSessionSummary = recentSessions[0]?.one_line_summary ?? null;
  const openLoops = (profile?.open_loops ?? []).slice(0, 2);
  const topInsight = pendingInsights[0] ?? null;

  const contextParts: string[] = [
    `User name: ${name ?? 'unknown (don\'t use a name if unknown)'}`,
    `Days since last visit: ${daysSinceLastVisit} (bucket: ${timeAwayBucket})`,
    `Communication style directive: ${intelligence.communicationDirective}`,
    `Relationship depth: ${intelligence.relationshipDepth}`,
  ];

  if (lastSessionSummary) {
    contextParts.push(`Last session summary: "${lastSessionSummary}"`);
  }
  if (openLoops.length > 0) {
    contextParts.push(`Open loops to reference: ${openLoops.join(' | ')}`);
  }
  if (topInsight) {
    contextParts.push(
      `Top insight to weave in (subtly): [${topInsight.title}] ${topInsight.message}`
    );
  }
  if (profile?.pending_follow_up) {
    contextParts.push(
      `Pending follow-up question: "${profile.pending_follow_up}" (urgency: ${profile.pending_follow_up_urgency ?? 'normal'})`
    );
  }

  const systemPrompt = `You are Sage, a construction AI assistant. Generate a personalized greeting for this user.

Rules:
- Use their preferred name if known
- Reference something SPECIFIC from their history (not generic)
- Ask ONE follow-up if warranted (don't force it)
- Match their communication style directive exactly
- 2-3 sentences max — never longer
- Never sound scripted, corporate, or hollow
- Never start with "Great to see you!" or "Welcome back!" or "Hello!"
- Adapt tone to time away: same_day=ultra brief/direct, 1_3_days=brief callback to last session, 4_14_days=meaningful reference to what they were working on, 2_weeks_plus=warm re-engagement referencing something specific
- If churn risk is high, be extra warm and show you remember them well`;

  const userPrompt = `Generate a greeting based on this context:\n\n${contextParts.join('\n')}`;

  let greeting = '';

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 120,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    greeting =
      response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
  } catch {
    // Fallback greeting
    const nameStr = name ? ` ${name}` : '';
    greeting =
      daysSinceLastVisit === 0
        ? `What are we tackling?`
        : daysSinceLastVisit <= 3
        ? `Hey${nameStr} — picking up where we left off?`
        : `Good to see you${nameStr}. What's on your plate today?`;
  }

  // Mark top insight as delivered if we included it
  if (topInsight) {
    try {
      await supabase
        .from('sage_proactive_insights')
        .update({ delivered: true, delivered_at: new Date().toISOString() })
        .eq('id', topInsight.id);
    } catch {
      // Non-fatal
    }
  }

  return greeting;
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 10: predictNextNeeds
// ─────────────────────────────────────────────────────────────────────────────

export function predictNextNeeds(intelligence: SageIntelligence): string[] {
  return predictNextNeedsFromData(
    intelligence.profile,
    intelligence.recentSessions,
    intelligence.pendingInsights,
    intelligence.activeProjects
  );
}

// Internal helper used by both loadFullIntelligence and predictNextNeeds
function predictNextNeedsFromData(
  profile: SageUserProfile | null,
  recentSessions: SageSessionSummary[],
  pendingInsights: SageProactiveInsight[],
  activeProjects: ProjectSnapshot[]
): string[] {
  const needs: string[] = [];

  // From open loops
  const openLoops = profile?.open_loops ?? [];
  if (openLoops.length > 0) {
    needs.push(`Follow up on: ${openLoops[0].slice(0, 80)}`);
  }

  // From last topic
  const lastTopic = profile?.last_topic;
  if (lastTopic) {
    const topicActions: Record<string, string> = {
      pay_app: 'Submit or review current pay application (G702/G703)',
      lien: 'Send pending lien notice or waiver',
      change_order: 'Document and price open change order',
      rfi: 'Draft or track open RFI responses',
      takeoff: 'Run AI takeoff on current blueprint set',
      certified_payroll: 'Submit certified payroll for current pay period',
      bid: 'Review and finalize open bid estimate',
      insurance: 'Check subcontractor COI expirations',
      punch_list: 'Generate punch list for closeout',
      schedule: 'Review project schedule and flag delays',
    };
    const action = topicActions[lastTopic];
    if (action && !needs.includes(action)) needs.push(action);
  }

  // From recent session topics
  const recentTopics = recentSessions[0]?.topics_discussed ?? [];
  for (const topic of recentTopics.slice(0, 2)) {
    const topicPredictions: Record<string, string> = {
      'pay applications': 'Generate G702 for current billing period',
      'lien rights/waivers': 'Check which subs need lien waivers this period',
      'AI takeoff': 'Run AI takeoff on new blueprint set',
      'certified payroll': 'Submit WH-347 for current week',
      'change orders': 'Price and document open change orders',
      bidding: 'Review bid leveling for active solicitations',
      'insurance/compliance': 'Audit subcontractor COI compliance',
      RFIs: 'Close out overdue RFI responses',
    };
    const pred = topicPredictions[topic];
    if (pred && !needs.includes(pred)) needs.push(pred);
  }

  // From pending insights
  if (pendingInsights.length > 0) {
    const topInsight = pendingInsights[0];
    const action = topInsight.action_suggestion ?? topInsight.title;
    if (!needs.includes(action)) needs.push(action);
  }

  // From active projects
  if (activeProjects.length > 0) {
    const proj = activeProjects[0];
    const projAction = `Review billing status for ${proj.name}`;
    if (!needs.includes(projAction)) needs.push(projAction);
  }

  // Fallback to high-value generic construction tasks
  const fallbacks = [
    'Generate G702 for current billing period',
    'Check which subs need COI renewal',
    'Run AI takeoff on new blueprint',
    'Review open RFIs and submittals',
    'Check certified payroll compliance',
    'Draft change order for scope additions',
  ];

  for (const fb of fallbacks) {
    if (needs.length >= 6) break;
    if (!needs.includes(fb)) needs.push(fb);
  }

  return needs.slice(0, 6);
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 11: buildSuggestionChips
// ─────────────────────────────────────────────────────────────────────────────

export function buildSuggestionChips(
  intelligence: SageIntelligence,
  currentPage: string
): SuggestionChip[] {
  const { profile, pendingInsights, recentSessions, activeProjects } = intelligence;
  const chips: SuggestionChip[] = [];

  // ── Personalized chips (if we have profile data) ───────────────────────────
  if (profile) {
    // Open loop chip
    const openLoops = profile.open_loops ?? [];
    if (openLoops.length > 0 && chips.length < 4) {
      const loop = openLoops[0];
      const label = `Resolve: ${loop.slice(0, 36)}`;
      chips.push({
        label: label.slice(0, 40),
        prompt: `Let's resolve this open item: ${loop}`,
      });
    }

    // Pending insight chip
    if (pendingInsights.length > 0 && chips.length < 4) {
      const insight = pendingInsights[0];
      const label = insight.title.slice(0, 40);
      chips.push({
        label,
        prompt: insight.action_suggestion ?? insight.message,
      });
    }

    // Last session topic chip
    const lastTopics = recentSessions[0]?.topics_discussed ?? [];
    if (lastTopics.length > 0 && chips.length < 4) {
      const topic = lastTopics[0];
      const topicChips: Record<string, SuggestionChip> = {
        'pay applications': {
          label: 'Submit pay app',
          prompt: 'Help me generate and submit a pay application for the current billing period.',
        },
        'lien rights/waivers': {
          label: 'Send lien notice',
          prompt: 'Help me send or prepare a preliminary lien notice.',
        },
        'AI takeoff': {
          label: 'Run AI takeoff',
          prompt: 'I want to run an AI takeoff on a blueprint set. Walk me through it.',
        },
        'change orders': {
          label: 'Price a change order',
          prompt: 'Help me document and price an open change order.',
        },
        bidding: {
          label: 'Review my bid',
          prompt: 'Help me review and level my current bid estimate.',
        },
        'certified payroll': {
          label: 'Submit certified payroll',
          prompt: 'Help me complete and submit certified payroll for this pay period.',
        },
        'insurance/compliance': {
          label: 'Check COI compliance',
          prompt: 'Show me which subcontractors have expired or missing certificates of insurance.',
        },
        RFIs: {
          label: 'Review open RFIs',
          prompt: 'Show me all open RFIs and help me draft responses for the overdue ones.',
        },
      };
      const chip = topicChips[topic];
      if (chip && chips.length < 4) chips.push(chip);
    }

    // Active project chip
    if (activeProjects.length > 0 && chips.length < 4) {
      const proj = activeProjects[0];
      chips.push({
        label: `Check ${proj.name.slice(0, 30)}`.slice(0, 40),
        prompt: `Give me a health check on the ${proj.name} project — billing status, open items, and any risks.`,
      });
    }
  }

  // ── Fill to 4 with page-specific defaults ──────────────────────────────────
  const pageDefaults: Record<string, SuggestionChip[]> = {
    dashboard: [
      { label: 'Score a bid', prompt: 'Help me analyze and score my current bid for competitiveness and risk.' },
      { label: 'Check project health', prompt: 'Run a health check on all my active projects and flag any risks.' },
      { label: 'Show overdue items', prompt: 'What items are overdue or past deadline across all my projects?' },
      { label: 'Help me draft a letter', prompt: 'I need to draft a professional letter for a construction matter. Help me write it.' },
    ],
    projects: [
      { label: 'Analyze project risk', prompt: 'Analyze my current project for risks — payment, schedule, scope creep, and compliance.' },
      { label: 'Run a pay app', prompt: 'Help me generate a pay application (G702/G703) for the current billing period.' },
      { label: 'Check my subs', prompt: 'Show me the compliance status of all subcontractors on this project — COIs, lien waivers, payroll.' },
      { label: 'Review open RFIs', prompt: 'List all open RFIs on this project and help me draft responses for the overdue ones.' },
    ],
    takeoff: [
      { label: 'Start AI takeoff', prompt: 'I want to start an AI takeoff on a set of blueprints. Walk me through the process.' },
      { label: 'Review materials list', prompt: 'Review my current materials list and check for missing items or pricing gaps.' },
      { label: 'Export to Excel', prompt: 'Help me export my takeoff quantities to Excel format.' },
      { label: 'Check quantities', prompt: 'Verify my quantity calculations and flag anything that looks off.' },
    ],
  };

  const defaults = pageDefaults[currentPage] ?? [
    { label: "What's most urgent?", prompt: "What are the most urgent items I need to handle right now across all my projects?" },
    { label: 'Help me draft something', prompt: 'I need to draft a professional document or letter. What do you need from me?' },
    { label: 'Run a calculation', prompt: 'Help me run a construction calculation — retainage, change order pricing, or material costs.' },
    { label: 'Check compliance', prompt: 'Run a compliance check on my current project — insurance, prevailing wage, and lien requirements.' },
  ];

  for (const defaultChip of defaults) {
    if (chips.length >= 4) break;
    // Avoid exact label duplicates
    if (!chips.some((c) => c.label === defaultChip.label)) {
      chips.push(defaultChip);
    }
  }

  return chips.slice(0, 4);
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 12: learnFromFeedback
// ─────────────────────────────────────────────────────────────────────────────

export async function learnFromFeedback(
  messageId: string,
  thumbsUp: boolean,
  note: string | null,
  userId: string
): Promise<void> {
  const supabase = createServerClient();

  try {
    // Update the conversation row
    await supabase
      .from('sage_conversations')
      .update({
        thumbs_up: thumbsUp ? true : null,
        thumbs_down: thumbsUp ? null : true,
        feedback_note: note ?? null,
        was_helpful: thumbsUp,
      })
      .eq('id', messageId);

    if (thumbsUp) {
      // ── Positive feedback ────────────────────────────────────────────────
      await supabase.from('sage_performance_log').insert({
        user_id: userId,
        metric_type: 'thumbs_up',
        metric_value: 1,
        created_at: new Date().toISOString(),
      });

      // Increment satisfaction (cap at 10)
      const { data: profile } = await supabase
        .from('sage_user_profiles')
        .select('satisfaction_with_saguaro')
        .eq('user_id', userId)
        .single();

      const currentSatisfaction =
        (profile as { satisfaction_with_saguaro: number } | null)?.satisfaction_with_saguaro ?? 7;
      const newSatisfaction = Math.min(10, currentSatisfaction + 0.1);

      await supabase
        .from('sage_user_profiles')
        .update({
          satisfaction_with_saguaro: Math.round(newSatisfaction * 10) / 10,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
    } else {
      // ── Negative feedback ────────────────────────────────────────────────
      await supabase.from('sage_performance_log').insert({
        user_id: userId,
        metric_type: 'thumbs_down',
        metric_value: 0,
        created_at: new Date().toISOString(),
      });

      // Detect failure type from note
      let failureType: 'too_long' | 'wrong_tone' | 'wrong_info' | 'not_helpful' | null = null;
      if (note) {
        const noteLower = note.toLowerCase();
        if (/too long|lengthy|wordy|too much|too detailed|verbose/i.test(noteLower)) {
          failureType = 'too_long';
        } else if (/tone|formal|casual|rude|cold|robotic|stiff|weird|off/i.test(noteLower)) {
          failureType = 'wrong_tone';
        } else if (/wrong|incorrect|inaccurate|false|error|bad info|not right|not accurate/i.test(noteLower)) {
          failureType = 'wrong_info';
        } else {
          failureType = 'not_helpful';
        }
      }

      const profileUpdates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (failureType === 'too_long') {
        profileUpdates.preferred_response_length = 'short';
        profileUpdates.prefers_bullet_points = true;
      } else if (failureType === 'wrong_tone') {
        // Flag that tone needs adjustment
        profileUpdates.communication_style = 'Needs recalibration — user flagged tone mismatch';
        profileUpdates.language_formality = 'unknown';
      }

      // Add to frustration_triggers if note provided
      if (note && note.trim().length > 3) {
        const { data: currentProfile } = await supabase
          .from('sage_user_profiles')
          .select('frustration_triggers, sage_notes')
          .eq('user_id', userId)
          .single();

        const existingTriggers =
          (currentProfile as { frustration_triggers: string[] } | null)?.frustration_triggers ?? [];
        const existingNotes =
          (currentProfile as { sage_notes: string } | null)?.sage_notes ?? '';
        const triggerEntry = `[feedback] ${note.slice(0, 200)}`;

        if (!existingTriggers.includes(triggerEntry)) {
          profileUpdates.frustration_triggers = [
            ...existingTriggers,
            triggerEntry,
          ].slice(0, 20);
        }

        // Check for 3+ thumbs_down in last 30 minutes
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: recentDownvotes } = await supabase
          .from('sage_performance_log')
          .select('id')
          .eq('user_id', userId)
          .eq('metric_type', 'thumbs_down')
          .gte('created_at', thirtyMinutesAgo);

        if (recentDownvotes && recentDownvotes.length >= 2) {
          // 3rd downvote within 30 minutes — flag immediate style adjustment
          const flagNote = `[URGENT ${new Date().toISOString()}] 3+ downvotes in 30 min — immediate style adjustment needed. Last feedback: "${note.slice(0, 100)}"`;
          profileUpdates.sage_notes = existingNotes
            ? `${existingNotes}\n${flagNote}`
            : flagNote;
        }
      }

      await supabase
        .from('sage_user_profiles')
        .update(profileUpdates)
        .eq('user_id', userId);
    }
  } catch {
    // Non-fatal — swallow errors so feedback never blocks the UI
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function buildCommunicationDirective(profile: SageUserProfile | null): string {
  if (!profile) {
    return 'Be direct and professional, use construction terminology, aim for 2-4 sentences, bullets when listing items';
  }

  const parts: string[] = [];

  // Tone
  const formality = profile.language_formality ?? profile.communication_style ?? '';
  if (/casual/i.test(formality)) {
    parts.push('Match casual conversational tone');
  } else if (/formal/i.test(formality)) {
    parts.push('Keep professional formal tone');
  } else {
    parts.push('Semi-formal, approachable tone');
  }

  // Length
  const length = profile.preferred_response_length ?? 'adaptive';
  if (length === 'short') {
    parts.push('keep responses under 60 words');
  } else if (length === 'detailed') {
    parts.push('provide thorough detailed responses');
  } else {
    parts.push('match response length to question complexity');
  }

  // Format
  if (profile.prefers_bullet_points) {
    parts.push('use bullets for lists and steps');
  } else {
    parts.push('use prose format');
  }

  // Relationship context
  const sessions = profile.total_sessions ?? 0;
  if (sessions > 30) {
    parts.push('skip pleasantries — get straight to the answer');
  } else if (sessions > 10) {
    parts.push('brief acknowledgment okay, then get to the point');
  } else {
    parts.push('be warm and helpful — still building rapport');
  }

  return parts.join(', ');
}
