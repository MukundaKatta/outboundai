export const PLANS = {
  free: {
    name: "Free",
    monthlyEmailLimit: 100,
    maxCampaigns: 1,
    maxProspects: 100,
    features: ["basic_sequences", "manual_sending"],
    price: 0,
  },
  starter: {
    name: "Starter",
    monthlyEmailLimit: 1000,
    maxCampaigns: 5,
    maxProspects: 2500,
    features: ["basic_sequences", "auto_sending", "enrichment", "reply_classification"],
    price: 49,
  },
  professional: {
    name: "Professional",
    monthlyEmailLimit: 10000,
    maxCampaigns: 25,
    maxProspects: 25000,
    features: [
      "basic_sequences",
      "auto_sending",
      "enrichment",
      "reply_classification",
      "ai_writing",
      "ab_testing",
      "objection_handling",
      "meeting_booking",
      "analytics",
    ],
    price: 149,
  },
  enterprise: {
    name: "Enterprise",
    monthlyEmailLimit: 100000,
    maxCampaigns: -1,
    maxProspects: -1,
    features: [
      "basic_sequences",
      "auto_sending",
      "enrichment",
      "reply_classification",
      "ai_writing",
      "ab_testing",
      "objection_handling",
      "meeting_booking",
      "analytics",
      "crm_integration",
      "custom_models",
      "dedicated_ip",
    ],
    price: 499,
  },
} as const;

export const SEQUENCE_DELAYS = {
  first_follow_up: 3,
  second_follow_up: 5,
  third_follow_up: 7,
  break_up: 14,
} as const;

export const EMAIL_SEND_WINDOW = {
  defaultStart: "08:00",
  defaultEnd: "18:00",
  defaultDays: [1, 2, 3, 4, 5], // Mon-Fri
  defaultTimezone: "America/New_York",
} as const;

export const PROSPECT_STATUSES_DISPLAY: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: "gray" },
  enriched: { label: "Enriched", color: "blue" },
  contacted: { label: "Contacted", color: "yellow" },
  replied: { label: "Replied", color: "purple" },
  interested: { label: "Interested", color: "green" },
  meeting_booked: { label: "Meeting Booked", color: "emerald" },
  won: { label: "Won", color: "teal" },
  lost: { label: "Lost", color: "red" },
  unsubscribed: { label: "Unsubscribed", color: "slate" },
};

export const REPLY_CLASSIFICATIONS_DISPLAY: Record<string, { label: string; color: string }> = {
  interested: { label: "Interested", color: "green" },
  not_interested: { label: "Not Interested", color: "red" },
  objection: { label: "Objection", color: "orange" },
  out_of_office: { label: "Out of Office", color: "blue" },
  unsubscribe: { label: "Unsubscribe", color: "gray" },
  referral: { label: "Referral", color: "purple" },
  question: { label: "Question", color: "yellow" },
  other: { label: "Other", color: "slate" },
};
