// lib/sage-memory.ts
export interface CommunicationStyle {
  avgMessageLength: 'short' | 'medium' | 'long';
  usesEmojis: boolean;
  emojiFrequency: number;
  formalityLevel: 'casual' | 'semi' | 'professional';
  usesPunctuation: boolean;
  usesSlang: boolean;
  sentenceStyle: 'fragments' | 'complete' | 'mixed';
  technicalDepth: 'basic' | 'intermediate' | 'expert';
  prefersListFormat: boolean;
  directnessScore: number;
  frequentTerms: string[];
  nicknames: Record<string, string>;
  recentMessageSamples: string[];
}

export interface ProjectMemory {
  projectId: string;
  projectName: string;
  mentionCount: number;
  lastMentioned: string;
  knownFacts: string[];
  openIssues: string[];
  resolvedTopics: string[];
  userSentiment: 'frustrated' | 'neutral' | 'positive';
}

export interface ConversationSummary {
  sessionId: string;
  date: string;
  messageCount: number;
  keyTopicsDiscussed: string[];
  decisionsReached: string[];
  openLoops: string[];
  userMoodSignal: 'stressed' | 'neutral' | 'positive' | 'confused';
  oneLineSummary: string;
}

export interface UserMemoryProfile {
  userId: string;
  createdAt: string;
  lastUpdatedAt: string;
  totalMessagesSent: number;
  totalSessionCount: number;
  identity: {
    firstName: string | null;
    role: string | null;
    companyName: string | null;
    yearsInConstruction: number | null;
    primarySpecialty: string | null;
    primaryStates: string[];
    teamSize: string | null;
  };
  style: CommunicationStyle;
  interests: {
    topFeatures: string[];
    topConcerns: string[];
    learningTopics: string[];
    frequentTasks: string[];
  };
  projectMemories: ProjectMemory[];
  sessionHistory: ConversationSummary[];
  learnedPreferences: {
    preferredResponseLength: 'brief' | 'detailed' | 'adaptive';
    wantsExamples: boolean;
    wantsNavigationLinks: boolean;
    wantsProactiveSuggestions: boolean;
    preferredGreeting: string;
    dontRepeatTopics: string[];
  };
  sageNotes: string[];
  engagement: {
    currentStreak: number;
    lastActiveDate: string;
    totalQuestionsAsked: number;
    mostActiveHour: number;
    averageSessionLength: number;
  };
}

const STORAGE_VERSION = 'v2';

export function getStorageKey(userId: string | null, sessionId: string): string {
  if (userId) return `sage_memory_${STORAGE_VERSION}_${userId}`;
  return `sage_session_${STORAGE_VERSION}_${sessionId}`;
}

export function loadMemoryProfile(
  userId: string | null,
  sessionId: string
): UserMemoryProfile | null {
  try {
    const key = getStorageKey(userId, sessionId);
    const storage = userId ? localStorage : sessionStorage;
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as UserMemoryProfile;
  } catch {
    return null;
  }
}

export function saveMemoryProfile(
  profile: UserMemoryProfile,
  userId: string | null,
  sessionId: string
): void {
  try {
    const key = getStorageKey(userId, sessionId);
    const storage = userId ? localStorage : sessionStorage;
    storage.setItem(key, JSON.stringify(profile));
  } catch {
    if (profile.sessionHistory.length > 10) {
      profile.sessionHistory = profile.sessionHistory.slice(-10);
      saveMemoryProfile(profile, userId, sessionId);
    }
  }
}

export function createFreshProfile(
  userId: string | null,
  sessionId: string
): UserMemoryProfile {
  return {
    userId: userId ?? sessionId,
    createdAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    totalMessagesSent: 0,
    totalSessionCount: 1,
    identity: {
      firstName: null,
      role: null,
      companyName: null,
      yearsInConstruction: null,
      primarySpecialty: null,
      primaryStates: [],
      teamSize: null,
    },
    style: {
      avgMessageLength: 'medium',
      usesEmojis: false,
      emojiFrequency: 0,
      formalityLevel: 'semi',
      usesPunctuation: true,
      usesSlang: false,
      sentenceStyle: 'mixed',
      technicalDepth: 'intermediate',
      prefersListFormat: false,
      directnessScore: 5,
      frequentTerms: [],
      nicknames: {},
      recentMessageSamples: [],
    },
    interests: {
      topFeatures: [],
      topConcerns: [],
      learningTopics: [],
      frequentTasks: [],
    },
    projectMemories: [],
    sessionHistory: [],
    learnedPreferences: {
      preferredResponseLength: 'adaptive',
      wantsExamples: true,
      wantsNavigationLinks: true,
      wantsProactiveSuggestions: true,
      preferredGreeting: 'Hey',
      dontRepeatTopics: [],
    },
    sageNotes: [],
    engagement: {
      currentStreak: 1,
      lastActiveDate: new Date().toISOString(),
      totalQuestionsAsked: 0,
      mostActiveHour: new Date().getHours(),
      averageSessionLength: 0,
    },
  };
}

export function analyzeAndUpdateStyle(
  profile: UserMemoryProfile,
  userMessage: string
): UserMemoryProfile {
  const updated = { ...profile };
  const style = { ...updated.style };

  style.recentMessageSamples = [
    ...style.recentMessageSamples.slice(-14),
    userMessage,
  ];

  const words = userMessage.trim().split(/\s+/).length;

  const lengths: number[] = style.recentMessageSamples.map(m => {
    const w = m.trim().split(/\s+/).length;
    return w < 20 ? 0 : w < 60 ? 1 : 2;
  });
  const avgLen = lengths.reduce((a: number, b: number) => a + b, 0) / lengths.length;
  style.avgMessageLength = avgLen < 0.5 ? 'short' : avgLen < 1.5 ? 'medium' : 'long';

  const emojiPattern = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
  const emojisInMsg = (userMessage.match(emojiPattern) || []).length;
  if (emojisInMsg > 0) {
    style.usesEmojis = true;
    style.emojiFrequency = (style.emojiFrequency * 0.7 + (emojisInMsg / words) * 0.3);
  }

  const slangTerms = /\b(gonna|wanna|lemme|gotta|kinda|sorta|lol|lmao|bruh|bro|yo|nah|yea|yep|nope|tbh|imo|rn|asap|fyi|idk|omg|wtf|fr|ngl)\b/i;
  if (slangTerms.test(userMessage)) {
    style.usesSlang = true;
    style.formalityLevel = 'casual';
  }

  const expertTerms = /\b(CSI|AIA|G702|G703|WH-347|Davis-Bacon|prevailing wage|lien waiver|retainage|SOV|PCO|NOP|NOC|OCIP|CCIP|MasterFormat|RFI|submittal|substantial completion|punch list|force account|constructive change|prelim|preliminary notice|ACORD|COI|Division \d+)\b/i;
  const expertMatches = (userMessage.match(expertTerms) || []).length;
  if (expertMatches >= 2) style.technicalDepth = 'expert';
  else if (expertMatches === 1 && style.technicalDepth === 'basic') style.technicalDepth = 'intermediate';

  const hasPeriod = /[.!?]/.test(userMessage);
  const seemsComplete = userMessage.length > 20 && hasPeriod;
  if (!seemsComplete && words < 10) {
    const fragmentCount = style.recentMessageSamples.filter(m => m.length < 30 && !/[.!?]/.test(m)).length;
    if (fragmentCount > 5) style.sentenceStyle = 'fragments';
  }

  const pleasantries = /\b(please|thanks|thank you|could you|would you|can you|hi|hello|hey sage|good morning|appreciate)\b/i;
  if (!pleasantries.test(userMessage) && words < 15) {
    style.directnessScore = Math.min(10, style.directnessScore + 0.5);
  } else if (pleasantries.test(userMessage)) {
    style.directnessScore = Math.max(0, style.directnessScore - 0.3);
  }

  const nameMatch = userMessage.match(/(?:i'm|i am|my name is|call me|this is)\s+([A-Z][a-z]+)/i);
  if (nameMatch && !updated.identity.firstName) {
    updated.identity.firstName = nameMatch[1];
  }

  const roleMatch = userMessage.match(/\b(i'm|i am|we are|as a|as the)\s+(GC|general contractor|PM|project manager|estimator|superintendent|super|owner|subcontractor|owner's rep)\b/i);
  if (roleMatch && !updated.identity.role) {
    updated.identity.role = roleMatch[2];
  }

  const stateMatch = userMessage.match(/\b(Arizona|AZ|California|CA|Texas|TX|Nevada|NV|Colorado|CO|New Mexico|NM|Utah|UT|Florida|FL|Georgia|GA|New York|NY)\b/g);
  if (stateMatch) {
    const newStates = stateMatch.filter(s => !updated.identity.primaryStates.includes(s));
    updated.identity.primaryStates = [...updated.identity.primaryStates, ...newStates].slice(0, 5);
  }

  const constructionTerms = userMessage.match(/\b(lien|pay app|change order|takeoff|bid|subcontractor|sub|owner|retainage|punch list|RFI|submittal|permit|inspection|closeout|certified payroll|prevailing wage|G702|G703)\b/gi) || [];
  for (const term of constructionTerms) {
    const normalized = term.toLowerCase();
    if (!style.frequentTerms.includes(normalized)) {
      style.frequentTerms = [...style.frequentTerms, normalized].slice(-20);
    }
  }

  updated.style = style;
  updated.totalMessagesSent += 1;
  updated.lastUpdatedAt = new Date().toISOString();

  const lastActive = new Date(updated.engagement.lastActiveDate);
  const now = new Date();
  const daysSince = Math.floor((now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSince === 1) {
    updated.engagement.currentStreak += 1;
  } else if (daysSince > 1) {
    updated.engagement.currentStreak = 1;
  }
  updated.engagement.lastActiveDate = now.toISOString();
  updated.engagement.mostActiveHour = now.getHours();
  updated.engagement.totalQuestionsAsked += 1;

  return updated;
}

export function generateStyleMirrorInstructions(profile: UserMemoryProfile): string {
  const { style, learnedPreferences, identity, sageNotes } = profile;
  const parts: string[] = [];

  if (profile.totalMessagesSent < 5) {
    return 'COMMUNICATION STYLE: Default professional but approachable tone.';
  }

  parts.push('═══ ADAPTIVE COMMUNICATION STYLE (mirror this user precisely) ═══');

  if (style.formalityLevel === 'casual' || style.usesSlang) {
    parts.push('TONE: Match their casual energy. Be conversational, not corporate.');
    parts.push('LANGUAGE: You can use casual construction-crew language. "Yeah", "Nah", "Here\'s the deal", "Real talk", "Straight up".');
  } else if (style.formalityLevel === 'professional') {
    parts.push('TONE: Stay professional and precise. They speak formally, so do you.');
  } else {
    parts.push('TONE: Semi-formal but friendly. Not stiff, not sloppy.');
  }

  if (style.avgMessageLength === 'short' || style.directnessScore >= 7) {
    parts.push('RESPONSE LENGTH: SHORT. They ask short questions, give short answers. Cut everything that isn\'t essential. Lead with the answer, skip the setup. No fluff. Under 80 words unless they\'re asking for something complex.');
  } else if (style.avgMessageLength === 'long') {
    parts.push('RESPONSE LENGTH: They write detailed messages, they want detailed responses. Give thorough explanations with context.');
  } else {
    parts.push('RESPONSE LENGTH: Medium. Match the complexity of their question. Don\'t pad, don\'t truncate.');
  }

  if (style.technicalDepth === 'expert') {
    parts.push('TECHNICAL LEVEL: They know construction cold. Skip the basic explanations. Use CSI codes, AIA document refs, legal terminology freely.');
  } else if (style.technicalDepth === 'basic') {
    parts.push('TECHNICAL LEVEL: Explain jargon when you use it. They\'re learning. Don\'t drown them in acronyms.');
  }

  if (style.usesEmojis && style.emojiFrequency > 0.05) {
    parts.push('EMOJIS: They use emojis naturally. Match that energy — use 1-2 relevant emojis per response when it feels natural. Never forced.');
  } else {
    parts.push('EMOJIS: They don\'t use emojis. Don\'t use them either.');
  }

  if (style.sentenceStyle === 'fragments') {
    parts.push('SENTENCE STYLE: They write in fragments and commands. Mirror it. "G702 autofills from your SOV. One click. Done." Not "The G702 form is automatically populated from your Schedule of Values."');
  }

  if (style.directnessScore >= 8) {
    parts.push('DIRECTNESS: Maximum. No greetings. No "Great question." No setup. Instant answer.');
  }

  if (identity.firstName) {
    parts.push(`PERSONAL: You know their name is ${identity.firstName}. Use it occasionally (not every message) to feel natural.`);
  }
  if (identity.role) {
    parts.push(`ROLE CONTEXT: They're a ${identity.role}. Frame advice from that perspective.`);
  }
  if (identity.primaryStates.length > 0) {
    parts.push(`STATE CONTEXT: They primarily work in ${identity.primaryStates.join(', ')}. Default to these state-specific rules for lien law, prevailing wage, etc.`);
  }

  if (learnedPreferences.preferredResponseLength === 'brief') {
    parts.push('PREFERENCE (learned): They\'ve shown they want brief answers. Keep it tight.');
  }
  if (sageNotes.length > 0) {
    parts.push('SAGE\'S OWN NOTES ABOUT THIS USER:');
    sageNotes.forEach(note => parts.push(` - ${note}`));
  }

  return parts.join('\n');
}

export function buildMemoryContextBlock(profile: UserMemoryProfile): string {
  const parts: string[] = [];

  parts.push('═══ PERSISTENT MEMORY CONTEXT (what you know about this person) ═══');
  parts.push(`Total conversations: ${profile.totalSessionCount}`);
  parts.push(`Messages exchanged: ${profile.totalMessagesSent}`);

  if (profile.engagement.currentStreak > 2) {
    parts.push(`Active streak: ${profile.engagement.currentStreak} days — they're a regular user. Acknowledge the relationship.`);
  }

  const id = profile.identity;
  const identityParts: string[] = [];
  if (id.firstName) identityParts.push(`Name: ${id.firstName}`);
  if (id.role) identityParts.push(`Role: ${id.role}`);
  if (id.companyName) identityParts.push(`Company: ${id.companyName}`);
  if (id.primarySpecialty) identityParts.push(`Specialty: ${id.primarySpecialty}`);
  if (id.primaryStates.length > 0) identityParts.push(`Works in: ${id.primaryStates.join(', ')}`);
  if (id.yearsInConstruction) identityParts.push(`Experience: ${id.yearsInConstruction} years`);
  if (id.teamSize) identityParts.push(`Team size: ${id.teamSize}`);
  if (identityParts.length > 0) {
    parts.push('\nWHO THEY ARE:\n' + identityParts.map(p => `  ${p}`).join('\n'));
  }

  if (profile.interests.topFeatures.length > 0) {
    parts.push(`\nFEATURES THEY USE MOST: ${profile.interests.topFeatures.slice(0, 5).join(', ')}`);
  }
  if (profile.interests.topConcerns.length > 0) {
    parts.push(`RECURRING PAIN POINTS: ${profile.interests.topConcerns.slice(0, 5).join(', ')}`);
  }
  if (profile.learnedPreferences.dontRepeatTopics.length > 0) {
    parts.push(`TOPICS ALREADY EXPLAINED (don't repeat basics): ${profile.learnedPreferences.dontRepeatTopics.join(', ')}`);
  }

  if (profile.projectMemories.length > 0) {
    parts.push('\nPROJECT KNOWLEDGE (what you know about their specific projects):');
    for (const proj of profile.projectMemories.slice(0, 5)) {
      parts.push(`\n  PROJECT: ${proj.projectName}`);
      if (proj.knownFacts.length > 0) {
        parts.push(`    Facts: ${proj.knownFacts.join(' | ')}`);
      }
      if (proj.openIssues.length > 0) {
        parts.push(`    Open issues: ${proj.openIssues.join(' | ')}`);
      }
      if (proj.userSentiment === 'frustrated') {
        parts.push(`    SENTIMENT: User is frustrated about this project — be empathetic.`);
      }
    }
  }

  if (profile.sessionHistory.length > 0) {
    parts.push('\nRECENT CONVERSATION HISTORY:');
    for (const session of profile.sessionHistory.slice(-5).reverse()) {
      parts.push(`  [${new Date(session.date).toLocaleDateString()}] ${session.oneLineSummary}`);
      if (session.openLoops.length > 0) {
        parts.push(`    Unresolved: ${session.openLoops.join(' | ')}`);
      }
    }
  }

  if (profile.totalSessionCount > 1) {
    parts.push('\nCONTINUITY RULE: You have history with this person. Reference it naturally when relevant.');
    parts.push('DO NOT reference past conversations in a creepy way. Be natural, like a colleague who pays attention.');
  }

  return parts.join('\n');
}

export function summarizeSession(
  sessionId: string,
  messages: Array<{ role: string; content: string }>,
  currentProfile: UserMemoryProfile
): { summary: ConversationSummary; updatedProfile: UserMemoryProfile } {
  const userMessages = messages.filter(m => m.role === 'user');
  const allContent = messages.map(m => m.content).join(' ').toLowerCase();

  const topicMap: Record<string, string> = {
    'lien': 'lien rights/waivers',
    'pay app|g702|g703': 'pay applications',
    'takeoff|blueprint': 'AI takeoff',
    'certified payroll|wh-347|davis-bacon|prevailing wage': 'certified payroll',
    'change order|pco': 'change orders',
    'bid|estimate': 'bidding',
    'insurance|coi|acord': 'insurance/compliance',
    'rfi': 'RFIs',
    'autopilot': 'Autopilot feature',
    'pricing|cost|subscription': 'pricing questions',
  };

  const topics: string[] = [];
  for (const [pattern, label] of Object.entries(topicMap)) {
    if (new RegExp(pattern).test(allContent)) topics.push(label);
  }

  const frustrationSignals = /\b(frustrated|annoying|doesn't work|broken|wrong|bad|terrible|awful|hate|ugh|wtf|seriously|not working|issue|problem|bug|error)\b/i;
  const positiveSignals = /\b(great|awesome|perfect|thanks|helpful|love|excellent|exactly|works|solved|fixed|nice)\b/i;
  const confusionSignals = /\b(confused|don't understand|what does|how does|explain|not sure|unclear|help me understand)\b/i;

  const moodScore = {
    frustrated: (allContent.match(frustrationSignals) || []).length,
    positive: (allContent.match(positiveSignals) || []).length,
    confused: (allContent.match(confusionSignals) || []).length,
  };

  let mood: ConversationSummary['userMoodSignal'] = 'neutral';
  if (moodScore.frustrated > moodScore.positive && moodScore.frustrated > 1) mood = 'stressed';
  else if (moodScore.positive > moodScore.frustrated) mood = 'positive';
  else if (moodScore.confused > 1) mood = 'confused';

  const firstUserMsg = userMessages[0]?.content?.slice(0, 60) ?? 'general questions';
  const topTopic = topics[0] ?? 'construction questions';
  const oneLineSummary = `${userMessages.length} messages about ${topics.slice(0, 2).join(' and ') || topTopic}. Started with: "${firstUserMsg}..."`;

  const lastUserMsg = userMessages[userMessages.length - 1]?.content ?? '';
  const openLoops: string[] = [];
  if (/\?$/.test(lastUserMsg.trim())) {
    openLoops.push('Session ended with unanswered question: ' + lastUserMsg.slice(0, 80));
  }

  const summary: ConversationSummary = {
    sessionId,
    date: new Date().toISOString(),
    messageCount: messages.length,
    keyTopicsDiscussed: topics,
    decisionsReached: [],
    openLoops,
    userMoodSignal: mood,
    oneLineSummary,
  };

  const updatedProfile = { ...currentProfile };
  updatedProfile.sessionHistory = [
    ...updatedProfile.sessionHistory.slice(-29),
    summary,
  ];
  updatedProfile.totalSessionCount += 1;

  for (const topic of topics) {
    const featureKeywords = ['pay applications', 'AI takeoff', 'Autopilot feature', 'lien rights/waivers', 'certified payroll', 'bidding'];
    if (featureKeywords.includes(topic)) {
      const idx = updatedProfile.interests.topFeatures.indexOf(topic);
      if (idx === -1) {
        updatedProfile.interests.topFeatures.push(topic);
      }
    }
  }

  if (mood === 'stressed') {
    const concernText = topics[0] ? `recurring issues with ${topics[0]}` : 'recurring frustration';
    if (!updatedProfile.interests.topConcerns.includes(concernText)) {
      updatedProfile.interests.topConcerns = [...updatedProfile.interests.topConcerns, concernText].slice(-10);
    }
  }

  return { summary, updatedProfile };
}

export function extractProjectMentions(
  message: string,
  profile: UserMemoryProfile,
  projectList: Array<{ id: string; name: string }>
): UserMemoryProfile {
  const updated = { ...profile };

  for (const project of projectList) {
    if (message.toLowerCase().includes(project.name.toLowerCase())) {
      const existing = updated.projectMemories.find(p => p.projectId === project.id);

      if (existing) {
        existing.mentionCount += 1;
        existing.lastMentioned = new Date().toISOString();

        const facts: string[] = [];
        const retainageMatch = message.match(/retainage[^\d]*(\d+)%/i);
        if (retainageMatch) facts.push(`Retainage: ${retainageMatch[1]}%`);
        const ownerMatch = message.match(/owner[^.]*?is\s+([^.,]+)/i);
        if (ownerMatch) facts.push(`Owner context: ${ownerMatch[1].trim()}`);

        const frustration = /\b(frustrated|problem|issue|wrong|behind|late|overdue|holding|waiting on|slow|delayed)\b/i;
        if (frustration.test(message)) existing.userSentiment = 'frustrated';

        for (const fact of facts) {
          if (!existing.knownFacts.includes(fact)) {
            existing.knownFacts = [...existing.knownFacts, fact].slice(-10);
          }
        }
      } else {
        updated.projectMemories.push({
          projectId: project.id,
          projectName: project.name,
          mentionCount: 1,
          lastMentioned: new Date().toISOString(),
          knownFacts: [],
          openIssues: [],
          resolvedTopics: [],
          userSentiment: 'neutral',
        });
      }
    }
  }

  return updated;
}
