// ─── Organization ───────────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  domain: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: "free" | "starter" | "professional" | "enterprise";
  monthly_email_limit: number;
  emails_sent_this_month: number;
  created_at: string;
  updated_at: string;
}

// ─── Prospect ───────────────────────────────────────────────────────────────

export type ProspectStatus =
  | "new"
  | "enriched"
  | "contacted"
  | "replied"
  | "interested"
  | "meeting_booked"
  | "won"
  | "lost"
  | "unsubscribed";

export interface Prospect {
  id: string;
  org_id: string;
  email: string;
  first_name: string;
  last_name: string;
  title: string | null;
  company_name: string | null;
  company_domain: string | null;
  company_size: string | null;
  industry: string | null;
  linkedin_url: string | null;
  phone: string | null;
  location: string | null;
  status: ProspectStatus;
  enrichment_data: Record<string, unknown> | null;
  recent_posts: string[] | null;
  mutual_connections: string[] | null;
  embedding: number[] | null;
  tags: string[];
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProspectCreateInput {
  email: string;
  first_name: string;
  last_name: string;
  title?: string;
  company_name?: string;
  company_domain?: string;
  linkedin_url?: string;
  phone?: string;
  location?: string;
  tags?: string[];
}

// ─── Campaign ───────────────────────────────────────────────────────────────

export type CampaignStatus = "draft" | "active" | "paused" | "completed" | "archived";

export interface Campaign {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  icp_profile_id: string | null;
  daily_send_limit: number;
  timezone: string;
  send_window_start: string; // HH:MM
  send_window_end: string;   // HH:MM
  send_days: number[];       // 0=Sun, 1=Mon, ...
  total_prospects: number;
  total_sent: number;
  total_opened: number;
  total_replied: number;
  total_meetings: number;
  created_at: string;
  updated_at: string;
}

// ─── Sequence ───────────────────────────────────────────────────────────────

export interface Sequence {
  id: string;
  org_id: string;
  campaign_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  steps: SequenceStep[];
}

export type SequenceStepType = "email" | "follow_up" | "linkedin" | "manual_task";

export interface SequenceStep {
  id: string;
  sequence_id: string;
  step_number: number;
  step_type: SequenceStepType;
  delay_days: number;
  subject_template: string | null;
  body_template: string | null;
  ai_generated: boolean;
  ab_test_id: string | null;
  created_at: string;
}

// ─── Email ──────────────────────────────────────────────────────────────────

export type EmailStatus = "queued" | "sent" | "delivered" | "opened" | "clicked" | "bounced" | "failed";

export interface EmailSent {
  id: string;
  org_id: string;
  prospect_id: string;
  campaign_id: string;
  sequence_id: string;
  step_id: string;
  from_email: string;
  to_email: string;
  subject: string;
  body_html: string;
  body_text: string;
  status: EmailStatus;
  sendgrid_message_id: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  sent_at: string | null;
  created_at: string;
}

export type ReplyClassification =
  | "interested"
  | "not_interested"
  | "objection"
  | "out_of_office"
  | "unsubscribe"
  | "referral"
  | "question"
  | "other";

export interface EmailReply {
  id: string;
  org_id: string;
  email_sent_id: string;
  prospect_id: string;
  campaign_id: string;
  from_email: string;
  subject: string;
  body_text: string;
  body_html: string | null;
  classification: ReplyClassification | null;
  sentiment_score: number | null;
  ai_suggested_response: string | null;
  is_handled: boolean;
  handled_at: string | null;
  nylas_message_id: string | null;
  received_at: string;
  created_at: string;
}

// ─── Meeting ────────────────────────────────────────────────────────────────

export type MeetingStatus = "scheduled" | "completed" | "no_show" | "cancelled" | "rescheduled";

export interface MeetingBooked {
  id: string;
  org_id: string;
  prospect_id: string;
  campaign_id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  meeting_link: string | null;
  calendar_event_id: string | null;
  status: MeetingStatus;
  outcome_notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── ICP Profile ────────────────────────────────────────────────────────────

export interface ICPProfile {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  target_titles: string[];
  target_industries: string[];
  target_company_sizes: string[];
  target_locations: string[];
  pain_points: string[];
  value_propositions: string[];
  keywords: string[];
  exclude_domains: string[];
  created_at: string;
  updated_at: string;
}

// ─── Writing Sample ─────────────────────────────────────────────────────────

export interface WritingSample {
  id: string;
  org_id: string;
  name: string;
  tone: "professional" | "casual" | "friendly" | "authoritative" | "conversational";
  example_emails: string[];
  guidelines: string | null;
  signature: string | null;
  created_at: string;
  updated_at: string;
}

// ─── A/B Test ───────────────────────────────────────────────────────────────

export interface ABTest {
  id: string;
  org_id: string;
  name: string;
  step_id: string;
  variant_a_subject: string;
  variant_a_body: string;
  variant_b_subject: string;
  variant_b_body: string;
  variant_a_sent: number;
  variant_b_sent: number;
  variant_a_opened: number;
  variant_b_opened: number;
  variant_a_replied: number;
  variant_b_replied: number;
  winner: "a" | "b" | null;
  is_active: boolean;
  created_at: string;
}

// ─── Analytics ──────────────────────────────────────────────────────────────

export interface CampaignAnalytics {
  campaign_id: string;
  campaign_name: string;
  total_prospects: number;
  emails_sent: number;
  emails_delivered: number;
  emails_opened: number;
  emails_clicked: number;
  emails_bounced: number;
  replies_total: number;
  replies_interested: number;
  replies_not_interested: number;
  replies_objection: number;
  meetings_booked: number;
  meetings_completed: number;
  open_rate: number;
  reply_rate: number;
  meeting_rate: number;
  conversion_rate: number;
}

export interface DailyMetric {
  date: string;
  emails_sent: number;
  emails_opened: number;
  replies: number;
  meetings: number;
}

// ─── Integration ────────────────────────────────────────────────────────────

export type IntegrationType = "sendgrid" | "nylas" | "apollo" | "clearbit" | "google_calendar" | "stripe" | "salesforce" | "hubspot";

export interface Integration {
  id: string;
  org_id: string;
  type: IntegrationType;
  is_connected: boolean;
  config: Record<string, unknown>;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}
