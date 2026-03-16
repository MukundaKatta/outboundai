import { askClaude, askClaudeJSON } from "./claude-client";
import type { Prospect, ICPProfile } from "@outboundai/shared";

export type ObjectionType =
  | "pricing"
  | "timing"
  | "competitor"
  | "authority"
  | "no_need"
  | "too_busy"
  | "bad_experience"
  | "other";

export interface ObjectionResponse {
  responseEmail: string;
  strategy: string;
  alternativeApproaches: string[];
  shouldEscalate: boolean;
  escalationReason?: string;
}

interface ObjectionFramework {
  type: ObjectionType;
  description: string;
  frameworks: string[];
  examples: string[];
}

const OBJECTION_FRAMEWORKS: ObjectionFramework[] = [
  {
    type: "pricing",
    description: "Prospect says it's too expensive or out of budget",
    frameworks: [
      "Reframe as ROI — what is the cost of NOT solving this problem?",
      "Break down to per-user/per-month cost",
      "Offer to start with a smaller scope / pilot",
      "Compare to the cost of the current manual process",
    ],
    examples: [
      "I get it — budget is always a consideration. Quick thought: one of our customers in [industry] calculated they were spending $X/month on [manual process]. We helped them cut that by 60%. Would it be worth a 15-min chat to see if the math works for you too?",
    ],
  },
  {
    type: "timing",
    description: "Prospect says it's not the right time",
    frameworks: [
      "Acknowledge timing, offer value in the meantime",
      "Plant a seed for future engagement",
      "Ask what would make it the right time",
      "Offer a low-commitment next step",
    ],
    examples: [
      "Totally understand the timing. Rather than a full demo, would it be useful if I sent over a quick industry report we just published on [topic]? No commitment — just thought it might be relevant to what you're working on.",
    ],
  },
  {
    type: "competitor",
    description: "Prospect is using or evaluating a competitor",
    frameworks: [
      "Acknowledge competitor strengths, differentiate on specific capabilities",
      "Ask about specific pain points with current solution",
      "Offer comparison data or case studies of switches",
      "Position as complementary rather than replacement",
    ],
    examples: [
      "Good to hear you're already investing in this space — means you understand the value. Out of curiosity, how's [competitor] working for [specific use case]? We've had a few teams switch over specifically because of [differentiator]. Happy to share what they found if that's helpful.",
    ],
  },
  {
    type: "authority",
    description: "Prospect isn't the decision maker",
    frameworks: [
      "Ask for an intro to the right person",
      "Offer to help them build the internal case",
      "Provide materials they can share internally",
      "Position them as a champion",
    ],
    examples: [
      "Appreciate the transparency. Would it be helpful if I put together a one-pager you could share with [decision maker title]? We've found that teams like yours often drive these decisions from the bottom up — and we've got some materials that make it easy to make the case.",
    ],
  },
  {
    type: "no_need",
    description: "Prospect doesn't see the need",
    frameworks: [
      "Ask probing questions about their current process",
      "Share data about hidden costs of the status quo",
      "Reference a peer company that thought the same",
      "Offer a free assessment",
    ],
    examples: [
      "Fair enough — if things are running smoothly, no reason to fix what isn't broken. Just curious though: how are you currently handling [specific pain point]? We've found that teams often don't realize the hidden time cost until they measure it. If you're open to it, we do a quick free assessment that usually surfaces some surprising numbers.",
    ],
  },
  {
    type: "too_busy",
    description: "Prospect is too busy to engage",
    frameworks: [
      "Respect their time explicitly",
      "Offer the lowest-friction next step possible",
      "Send value upfront with no ask",
      "Suggest a very specific, short time window",
    ],
    examples: [
      "100% respect that — I'll keep this brief. Instead of a call, would it be useful if I sent a 2-minute video walkthrough tailored to [company name]'s setup? You can watch it whenever. If it resonates, we'll talk. If not, no hard feelings.",
    ],
  },
  {
    type: "bad_experience",
    description: "Prospect had a bad experience with similar products",
    frameworks: [
      "Acknowledge the bad experience empathetically",
      "Ask what specifically went wrong",
      "Explain how your approach differs",
      "Offer a risk-free trial",
    ],
    examples: [
      "That's frustrating — sorry to hear that. If you don't mind me asking, what specifically didn't work? We've actually built our [feature] specifically because so many people told us about those exact problems with other tools. If you're open to it, we offer a [trial/pilot] with zero commitment so you can see the difference firsthand.",
    ],
  },
  {
    type: "other",
    description: "Other or unclear objection",
    frameworks: [
      "Ask clarifying questions",
      "Restate value proposition differently",
      "Offer to connect with a reference customer",
      "Suggest a no-obligation exploratory call",
    ],
    examples: [],
  },
];

export class ObjectionHandler {
  /**
   * Identify the type of objection from the reply text.
   */
  async identifyObjection(replyText: string): Promise<{
    type: ObjectionType;
    confidence: number;
    details: string;
  }> {
    const result = await askClaudeJSON<{
      type: ObjectionType;
      confidence: number;
      details: string;
    }>(
      "You classify sales objections. Identify the primary objection type.",
      [
        {
          role: "user",
          content: `Classify this objection:

"${replyText}"

Objection types: pricing, timing, competitor, authority, no_need, too_busy, bad_experience, other

Return JSON:
{
  "type": "the_type",
  "confidence": 0.9,
  "details": "Specific details about their objection"
}`,
        },
      ],
    );

    return result;
  }

  /**
   * Generate a response to handle an objection.
   */
  async handleObjection(
    objectionType: ObjectionType,
    replyText: string,
    prospect: Prospect,
    icpProfile: ICPProfile | null,
    senderName: string,
    companyName: string,
  ): Promise<ObjectionResponse> {
    const framework = OBJECTION_FRAMEWORKS.find((f) => f.type === objectionType) ?? OBJECTION_FRAMEWORKS[OBJECTION_FRAMEWORKS.length - 1];

    const systemPrompt = `You are an expert at handling B2B sales objections with empathy and skill.

OBJECTION HANDLING FRAMEWORKS for "${objectionType}":
${framework.frameworks.map((f, i) => `${i + 1}. ${f}`).join("\n")}

${framework.examples.length > 0 ? `EXAMPLE RESPONSES:\n${framework.examples.join("\n\n")}` : ""}

RULES:
1. Never be pushy or dismissive
2. Acknowledge their concern genuinely
3. Provide ONE compelling counter-point
4. End with a low-pressure next step
5. Keep it under 120 words
6. Sound human, not scripted`;

    const userMessage = `Handle this objection from ${prospect.first_name} ${prospect.last_name}, ${prospect.title} at ${prospect.company_name}:

"${replyText}"

${icpProfile ? `Our value propositions: ${icpProfile.value_propositions.join("; ")}` : ""}
${icpProfile ? `Pain points we solve: ${icpProfile.pain_points.join("; ")}` : ""}

Respond as ${senderName} from ${companyName}.

Return JSON:
{
  "responseEmail": "The full email response text",
  "strategy": "Which framework/strategy was used",
  "alternativeApproaches": ["Other approaches if this doesn't work"],
  "shouldEscalate": false,
  "escalationReason": "Only if shouldEscalate is true"
}`;

    const result = await askClaudeJSON<ObjectionResponse>(systemPrompt, [
      { role: "user", content: userMessage },
    ]);

    return result;
  }

  /**
   * Generate multiple response options for human review.
   */
  async generateResponseOptions(
    objectionType: ObjectionType,
    replyText: string,
    prospect: Prospect,
    senderName: string,
    companyName: string,
  ): Promise<{
    options: Array<{
      tone: string;
      response: string;
      approach: string;
    }>;
  }> {
    const systemPrompt = `Generate 3 different response options for a sales objection, each with a different tone and approach.`;

    const userMessage = `Objection type: ${objectionType}
Prospect: ${prospect.first_name} ${prospect.last_name}, ${prospect.title} at ${prospect.company_name}
Their reply: "${replyText}"
Sender: ${senderName} at ${companyName}

Return JSON:
{
  "options": [
    {
      "tone": "empathetic and educational",
      "response": "Full email text",
      "approach": "Brief description of the approach"
    },
    {
      "tone": "direct and value-focused",
      "response": "Full email text",
      "approach": "Brief description"
    },
    {
      "tone": "casual and low-pressure",
      "response": "Full email text",
      "approach": "Brief description"
    }
  ]
}`;

    return askClaudeJSON(systemPrompt, [{ role: "user", content: userMessage }]);
  }
}
