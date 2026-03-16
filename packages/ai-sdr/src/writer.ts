import { askClaude, askClaudeJSON } from "./claude-client";
import type { ResearchResult } from "./researcher";
import type { Prospect, WritingSample, ICPProfile } from "@outboundai/shared";

export interface GeneratedEmail {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  personalizationNotes: string[];
}

export interface EmailVariants {
  variantA: GeneratedEmail;
  variantB: GeneratedEmail;
}

export class EmailWriter {
  /**
   * Generate a hyper-personalized first-touch email.
   */
  async writeFirstEmail(
    prospect: Prospect,
    research: ResearchResult,
    writingSample: WritingSample | null,
    icpProfile: ICPProfile | null,
    senderName: string,
    senderTitle: string,
    companyName: string,
  ): Promise<GeneratedEmail> {
    const systemPrompt = this.buildWriterSystemPrompt(writingSample);

    const userMessage = `Write a personalized first-touch cold email to this prospect.

PROSPECT:
- Name: ${prospect.first_name} ${prospect.last_name}
- Title: ${prospect.title || "Unknown"}
- Company: ${prospect.company_name || "Unknown"}

RESEARCH FINDINGS:
- Summary: ${research.summary}
- Recent Activity: ${research.recentActivity.join("; ")}
- Pain Points: ${research.painPoints.join("; ")}
- Ice Breakers: ${research.iceBreakers.join("; ")}
- Company News: ${research.companyInsights.recentNews.join("; ")}

${icpProfile ? `VALUE PROPOSITIONS: ${icpProfile.value_propositions.join("; ")}` : ""}
${icpProfile ? `PAIN POINTS WE SOLVE: ${icpProfile.pain_points.join("; ")}` : ""}

SENDER:
- Name: ${senderName}
- Title: ${senderTitle}
- Company: ${companyName}

RULES:
1. Subject line: Max 50 chars, no clickbait, create curiosity
2. Opening: Reference something SPECIFIC about the prospect (recent post, company news, achievement)
3. Body: Connect their specific situation to our value prop. Max 150 words.
4. CTA: Soft ask — suggest a brief chat, not a hard sell
5. NO generic phrases like "I hope this email finds you well"
6. NO "I noticed" or "I saw" — just reference the thing naturally
7. Write like a real human, not a marketer
8. Use their first name only

Return JSON:
{
  "subject": "Subject line",
  "bodyHtml": "<p>HTML formatted email body</p>",
  "bodyText": "Plain text version",
  "personalizationNotes": ["What was personalized and why"]
}`;

    return askClaudeJSON<GeneratedEmail>(systemPrompt, [
      { role: "user", content: userMessage },
    ]);
  }

  /**
   * Generate a follow-up email with a different angle.
   */
  async writeFollowUp(
    prospect: Prospect,
    research: ResearchResult,
    previousEmails: { subject: string; body: string }[],
    stepNumber: number,
    writingSample: WritingSample | null,
  ): Promise<GeneratedEmail> {
    const systemPrompt = this.buildWriterSystemPrompt(writingSample);

    const angles = [
      "Share a relevant case study or result",
      "Reference a different pain point",
      "Share a valuable insight or industry trend",
      "Ask a thought-provoking question",
      "Offer something of value (report, analysis, tool)",
      "The friendly breakup email — last attempt",
    ];

    const angle = angles[Math.min(stepNumber - 1, angles.length - 1)];

    const previousEmailsText = previousEmails
      .map((e, i) => `Email ${i + 1}: Subject: "${e.subject}" Body: ${e.body}`)
      .join("\n\n");

    const userMessage = `Write follow-up email #${stepNumber} with angle: "${angle}"

PROSPECT:
- Name: ${prospect.first_name} ${prospect.last_name}
- Title: ${prospect.title || "Unknown"}
- Company: ${prospect.company_name || "Unknown"}

RESEARCH:
- Pain Points: ${research.painPoints.join("; ")}
- Company Insights: ${research.companyInsights.recentNews.join("; ")}

PREVIOUS EMAILS SENT (DO NOT REPEAT):
${previousEmailsText}

RULES:
1. Different angle from previous emails
2. Shorter than the first email (max 100 words)
3. Reference the previous email subtly ("circling back" is BANNED)
4. ${stepNumber >= 4 ? "This is a later follow-up — be brief and direct" : "Keep it conversational"}
5. ${stepNumber >= 5 ? "This is likely the last email — make it a graceful close" : ""}
6. New subject line that creates curiosity
7. Still reference something specific about them

Return JSON:
{
  "subject": "Subject line",
  "bodyHtml": "<p>HTML formatted email body</p>",
  "bodyText": "Plain text version",
  "personalizationNotes": ["What was personalized and why"]
}`;

    return askClaudeJSON<GeneratedEmail>(systemPrompt, [
      { role: "user", content: userMessage },
    ]);
  }

  /**
   * Generate A/B test variants for a step.
   */
  async writeABVariants(
    prospect: Prospect,
    research: ResearchResult,
    writingSample: WritingSample | null,
    icpProfile: ICPProfile | null,
    senderName: string,
    companyName: string,
  ): Promise<EmailVariants> {
    const systemPrompt = this.buildWriterSystemPrompt(writingSample);

    const userMessage = `Generate TWO different email variants for A/B testing.

PROSPECT:
- Name: ${prospect.first_name} ${prospect.last_name}
- Title: ${prospect.title || "Unknown"}
- Company: ${prospect.company_name || "Unknown"}

RESEARCH:
- Summary: ${research.summary}
- Pain Points: ${research.painPoints.join("; ")}
- Ice Breakers: ${research.iceBreakers.join("; ")}

${icpProfile ? `VALUE PROPS: ${icpProfile.value_propositions.join("; ")}` : ""}

SENDER: ${senderName} at ${companyName}

Variant A: Focus on a pain point / problem
Variant B: Focus on an opportunity / positive outcome

Both should be personalized to the prospect. Different subject lines and approaches.

Return JSON:
{
  "variantA": {
    "subject": "Subject A",
    "bodyHtml": "<p>HTML body A</p>",
    "bodyText": "Text body A",
    "personalizationNotes": ["Notes"]
  },
  "variantB": {
    "subject": "Subject B",
    "bodyHtml": "<p>HTML body B</p>",
    "bodyText": "Text body B",
    "personalizationNotes": ["Notes"]
  }
}`;

    return askClaudeJSON<EmailVariants>(systemPrompt, [
      { role: "user", content: userMessage },
    ]);
  }

  /**
   * Rewrite an email with different tone or approach.
   */
  async rewriteEmail(
    originalEmail: GeneratedEmail,
    instruction: string,
    writingSample: WritingSample | null,
  ): Promise<GeneratedEmail> {
    const systemPrompt = this.buildWriterSystemPrompt(writingSample);

    const userMessage = `Rewrite this email with the following instruction: "${instruction}"

ORIGINAL EMAIL:
Subject: ${originalEmail.subject}
Body: ${originalEmail.bodyText}

Keep all personalization intact. Only change the tone/approach as instructed.

Return JSON:
{
  "subject": "New subject",
  "bodyHtml": "<p>HTML body</p>",
  "bodyText": "Text body",
  "personalizationNotes": ["What changed"]
}`;

    return askClaudeJSON<GeneratedEmail>(systemPrompt, [
      { role: "user", content: userMessage },
    ]);
  }

  private buildWriterSystemPrompt(writingSample: WritingSample | null): string {
    let prompt = `You are an expert B2B cold email copywriter. You write emails that feel genuinely human, are highly personalized, and achieve high reply rates.

Your principles:
- Every email must reference something SPECIFIC about the recipient
- Short paragraphs (1-2 sentences each)
- No jargon or corporate speak
- Create curiosity, not pressure
- Sound like a real person, not a template
- Never use "I hope this finds you well", "just following up", or similar filler
- Subject lines should be lowercase and conversational`;

    if (writingSample) {
      prompt += `\n\nWRITING STYLE TO MATCH:
- Tone: ${writingSample.tone}
- Guidelines: ${writingSample.guidelines || "None specified"}
- Signature: ${writingSample.signature || "None specified"}`;

      if (writingSample.example_emails.length > 0) {
        prompt += `\n\nEXAMPLE EMAILS TO MATCH STYLE:
${writingSample.example_emails.map((e, i) => `Example ${i + 1}:\n${e}`).join("\n\n")}`;
      }
    }

    return prompt;
  }
}
