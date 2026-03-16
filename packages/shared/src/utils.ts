/**
 * Calculate open rate as a percentage
 */
export function calcOpenRate(opened: number, delivered: number): number {
  if (delivered === 0) return 0;
  return Math.round((opened / delivered) * 10000) / 100;
}

/**
 * Calculate reply rate as a percentage
 */
export function calcReplyRate(replies: number, delivered: number): number {
  if (delivered === 0) return 0;
  return Math.round((replies / delivered) * 10000) / 100;
}

/**
 * Calculate meeting conversion rate
 */
export function calcMeetingRate(meetings: number, contacted: number): number {
  if (contacted === 0) return 0;
  return Math.round((meetings / contacted) * 10000) / 100;
}

/**
 * Parse a name into first and last
 */
export function parseName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

/**
 * Extract domain from email
 */
export function domainFromEmail(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

/**
 * Extract domain from URL
 */
export function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0];
  }
}

/**
 * Delay helper
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Truncate text to a max length
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

/**
 * Check if an email send window is currently open
 */
export function isSendWindowOpen(
  startHour: string,
  endHour: string,
  sendDays: number[],
  timezone: string,
): boolean {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(now);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const dayName = parts.find((p) => p.type === "weekday")?.value ?? "Mon";

  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const currentDay = dayMap[dayName] ?? 1;
  if (!sendDays.includes(currentDay)) return false;

  const currentTime = `${hour}:${minute}`;
  return currentTime >= startHour && currentTime <= endHour;
}

/**
 * Format a number with commas
 */
export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Sanitize HTML for plain text
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
