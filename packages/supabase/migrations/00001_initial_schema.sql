-- OutboundAI Database Schema
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ─── Organizations ──────────────────────────────────────────────────────────

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  domain TEXT,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'professional', 'enterprise')),
  monthly_email_limit INTEGER NOT NULL DEFAULT 100,
  emails_sent_this_month INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_owner ON organizations(owner_user_id);
CREATE INDEX idx_organizations_stripe ON organizations(stripe_customer_id);

-- ─── Organization Members ───────────────────────────────────────────────────

CREATE TABLE org_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX idx_org_members_user ON org_members(user_id);
CREATE INDEX idx_org_members_org ON org_members(org_id);

-- ─── ICP Profiles ───────────────────────────────────────────────────────────

CREATE TABLE icp_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  target_titles TEXT[] NOT NULL DEFAULT '{}',
  target_industries TEXT[] NOT NULL DEFAULT '{}',
  target_company_sizes TEXT[] NOT NULL DEFAULT '{}',
  target_locations TEXT[] NOT NULL DEFAULT '{}',
  pain_points TEXT[] NOT NULL DEFAULT '{}',
  value_propositions TEXT[] NOT NULL DEFAULT '{}',
  keywords TEXT[] NOT NULL DEFAULT '{}',
  exclude_domains TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_icp_profiles_org ON icp_profiles(org_id);

-- ─── Writing Samples ────────────────────────────────────────────────────────

CREATE TABLE writing_samples (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT 'professional' CHECK (tone IN ('professional', 'casual', 'friendly', 'authoritative', 'conversational')),
  example_emails TEXT[] NOT NULL DEFAULT '{}',
  guidelines TEXT,
  signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_writing_samples_org ON writing_samples(org_id);

-- ─── Prospects ──────────────────────────────────────────────────────────────

CREATE TABLE prospects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  title TEXT,
  company_name TEXT,
  company_domain TEXT,
  company_size TEXT,
  industry TEXT,
  linkedin_url TEXT,
  phone TEXT,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
    'new', 'enriched', 'contacted', 'replied', 'interested',
    'meeting_booked', 'won', 'lost', 'unsubscribed'
  )),
  enrichment_data JSONB,
  recent_posts TEXT[],
  mutual_connections TEXT[],
  embedding VECTOR(1536),
  tags TEXT[] NOT NULL DEFAULT '{}',
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, email)
);

CREATE INDEX idx_prospects_org ON prospects(org_id);
CREATE INDEX idx_prospects_status ON prospects(org_id, status);
CREATE INDEX idx_prospects_company ON prospects(company_domain);
CREATE INDEX idx_prospects_email ON prospects(email);
CREATE INDEX idx_prospects_tags ON prospects USING GIN(tags);

-- ─── Campaigns ──────────────────────────────────────────────────────────────

CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  icp_profile_id UUID REFERENCES icp_profiles(id) ON DELETE SET NULL,
  writing_sample_id UUID REFERENCES writing_samples(id) ON DELETE SET NULL,
  daily_send_limit INTEGER NOT NULL DEFAULT 50,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  send_window_start TEXT NOT NULL DEFAULT '08:00',
  send_window_end TEXT NOT NULL DEFAULT '18:00',
  send_days INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}',
  total_prospects INTEGER NOT NULL DEFAULT 0,
  total_sent INTEGER NOT NULL DEFAULT 0,
  total_opened INTEGER NOT NULL DEFAULT 0,
  total_replied INTEGER NOT NULL DEFAULT 0,
  total_meetings INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaigns_org ON campaigns(org_id);
CREATE INDEX idx_campaigns_status ON campaigns(org_id, status);

-- ─── Campaign Prospects (junction table) ────────────────────────────────────

CREATE TABLE campaign_prospects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  current_step INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'completed', 'bounced', 'unsubscribed')),
  next_send_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(campaign_id, prospect_id)
);

CREATE INDEX idx_campaign_prospects_campaign ON campaign_prospects(campaign_id);
CREATE INDEX idx_campaign_prospects_prospect ON campaign_prospects(prospect_id);
CREATE INDEX idx_campaign_prospects_next_send ON campaign_prospects(next_send_at) WHERE status = 'active';

-- ─── Sequences ──────────────────────────────────────────────────────────────

CREATE TABLE sequences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sequences_campaign ON sequences(campaign_id);
CREATE INDEX idx_sequences_org ON sequences(org_id);

-- ─── Sequence Steps ─────────────────────────────────────────────────────────

CREATE TABLE sequence_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sequence_id UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_type TEXT NOT NULL DEFAULT 'email' CHECK (step_type IN ('email', 'follow_up', 'linkedin', 'manual_task')),
  delay_days INTEGER NOT NULL DEFAULT 0,
  subject_template TEXT,
  body_template TEXT,
  ai_generated BOOLEAN NOT NULL DEFAULT true,
  ab_test_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sequence_id, step_number)
);

CREATE INDEX idx_sequence_steps_sequence ON sequence_steps(sequence_id);

-- ─── A/B Tests ──────────────────────────────────────────────────────────────

CREATE TABLE ab_tests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  step_id UUID NOT NULL REFERENCES sequence_steps(id) ON DELETE CASCADE,
  variant_a_subject TEXT NOT NULL,
  variant_a_body TEXT NOT NULL,
  variant_b_subject TEXT NOT NULL,
  variant_b_body TEXT NOT NULL,
  variant_a_sent INTEGER NOT NULL DEFAULT 0,
  variant_b_sent INTEGER NOT NULL DEFAULT 0,
  variant_a_opened INTEGER NOT NULL DEFAULT 0,
  variant_b_opened INTEGER NOT NULL DEFAULT 0,
  variant_a_replied INTEGER NOT NULL DEFAULT 0,
  variant_b_replied INTEGER NOT NULL DEFAULT 0,
  winner TEXT CHECK (winner IN ('a', 'b')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Update sequence_steps FK
ALTER TABLE sequence_steps
  ADD CONSTRAINT fk_ab_test FOREIGN KEY (ab_test_id) REFERENCES ab_tests(id) ON DELETE SET NULL;

CREATE INDEX idx_ab_tests_org ON ab_tests(org_id);
CREATE INDEX idx_ab_tests_step ON ab_tests(step_id);

-- ─── Emails Sent ────────────────────────────────────────────────────────────

CREATE TABLE emails_sent (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES sequence_steps(id) ON DELETE CASCADE,
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
  sendgrid_message_id TEXT,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_emails_sent_org ON emails_sent(org_id);
CREATE INDEX idx_emails_sent_prospect ON emails_sent(prospect_id);
CREATE INDEX idx_emails_sent_campaign ON emails_sent(campaign_id);
CREATE INDEX idx_emails_sent_status ON emails_sent(status);
CREATE INDEX idx_emails_sent_sendgrid ON emails_sent(sendgrid_message_id);
CREATE INDEX idx_emails_sent_date ON emails_sent(sent_at);

-- ─── Email Replies ──────────────────────────────────────────────────────────

CREATE TABLE email_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email_sent_id UUID NOT NULL REFERENCES emails_sent(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  from_email TEXT NOT NULL,
  subject TEXT,
  body_text TEXT NOT NULL,
  body_html TEXT,
  classification TEXT CHECK (classification IN (
    'interested', 'not_interested', 'objection', 'out_of_office',
    'unsubscribe', 'referral', 'question', 'other'
  )),
  sentiment_score REAL,
  ai_suggested_response TEXT,
  is_handled BOOLEAN NOT NULL DEFAULT false,
  handled_at TIMESTAMPTZ,
  nylas_message_id TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_replies_org ON email_replies(org_id);
CREATE INDEX idx_email_replies_prospect ON email_replies(prospect_id);
CREATE INDEX idx_email_replies_campaign ON email_replies(campaign_id);
CREATE INDEX idx_email_replies_classification ON email_replies(classification);
CREATE INDEX idx_email_replies_unhandled ON email_replies(org_id) WHERE is_handled = false;

-- ─── Meetings Booked ────────────────────────────────────────────────────────

CREATE TABLE meetings_booked (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  meeting_link TEXT,
  calendar_event_id TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'no_show', 'cancelled', 'rescheduled')),
  outcome_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_meetings_org ON meetings_booked(org_id);
CREATE INDEX idx_meetings_prospect ON meetings_booked(prospect_id);
CREATE INDEX idx_meetings_status ON meetings_booked(status);
CREATE INDEX idx_meetings_time ON meetings_booked(start_time);

-- ─── Integrations ───────────────────────────────────────────────────────────

CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('sendgrid', 'nylas', 'apollo', 'clearbit', 'google_calendar', 'stripe', 'salesforce', 'hubspot')),
  is_connected BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}',
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, type)
);

CREATE INDEX idx_integrations_org ON integrations(org_id);

-- ─── Updated At Trigger ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_prospects_updated_at BEFORE UPDATE ON prospects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sequences_updated_at BEFORE UPDATE ON sequences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_icp_profiles_updated_at BEFORE UPDATE ON icp_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_writing_samples_updated_at BEFORE UPDATE ON writing_samples
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_meetings_updated_at BEFORE UPDATE ON meetings_booked
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails_sent ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings_booked ENABLE ROW LEVEL SECURITY;
ALTER TABLE icp_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE writing_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

-- Helper function: get user's org IDs
CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS SETOF UUID AS $$
  SELECT org_id FROM org_members WHERE user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Organizations: users can see orgs they belong to
CREATE POLICY "Users can view their organizations"
  ON organizations FOR SELECT
  USING (id IN (SELECT get_user_org_ids()));

CREATE POLICY "Users can update their organizations"
  ON organizations FOR UPDATE
  USING (id IN (SELECT get_user_org_ids()));

-- Org Members
CREATE POLICY "Users can view members of their orgs"
  ON org_members FOR SELECT
  USING (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY "Admins can manage members"
  ON org_members FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Generic org-scoped policies for all main tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'prospects', 'campaigns', 'sequences', 'emails_sent',
      'email_replies', 'meetings_booked', 'icp_profiles',
      'writing_samples', 'ab_tests', 'integrations'
    ])
  LOOP
    EXECUTE format(
      'CREATE POLICY "org_select_%s" ON %I FOR SELECT USING (org_id IN (SELECT get_user_org_ids()))',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY "org_insert_%s" ON %I FOR INSERT WITH CHECK (org_id IN (SELECT get_user_org_ids()))',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY "org_update_%s" ON %I FOR UPDATE USING (org_id IN (SELECT get_user_org_ids()))',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY "org_delete_%s" ON %I FOR DELETE USING (org_id IN (SELECT get_user_org_ids()))',
      tbl, tbl
    );
  END LOOP;
END $$;

-- Campaign prospects: access via campaign
CREATE POLICY "org_select_campaign_prospects" ON campaign_prospects
  FOR SELECT USING (
    campaign_id IN (SELECT id FROM campaigns WHERE org_id IN (SELECT get_user_org_ids()))
  );
CREATE POLICY "org_insert_campaign_prospects" ON campaign_prospects
  FOR INSERT WITH CHECK (
    campaign_id IN (SELECT id FROM campaigns WHERE org_id IN (SELECT get_user_org_ids()))
  );
CREATE POLICY "org_update_campaign_prospects" ON campaign_prospects
  FOR UPDATE USING (
    campaign_id IN (SELECT id FROM campaigns WHERE org_id IN (SELECT get_user_org_ids()))
  );
CREATE POLICY "org_delete_campaign_prospects" ON campaign_prospects
  FOR DELETE USING (
    campaign_id IN (SELECT id FROM campaigns WHERE org_id IN (SELECT get_user_org_ids()))
  );

-- Sequence steps: access via sequence
CREATE POLICY "org_select_sequence_steps" ON sequence_steps
  FOR SELECT USING (
    sequence_id IN (SELECT id FROM sequences WHERE org_id IN (SELECT get_user_org_ids()))
  );
CREATE POLICY "org_insert_sequence_steps" ON sequence_steps
  FOR INSERT WITH CHECK (
    sequence_id IN (SELECT id FROM sequences WHERE org_id IN (SELECT get_user_org_ids()))
  );
CREATE POLICY "org_update_sequence_steps" ON sequence_steps
  FOR UPDATE USING (
    sequence_id IN (SELECT id FROM sequences WHERE org_id IN (SELECT get_user_org_ids()))
  );
CREATE POLICY "org_delete_sequence_steps" ON sequence_steps
  FOR DELETE USING (
    sequence_id IN (SELECT id FROM sequences WHERE org_id IN (SELECT get_user_org_ids()))
  );

-- ─── Useful Views ───────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW campaign_analytics AS
SELECT
  c.id AS campaign_id,
  c.name AS campaign_name,
  c.org_id,
  c.total_prospects,
  c.total_sent AS emails_sent,
  COALESCE(SUM(CASE WHEN es.status IN ('delivered','opened','clicked') THEN 1 ELSE 0 END), 0) AS emails_delivered,
  COALESCE(SUM(CASE WHEN es.status IN ('opened','clicked') THEN 1 ELSE 0 END), 0) AS emails_opened,
  COALESCE(SUM(CASE WHEN es.status = 'clicked' THEN 1 ELSE 0 END), 0) AS emails_clicked,
  COALESCE(SUM(CASE WHEN es.status = 'bounced' THEN 1 ELSE 0 END), 0) AS emails_bounced,
  (SELECT COUNT(*) FROM email_replies er WHERE er.campaign_id = c.id) AS replies_total,
  (SELECT COUNT(*) FROM email_replies er WHERE er.campaign_id = c.id AND er.classification = 'interested') AS replies_interested,
  (SELECT COUNT(*) FROM meetings_booked mb WHERE mb.campaign_id = c.id) AS meetings_booked,
  (SELECT COUNT(*) FROM meetings_booked mb WHERE mb.campaign_id = c.id AND mb.status = 'completed') AS meetings_completed
FROM campaigns c
LEFT JOIN emails_sent es ON es.campaign_id = c.id
GROUP BY c.id, c.name, c.org_id, c.total_prospects, c.total_sent;

-- ─── Functions for daily metrics ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_daily_metrics(
  p_org_id UUID,
  p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  metric_date DATE,
  emails_sent BIGINT,
  emails_opened BIGINT,
  replies BIGINT,
  meetings BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH dates AS (
    SELECT generate_series(p_start_date, p_end_date, '1 day'::interval)::date AS d
  )
  SELECT
    dates.d AS metric_date,
    COALESCE((SELECT COUNT(*) FROM emails_sent es WHERE es.org_id = p_org_id AND es.sent_at::date = dates.d), 0) AS emails_sent,
    COALESCE((SELECT COUNT(*) FROM emails_sent es WHERE es.org_id = p_org_id AND es.opened_at::date = dates.d), 0) AS emails_opened,
    COALESCE((SELECT COUNT(*) FROM email_replies er WHERE er.org_id = p_org_id AND er.received_at::date = dates.d), 0) AS replies,
    COALESCE((SELECT COUNT(*) FROM meetings_booked mb WHERE mb.org_id = p_org_id AND mb.created_at::date = dates.d), 0) AS meetings
  FROM dates
  ORDER BY dates.d;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
