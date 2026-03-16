import { askClaudeJSON } from "./claude-client";
import type { ReplyClassification } from "@outboundai/shared";

export interface ClassificationResult {
  classification: ReplyClassification;
  confidence: number;
  sentiment: number; // -1 to 1
  summary: string;
  suggestedAction: "respond" | "book_meeting" | "send_to_human" | "stop_sequence" | "continue_sequence";
  extractedInfo: {
    referralName?: string;
    referralEmail?: string;
    returnDate?: string; // for OOO
    objectionType?: string;
    question?: string;
    meetingInterest?: boolean;
    preferredTimes?: string[];
  };
}

export class ReplyClassifier {
  /**
   * Classify an email reply and determine next action.
   */
  async classify(
    replyBody: string,
    replySubject: string,
    originalEmailBody: string,
    originalSubject: string,
    prospectName: string,
  ): Promise<ClassificationResult> {
    const systemPrompt = `You are an expert at classifying email replies in a B2B sales context.

Classifications:
- "interested": Prospect shows interest in learning more, wants a call, asks questions about the product
- "not_interested": Explicit rejection, "not interested", "please remove me", negative response
- "objection": Has concerns but hasn't fully rejected (pricing, timing, competitor, authority)
- "out_of_office": Auto-reply indicating absence, with possible return date
- "unsubscribe": Explicit request to stop receiving emails
- "referral": Prospect refers to someone else who might be interested
- "question": Asks a specific question about the product/service without clear interest signal
- "other": Doesn't fit other categories

Sentiment scale: -1 (very negative) to 1 (very positive)

Actions:
- "respond": AI should draft a response
- "book_meeting": Prospect is ready for a meeting
- "send_to_human": Needs human judgment
- "stop_sequence": Stop all automated emails to this prospect
- "continue_sequence": OOO or unclear, continue sequence later`;

    const userMessage = `Classify this email reply:

ORIGINAL EMAIL:
Subject: ${originalSubject}
Body: ${originalEmailBody}

REPLY FROM ${prospectName}:
Subject: ${replySubject}
Body: ${replyBody}

Return JSON:
{
  "classification": "interested|not_interested|objection|out_of_office|unsubscribe|referral|question|other",
  "confidence": 0.95,
  "sentiment": 0.5,
  "summary": "Brief summary of what the prospect said",
  "suggestedAction": "respond|book_meeting|send_to_human|stop_sequence|continue_sequence",
  "extractedInfo": {
    "referralName": "if referral, the name",
    "referralEmail": "if referral, the email",
    "returnDate": "if OOO, the return date",
    "objectionType": "if objection, the type (pricing/timing/competitor/authority/other)",
    "question": "if question, what they asked",
    "meetingInterest": true,
    "preferredTimes": ["any mentioned times"]
  }
}`;

    const result = await askClaudeJSON<ClassificationResult>(systemPrompt, [
      { role: "user", content: userMessage },
    ]);

    return result;
  }

  /**
   * Batch classify multiple replies.
   */
  async batchClassify(
    replies: Array<{
      id: string;
      replyBody: string;
      replySubject: string;
      originalBody: string;
      originalSubject: string;
      prospectName: string;
    }>,
  ): Promise<Map<string, ClassificationResult>> {
    const results = new Map<string, ClassificationResult>();

    // Process in parallel batches of 5
    const batchSize = 5;
    for (let i = 0; i < replies.length; i += batchSize) {
      const batch = replies.slice(i, i + batchSize);
      const promises = batch.map(async (reply) => {
        try {
          const result = await this.classify(
            reply.replyBody,
            reply.replySubject,
            reply.originalBody,
            reply.originalSubject,
            reply.prospectName,
          );
          results.set(reply.id, result);
        } catch (error) {
          console.error(`Classification failed for reply ${reply.id}:`, error);
          results.set(reply.id, {
            classification: "other",
            confidence: 0,
            sentiment: 0,
            summary: "Classification failed",
            suggestedAction: "send_to_human",
            extractedInfo: {},
          });
        }
      });
      await Promise.all(promises);
    }

    return results;
  }

  /**
   * Generate an AI-suggested response for a classified reply.
   */
  async generateSuggestedResponse(
    classification: ClassificationResult,
    replyBody: string,
    prospectName: string,
    senderName: string,
    companyName: string,
  ): Promise<string> {
    if (classification.suggestedAction === "stop_sequence") {
      return "";
    }

    const systemPrompt = `You are writing a response to a B2B sales email reply. Be natural, conversational, and helpful.`;

    const contextMap: Record<string, string> = {
      interested: `The prospect is interested. Acknowledge their interest warmly, answer any questions briefly, and propose 2-3 specific meeting times this week.`,
      objection: `The prospect raised an objection (${classification.extractedInfo.objectionType}). Address it empathetically, provide a concise counter-point, and keep the door open.`,
      question: `The prospect asked: "${classification.extractedInfo.question}". Answer clearly and concisely, then gently move toward a meeting.`,
      referral: `The prospect referred us to ${classification.extractedInfo.referralName}. Thank them warmly and ask if they'd be willing to make an intro.`,
      out_of_office: `The prospect is OOO until ${classification.extractedInfo.returnDate}. No response needed now — we'll follow up after they return.`,
    };

    const context = contextMap[classification.classification] || "Respond appropriately based on the context.";

    const userMessage = `${context}

THEIR REPLY:
${replyBody}

Write a brief, natural response from ${senderName} at ${companyName} to ${prospectName}.
Keep it under 100 words. Be human, not salesy.`;

    const response = await import("./claude-client").then((m) =>
      m.askClaude(systemPrompt, [{ role: "user", content: userMessage }]),
    );

    return response;
  }
}
