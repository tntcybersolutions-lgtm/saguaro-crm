-- ═══════════════════════════════════════════════════════════════════════
-- SAGE v6 — NUCLEAR DATABASE SCHEMA
-- Migration 027 — Full intelligence layer
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════
-- MASTER USER INTELLIGENCE PROFILE
-- Everything Sage learns about a person
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS sage_user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,

  -- ── IDENTITY ──────────────────────────
  first_name text,
  last_name text,
  full_name text,
  preferred_name text,
  nickname text,
  title text,
  role text,
  company text,
  company_size text,
  office_location text,
  timezone text,
  years_in_construction integer,
  how_they_got_into_construction text,
  license_types text[] DEFAULT '{}',
  certifications text[] DEFAULT '{}',
  union_or_open_shop text,
  markets_worked text[] DEFAULT '{}',
  specialties text[] DEFAULT '{}',

  -- ── BUSINESS INTELLIGENCE ─────────────
  annual_volume_estimate text,
  annual_volume_range_low numeric,
  annual_volume_range_high numeric,
  typical_project_size_low numeric,
  typical_project_size_high numeric,
  typical_project_duration_months integer,
  primary_project_types text[] DEFAULT '{}',
  delivery_methods_used text[] DEFAULT '{}',
  typical_team_size text,
  number_of_active_projects integer DEFAULT 0,
  number_of_employees_estimate text,
  bonding_capacity_estimate text,
  typical_retainage_rate numeric DEFAULT 10,
  typical_markup_percent numeric,
  typical_overhead_percent numeric,
  software_before_saguaro text[] DEFAULT '{}',
  reason_for_switching text,
  biggest_competitor text,
  how_they_win_work text,

  -- ── FINANCIAL INTELLIGENCE ────────────
  cash_flow_sensitivity text,
  retainage_pain_level text,
  typical_payment_cycle_days integer,
  billing_type_preference text,
  uses_bonding boolean DEFAULT false,
  bonding_single_limit text,
  bonding_aggregate_limit text,
  avg_bid_margin_percent numeric,
  avg_win_rate_percent numeric,
  bids_won integer DEFAULT 0,
  bids_lost integer DEFAULT 0,
  bids_no_bid integer DEFAULT 0,
  total_contract_value_managed numeric DEFAULT 0,

  -- ── PROJECT HISTORY ───────────────────
  active_project_names text[] DEFAULT '{}',
  active_project_ids uuid[] DEFAULT '{}',
  active_project_values numeric[] DEFAULT '{}',
  completed_project_names text[] DEFAULT '{}',
  problematic_projects_mentioned text[] DEFAULT '{}',
  successful_projects_mentioned text[] DEFAULT '{}',
  total_projects_managed integer DEFAULT 0,

  -- ── SUB & VENDOR INTELLIGENCE ─────────
  trusted_subs_mentioned text[] DEFAULT '{}',
  problematic_subs_mentioned text[] DEFAULT '{}',
  preferred_material_suppliers text[] DEFAULT '{}',
  sub_management_style text,
  typical_sub_count_per_project integer,

  -- ── COMMUNICATION DNA ─────────────────
  communication_style text DEFAULT 'unknown',
  language_formality integer DEFAULT 5,
  preferred_response_length text DEFAULT 'medium',
  uses_construction_slang boolean DEFAULT false,
  uses_abbreviations boolean DEFAULT false,
  uses_emojis boolean DEFAULT false,
  writes_in_all_caps boolean DEFAULT false,
  typical_message_length_chars integer DEFAULT 0,
  messages_per_session_avg numeric DEFAULT 0,
  response_time_preference text DEFAULT 'fast',
  prefers_bullet_points boolean DEFAULT false,
  prefers_prose boolean DEFAULT true,
  prefers_numbered_steps boolean DEFAULT false,
  asks_follow_up_questions boolean DEFAULT false,
  vocabulary_level text DEFAULT 'professional',
  humor_appreciation integer DEFAULT 5,
  directness_preference integer DEFAULT 7,

  -- ── BEHAVIORAL PATTERNS ───────────────
  typically_uses_sage_for text[] DEFAULT '{}',
  time_of_day_usually_active text,
  device_usually_uses text,
  how_they_phrase_questions text,
  follow_up_habit text,

  -- ── KNOWLEDGE LEVEL ───────────────────
  construction_expertise_level text DEFAULT 'expert',
  technology_comfort_level text DEFAULT 'medium',
  financial_sophistication text DEFAULT 'medium',
  legal_knowledge_level text DEFAULT 'medium',
  estimating_skill_level text DEFAULT 'medium',

  -- ── PAIN POINTS & GOALS ───────────────
  primary_pain_points text[] DEFAULT '{}',
  secondary_pain_points text[] DEFAULT '{}',
  stated_goals text[] DEFAULT '{}',
  unstated_goals text[] DEFAULT '{}',
  biggest_win_mentioned text,
  biggest_loss_mentioned text,
  biggest_fear_mentioned text,
  what_keeps_them_up_at_night text,

  -- ── SAGE RELATIONSHIP ─────────────────
  sage_notes text,
  sage_observations text,
  sage_hypothesis text,
  last_topic text,
  last_concern text,
  last_project_discussed text,
  last_question_asked text,
  open_loops text[] DEFAULT '{}',
  unresolved_problems text[] DEFAULT '{}',
  pending_follow_ups text[] DEFAULT '{}',

  -- ── SENTIMENT & SATISFACTION ──────────
  overall_sentiment text DEFAULT 'neutral',
  current_stress_level integer DEFAULT 5,
  satisfaction_with_saguaro integer DEFAULT 7,
  satisfaction_trend text DEFAULT 'stable',
  frustration_triggers text[] DEFAULT '{}',
  delight_triggers text[] DEFAULT '{}',
  churn_risk text DEFAULT 'low',

  -- ── ENGAGEMENT METRICS ────────────────
  first_seen_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  total_sessions integer DEFAULT 0,
  total_messages_sent integer DEFAULT 0,
  total_messages_received integer DEFAULT 0,
  avg_session_length_minutes numeric DEFAULT 0,
  avg_messages_per_session numeric DEFAULT 0,
  longest_session_minutes integer DEFAULT 0,
  longest_streak_days integer DEFAULT 0,
  current_streak_days integer DEFAULT 0,
  days_since_last_visit integer DEFAULT 0,
  last_feature_used text,
  most_used_feature text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- ═══════════════════════════════════════
-- CONVERSATION HISTORY
-- Every message, every session, 3 months rolling
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS sage_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  session_id uuid NOT NULL,
  message_index integer NOT NULL,

  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  content_length integer GENERATED ALWAYS AS (length(content)) STORED,

  -- Context at message time
  page_context text,
  project_id uuid,
  project_name text,
  feature_context text,
  url_path text,

  -- Intelligence classification
  message_intent text,
  primary_topic text,
  topic_tags text[] DEFAULT '{}',
  sentiment text DEFAULT 'neutral',
  sentiment_score numeric DEFAULT 0,
  urgency_level text DEFAULT 'normal',

  -- Content flags
  contains_math_question boolean DEFAULT false,
  contains_complaint boolean DEFAULT false,
  contains_praise boolean DEFAULT false,
  contains_personal_info boolean DEFAULT false,
  contains_project_name boolean DEFAULT false,
  contains_dollar_amount boolean DEFAULT false,
  contains_deadline boolean DEFAULT false,
  contains_risk_indicator boolean DEFAULT false,

  -- Response quality
  was_helpful boolean,
  thumbs_up boolean DEFAULT false,
  thumbs_down boolean DEFAULT false,
  feedback_note text,
  follow_up_needed boolean DEFAULT false,

  -- Performance
  tokens_used integer,
  response_time_ms integer,
  model_used text,

  created_at timestamptz DEFAULT now()
);

-- ═══════════════════════════════════════
-- SESSION SUMMARIES
-- Deep analysis of every conversation
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS sage_session_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  session_id uuid NOT NULL UNIQUE,

  -- Headlines
  one_line_summary text,
  full_summary text,

  -- Content inventory
  topics_discussed text[] DEFAULT '{}',
  projects_mentioned text[] DEFAULT '{}',
  subs_mentioned text[] DEFAULT '{}',
  owners_mentioned text[] DEFAULT '{}',
  dollar_amounts_discussed text[] DEFAULT '{}',
  deadlines_mentioned text[] DEFAULT '{}',

  -- Problem tracking
  problems_raised text[] DEFAULT '{}',
  problems_resolved text[] DEFAULT '{}',
  problems_still_open text[] DEFAULT '{}',
  risks_identified text[] DEFAULT '{}',

  -- Decision tracking
  decisions_made text[] DEFAULT '{}',
  advice_given text[] DEFAULT '{}',
  calculations_performed text[] DEFAULT '{}',
  documents_drafted text[] DEFAULT '{}',

  -- Question tracking
  questions_asked text[] DEFAULT '{}',
  questions_answered text[] DEFAULT '{}',
  questions_unanswered text[] DEFAULT '{}',

  -- Intelligence extracted
  pain_points_expressed text[] DEFAULT '{}',
  frustrations_expressed text[] DEFAULT '{}',
  wins_celebrated text[] DEFAULT '{}',
  goals_mentioned text[] DEFAULT '{}',
  fears_expressed text[] DEFAULT '{}',
  features_discussed text[] DEFAULT '{}',
  features_praised text[] DEFAULT '{}',
  features_complained_about text[] DEFAULT '{}',
  competitors_mentioned text[] DEFAULT '{}',

  -- Profile updates learned
  name_learned text,
  role_learned text,
  company_learned text,
  new_fact_learned text,
  communication_style_observed text,
  vocabulary_observed text,
  expertise_level_observed text,

  -- Follow-up plan
  follow_up_worthy boolean DEFAULT false,
  follow_up_question text,
  follow_up_urgency text DEFAULT 'low',
  follow_up_best_timing text,
  open_loops_created text[] DEFAULT '{}',
  proactive_insights_to_generate text[] DEFAULT '{}',

  -- Sentiment
  session_sentiment text DEFAULT 'neutral',
  sentiment_arc text,
  satisfaction_score integer,
  stress_indicators text[] DEFAULT '{}',

  -- Stats
  message_count integer DEFAULT 0,
  user_message_count integer DEFAULT 0,
  avg_user_message_length integer DEFAULT 0,
  session_duration_minutes numeric DEFAULT 0,
  topics_per_minute numeric DEFAULT 0,

  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ═══════════════════════════════════════
-- PROACTIVE INSIGHTS QUEUE
-- Things Sage is waiting to say
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS sage_proactive_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,

  insight_type text NOT NULL,
  priority integer DEFAULT 5,
  urgency text DEFAULT 'medium',

  title text NOT NULL,
  message text NOT NULL,
  detail text,
  action_suggestion text,

  related_project text,
  related_project_id uuid,
  related_feature text,
  related_amount numeric,
  related_deadline date,
  source_session_id uuid,
  trigger_type text,

  -- Delivery tracking
  delivered boolean DEFAULT false,
  delivered_at timestamptz,
  delivery_context text,
  dismissed boolean DEFAULT false,
  dismissed_at timestamptz,
  user_reacted boolean DEFAULT false,
  user_reaction text,
  user_acted_on_it boolean DEFAULT false,

  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ═══════════════════════════════════════
-- KNOWLEDGE BASE
-- Hard facts Sage has learned about this user
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS sage_knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,

  category text NOT NULL,
  subcategory text,
  key text NOT NULL,
  value text NOT NULL,
  value_type text DEFAULT 'text',

  confidence numeric DEFAULT 1.0,
  source_session_id uuid,
  source_type text,

  times_confirmed integer DEFAULT 1,
  times_contradicted integer DEFAULT 0,
  last_confirmed_at timestamptz DEFAULT now(),
  last_contradicted_at timestamptz,
  is_active boolean DEFAULT true,

  expires_at timestamptz,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ═══════════════════════════════════════
-- REAL-TIME TRIGGER LOG
-- Platform events that generate insights
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS sage_trigger_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  project_id uuid,

  trigger_type text NOT NULL,
  trigger_data jsonb DEFAULT '{}',
  insight_generated boolean DEFAULT false,
  insight_id uuid REFERENCES sage_proactive_insights(id),

  created_at timestamptz DEFAULT now()
);

-- ═══════════════════════════════════════
-- SAGE PERFORMANCE ANALYTICS
-- Track how well Sage is actually performing
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS sage_performance_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  session_id uuid,

  metric_type text NOT NULL,
  metric_value numeric,
  context jsonb DEFAULT '{}',

  created_at timestamptz DEFAULT now()
);

-- ═══════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_sage_conv_user_date
  ON sage_conversations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sage_conv_session
  ON sage_conversations(session_id, message_index);
CREATE INDEX IF NOT EXISTS idx_sage_conv_intent
  ON sage_conversations(message_intent);
CREATE INDEX IF NOT EXISTS idx_sage_sessions_user_date
  ON sage_session_summaries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sage_insights_pending
  ON sage_proactive_insights(user_id, priority DESC)
  WHERE delivered = false AND dismissed = false;
CREATE INDEX IF NOT EXISTS idx_sage_kb_user_cat
  ON sage_knowledge_base(user_id, category, key);
CREATE INDEX IF NOT EXISTS idx_sage_kb_active
  ON sage_knowledge_base(user_id)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sage_triggers_user
  ON sage_trigger_events(user_id, created_at DESC);

-- ═══════════════════════════════════════
-- AUTO-CLEANUP (3 month rolling window)
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION cleanup_sage_v6()
RETURNS void AS $$
BEGIN
  DELETE FROM sage_conversations
    WHERE created_at < now() - INTERVAL '3 months';
  DELETE FROM sage_session_summaries
    WHERE created_at < now() - INTERVAL '3 months';
  DELETE FROM sage_trigger_events
    WHERE created_at < now() - INTERVAL '3 months';
  DELETE FROM sage_proactive_insights
    WHERE (expires_at IS NOT NULL AND expires_at < now())
      OR (delivered = true AND delivered_at < now() - INTERVAL '30 days');
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════
ALTER TABLE sage_user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sage_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sage_session_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE sage_proactive_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE sage_knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE sage_trigger_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sage_performance_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_profile" ON sage_user_profiles
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own_conv" ON sage_conversations
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own_sessions" ON sage_session_summaries
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own_insights" ON sage_proactive_insights
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own_kb" ON sage_knowledge_base
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own_triggers" ON sage_trigger_events
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own_perf" ON sage_performance_log
  FOR ALL USING (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
