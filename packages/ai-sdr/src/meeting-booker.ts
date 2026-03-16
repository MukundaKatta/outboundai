import { askClaudeJSON, askClaude } from "./claude-client";
import { createServiceClient } from "@outboundai/supabase";
import type { Prospect, MeetingBooked } from "@outboundai/shared";

export interface TimeSlot {
  start: string; // ISO datetime
  end: string;
}

export interface CalendarProvider {
  getAvailableSlots(
    calendarId: string,
    startDate: string,
    endDate: string,
    durationMinutes: number,
  ): Promise<TimeSlot[]>;

  createEvent(params: {
    calendarId: string;
    title: string;
    description: string;
    startTime: string;
    endTime: string;
    attendees: string[];
    meetingLink?: string;
  }): Promise<{ eventId: string; meetingLink: string }>;
}

export interface AvailabilityParsed {
  hasMentionedTimes: boolean;
  preferredTimes: string[];
  timezone: string | null;
  flexibility: "rigid" | "flexible" | "very_flexible";
}

export class MeetingBooker {
  constructor(private calendarProvider: CalendarProvider) {}

  /**
   * Parse meeting availability from a prospect's reply.
   */
  async parseAvailability(replyText: string): Promise<AvailabilityParsed> {
    const result = await askClaudeJSON<AvailabilityParsed>(
      "You parse meeting availability from email replies. Extract any mentioned times, dates, or availability preferences.",
      [
        {
          role: "user",
          content: `Parse the availability from this reply:

"${replyText}"

Return JSON:
{
  "hasMentionedTimes": true,
  "preferredTimes": ["Tuesday at 2pm", "Thursday morning"],
  "timezone": "EST" or null,
  "flexibility": "rigid|flexible|very_flexible"
}`,
        },
      ],
    );

    return result;
  }

  /**
   * Generate a meeting proposal email with available time slots.
   */
  async proposeMeetingTimes(
    prospect: Prospect,
    calendarId: string,
    senderName: string,
    companyName: string,
    meetingDurationMinutes: number = 30,
    daysAhead: number = 7,
  ): Promise<{
    emailText: string;
    proposedSlots: TimeSlot[];
  }> {
    const startDate = new Date().toISOString();
    const endDate = new Date(
      Date.now() + daysAhead * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Get available slots from calendar
    const availableSlots = await this.calendarProvider.getAvailableSlots(
      calendarId,
      startDate,
      endDate,
      meetingDurationMinutes,
    );

    // Pick 3-4 good slots spread across different days/times
    const proposedSlots = this.selectOptimalSlots(availableSlots, 4);

    // Format slots for the email
    const slotsFormatted = proposedSlots
      .map((slot) => {
        const date = new Date(slot.start);
        return date.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        }) +
          " at " +
          date.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          });
      })
      .join("\n- ");

    const emailText = await askClaude(
      "You write brief, friendly meeting scheduling emails.",
      [
        {
          role: "user",
          content: `Write a brief email from ${senderName} at ${companyName} to ${prospect.first_name} proposing meeting times.

Available slots:
- ${slotsFormatted}

Rules:
- Keep it under 60 words
- Sound natural and warm
- Include the time slots as a simple bulleted list
- Mention the meeting will be ${meetingDurationMinutes} minutes
- End with "Pick whichever works best, or suggest another time"`,
        },
      ],
    );

    return { emailText, proposedSlots };
  }

  /**
   * Book a meeting based on the prospect's selected time.
   */
  async bookMeeting(
    prospect: Prospect,
    selectedSlot: TimeSlot,
    calendarId: string,
    orgId: string,
    campaignId: string,
    senderName: string,
    senderEmail: string,
    companyName: string,
  ): Promise<MeetingBooked> {
    const supabase = createServiceClient();

    // Create calendar event
    const { eventId, meetingLink } = await this.calendarProvider.createEvent({
      calendarId,
      title: `${senderName} <> ${prospect.first_name} ${prospect.last_name} | ${companyName}`,
      description: `Meeting with ${prospect.first_name} ${prospect.last_name}, ${prospect.title} at ${prospect.company_name}.\n\nBooked via OutboundAI.`,
      startTime: selectedSlot.start,
      endTime: selectedSlot.end,
      attendees: [senderEmail, prospect.email],
    });

    // Save to database
    const { data: meeting, error } = await supabase
      .from("meetings_booked")
      .insert({
        org_id: orgId,
        prospect_id: prospect.id,
        campaign_id: campaignId,
        title: `Meeting with ${prospect.first_name} ${prospect.last_name}`,
        description: `${prospect.title} at ${prospect.company_name}`,
        start_time: selectedSlot.start,
        end_time: selectedSlot.end,
        meeting_link: meetingLink,
        calendar_event_id: eventId,
        status: "scheduled",
      })
      .select()
      .single();

    if (error || !meeting) {
      throw new Error(`Failed to save meeting: ${error?.message}`);
    }

    // Update prospect status
    await supabase
      .from("prospects")
      .update({ status: "meeting_booked" })
      .eq("id", prospect.id);

    // Update campaign counter
    await supabase
      .from("campaigns")
      .update({
        total_meetings: (
          await supabase
            .from("meetings_booked")
            .select("*", { count: "exact", head: true })
            .eq("campaign_id", campaignId)
        ).count ?? 0,
      })
      .eq("id", campaignId);

    return meeting as unknown as MeetingBooked;
  }

  /**
   * Generate a meeting confirmation email.
   */
  async generateConfirmationEmail(
    prospect: Prospect,
    meeting: MeetingBooked,
    senderName: string,
  ): Promise<string> {
    const startDate = new Date(meeting.start_time);
    const formattedDate = startDate.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    const formattedTime = startDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    return askClaude(
      "You write brief, friendly meeting confirmation emails.",
      [
        {
          role: "user",
          content: `Write a brief meeting confirmation email from ${senderName} to ${prospect.first_name}.

Meeting details:
- Date: ${formattedDate} at ${formattedTime}
- Duration: 30 minutes
- Link: ${meeting.meeting_link || "Calendar invite sent"}

Rules:
- Under 40 words
- Warm and professional
- Express genuine excitement
- Confirm the details`,
        },
      ],
    );
  }

  /**
   * Match prospect's preferred times with available calendar slots.
   */
  async matchPreferredTimesWithAvailability(
    preferredTimes: string[],
    availableSlots: TimeSlot[],
    prospectTimezone: string | null,
  ): Promise<TimeSlot[]> {
    if (preferredTimes.length === 0 || availableSlots.length === 0) {
      return [];
    }

    const result = await askClaudeJSON<{ matchedSlotIndices: number[] }>(
      "You match human-described time preferences with available calendar slots.",
      [
        {
          role: "user",
          content: `Match these preferred times with available slots.

Preferred times (prospect's timezone: ${prospectTimezone || "unknown"}):
${preferredTimes.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Available slots:
${availableSlots.map((s, i) => `${i}. ${new Date(s.start).toISOString()} - ${new Date(s.end).toISOString()}`).join("\n")}

Return JSON with indices of matching available slots:
{ "matchedSlotIndices": [0, 3, 5] }`,
        },
      ],
    );

    return result.matchedSlotIndices
      .filter((i) => i >= 0 && i < availableSlots.length)
      .map((i) => availableSlots[i]);
  }

  /**
   * Select optimal meeting slots spread across different days and times.
   */
  private selectOptimalSlots(slots: TimeSlot[], count: number): TimeSlot[] {
    if (slots.length <= count) return slots;

    const selected: TimeSlot[] = [];
    const usedDays = new Set<string>();

    // First pass: pick one slot per day
    for (const slot of slots) {
      if (selected.length >= count) break;
      const day = new Date(slot.start).toDateString();
      if (!usedDays.has(day)) {
        // Prefer mid-morning and early afternoon slots
        const hour = new Date(slot.start).getHours();
        if (hour >= 9 && hour <= 15) {
          selected.push(slot);
          usedDays.add(day);
        }
      }
    }

    // Second pass: fill remaining with any available
    if (selected.length < count) {
      for (const slot of slots) {
        if (selected.length >= count) break;
        if (!selected.includes(slot)) {
          selected.push(slot);
        }
      }
    }

    return selected;
  }
}
