import Anthropic from "@anthropic-ai/sdk";

let clientInstance: Anthropic | null = null;

export function createAnthropicClient(): Anthropic {
  if (clientInstance) return clientInstance;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY environment variable");
  }

  clientInstance = new Anthropic({ apiKey });
  return clientInstance;
}

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Send a message to Claude and get a text response.
 */
export async function askClaude(
  systemPrompt: string,
  messages: ClaudeMessage[],
  options?: {
    maxTokens?: number;
    temperature?: number;
    model?: string;
  },
): Promise<string> {
  const client = createAnthropicClient();
  const response = await client.messages.create({
    model: options?.model ?? "claude-sonnet-4-20250514",
    max_tokens: options?.maxTokens ?? 2048,
    temperature: options?.temperature ?? 0.7,
    system: systemPrompt,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock?.text ?? "";
}

/**
 * Ask Claude and parse JSON from the response.
 */
export async function askClaudeJSON<T>(
  systemPrompt: string,
  messages: ClaudeMessage[],
  options?: {
    maxTokens?: number;
    temperature?: number;
  },
): Promise<T> {
  const text = await askClaude(
    systemPrompt + "\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no explanation.",
    messages,
    { ...options, temperature: options?.temperature ?? 0.3 },
  );

  // Extract JSON from the response (handle markdown code blocks)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  const jsonStr = (jsonMatch[1] ?? text).trim();

  try {
    return JSON.parse(jsonStr) as T;
  } catch (err) {
    throw new Error(`Failed to parse Claude JSON response: ${jsonStr.slice(0, 200)}`);
  }
}
