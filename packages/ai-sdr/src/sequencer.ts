import { createServiceClient } from "@outboundai/supabase";
import { EmailWriter, type GeneratedEmail } from "./writer";
import { ProspectResearcher, type ResearchResult } from "./researcher";
import type { Prospect, Sequence, SequenceStep, Campaign, ICPProfile, WritingSample } from "@outboundai/shared";
import { isSendWindowOpen, delay } from "@outboundai/shared";

interface SequenceContext {
  campaign: Campaign;
  sequence: Sequence;
  steps: SequenceStep[];
  icpProfile: ICPProfile | null;
  writingSample: WritingSample | null;
  senderName: string;
  senderTitle: string;
  senderEmail: string;
  companyName: string;
}

interface SendEmailFn {
  (params: {
    from: string;
    to: string;
    subject: string;
    htmlBody: string;
    textBody: string;
    trackOpens: boolean;
    trackClicks: boolean;
  }): Promise<{ messageId: string }>;
}

export class SequenceEngine {
  private writer = new EmailWriter();
  private researcher = new ProspectResearcher();

  /**
   * Process all pending sequence sends for a campaign.
   * Called by a cron job typically every 5-15 minutes.
   */
  async processCampaignQueue(
    context: SequenceContext,
    sendEmail: SendEmailFn,
  ): Promise<{ sent: number; errors: number }> {
    const supabase = createServiceClient();
    let sent = 0;
    let errors = 0;

    // Check if we're in the send window
    if (
      !isSendWindowOpen(
        context.campaign.send_window_start,
        context.campaign.send_window_end,
        context.campaign.send_days,
        context.campaign.timezone,
      )
    ) {
      return { sent: 0, errors: 0 };
    }

    // Get prospects ready to be sent to
    const { data: queuedProspects, error: fetchError } = await supabase
      .from("campaign_prospects")
      .select("*, prospect:prospects(*)")
      .eq("campaign_id", context.campaign.id)
      .eq("status", "active")
      .lte("next_send_at", new Date().toISOString())
      .order("next_send_at", { ascending: true })
      .limit(context.campaign.daily_send_limit);

    if (fetchError || !queuedProspects) {
      console.error("Failed to fetch queued prospects:", fetchError);
      return { sent: 0, errors: 1 };
    }

    // Check daily send limit
    const { count: sentToday } = await supabase
      .from("emails_sent")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", context.campaign.id)
      .gte("sent_at", new Date().toISOString().split("T")[0]);

    const remainingToday = context.campaign.daily_send_limit - (sentToday ?? 0);
    if (remainingToday <= 0) return { sent: 0, errors: 0 };

    const toProcess = queuedProspects.slice(0, remainingToday);

    for (const cp of toProcess) {
      try {
        const prospect = cp.prospect as unknown as Prospect;
        if (!prospect) continue;

        const currentStep = context.steps.find(
          (s) => s.step_number === cp.current_step + 1,
        );
        if (!currentStep) {
          // Sequence complete
          await supabase
            .from("campaign_prospects")
            .update({ status: "completed" })
            .eq("id", cp.id);
          continue;
        }

        // Generate the email
        const email = await this.generateStepEmail(
          prospect,
          currentStep,
          context,
          cp.current_step,
        );

        // Send via SendGrid
        const { messageId } = await sendEmail({
          from: context.senderEmail,
          to: prospect.email,
          subject: email.subject,
          htmlBody: email.bodyHtml,
          textBody: email.bodyText,
          trackOpens: true,
          trackClicks: true,
        });

        // Record the sent email
        await supabase.from("emails_sent").insert({
          org_id: context.campaign.org_id,
          prospect_id: prospect.id,
          campaign_id: context.campaign.id,
          sequence_id: context.sequence.id,
          step_id: currentStep.id,
          from_email: context.senderEmail,
          to_email: prospect.email,
          subject: email.subject,
          body_html: email.bodyHtml,
          body_text: email.bodyText,
          status: "sent",
          sendgrid_message_id: messageId,
          sent_at: new Date().toISOString(),
        });

        // Determine next step timing
        const nextStep = context.steps.find(
          (s) => s.step_number === cp.current_step + 2,
        );

        if (nextStep) {
          const nextSendAt = new Date();
          nextSendAt.setDate(nextSendAt.getDate() + nextStep.delay_days);
          // Randomize send time within the window
          const startHour = parseInt(context.campaign.send_window_start.split(":")[0]);
          const endHour = parseInt(context.campaign.send_window_end.split(":")[0]);
          const randomHour = startHour + Math.floor(Math.random() * (endHour - startHour));
          const randomMinute = Math.floor(Math.random() * 60);
          nextSendAt.setHours(randomHour, randomMinute, 0, 0);

          await supabase
            .from("campaign_prospects")
            .update({
              current_step: cp.current_step + 1,
              next_send_at: nextSendAt.toISOString(),
            })
            .eq("id", cp.id);
        } else {
          await supabase
            .from("campaign_prospects")
            .update({
              current_step: cp.current_step + 1,
              status: "completed",
            })
            .eq("id", cp.id);
        }

        // Update prospect status
        if (cp.current_step === 0) {
          await supabase
            .from("prospects")
            .update({
              status: "contacted",
              last_contacted_at: new Date().toISOString(),
            })
            .eq("id", prospect.id);
        } else {
          await supabase
            .from("prospects")
            .update({ last_contacted_at: new Date().toISOString() })
            .eq("id", prospect.id);
        }

        // Update campaign counters
        await supabase.rpc("increment_campaign_sent" as never, {
          campaign_id: context.campaign.id,
        } as never);

        sent++;

        // Small delay between sends to avoid rate limits
        await delay(1000 + Math.random() * 2000);
      } catch (error) {
        console.error(`Failed to process prospect ${cp.prospect_id}:`, error);
        errors++;
      }
    }

    return { sent, errors };
  }

  /**
   * Add prospects to a campaign sequence.
   */
  async enrollProspects(
    campaignId: string,
    prospectIds: string[],
    sequenceId: string,
    firstStepDelay: number = 0,
  ): Promise<{ enrolled: number; skipped: number }> {
    const supabase = createServiceClient();
    let enrolled = 0;
    let skipped = 0;

    for (const prospectId of prospectIds) {
      // Check if already enrolled
      const { data: existing } = await supabase
        .from("campaign_prospects")
        .select("id")
        .eq("campaign_id", campaignId)
        .eq("prospect_id", prospectId)
        .single();

      if (existing) {
        skipped++;
        continue;
      }

      const nextSendAt = new Date();
      nextSendAt.setDate(nextSendAt.getDate() + firstStepDelay);

      const { error } = await supabase.from("campaign_prospects").insert({
        campaign_id: campaignId,
        prospect_id: prospectId,
        current_step: 0,
        status: "active",
        next_send_at: nextSendAt.toISOString(),
      });

      if (error) {
        console.error(`Failed to enroll prospect ${prospectId}:`, error);
        skipped++;
      } else {
        enrolled++;
      }
    }

    // Update campaign prospect count
    await supabase
      .from("campaigns")
      .update({ total_prospects: enrolled })
      .eq("id", campaignId);

    return { enrolled, skipped };
  }

  /**
   * Pause a prospect's sequence (e.g., when they reply).
   */
  async pauseProspectSequence(
    campaignId: string,
    prospectId: string,
  ): Promise<void> {
    const supabase = createServiceClient();
    await supabase
      .from("campaign_prospects")
      .update({ status: "paused" })
      .eq("campaign_id", campaignId)
      .eq("prospect_id", prospectId);
  }

  private async generateStepEmail(
    prospect: Prospect,
    step: SequenceStep,
    context: SequenceContext,
    currentStepIndex: number,
  ): Promise<GeneratedEmail> {
    // If step has a template and is not AI generated, use the template
    if (!step.ai_generated && step.subject_template && step.body_template) {
      return {
        subject: this.interpolateTemplate(step.subject_template, prospect),
        bodyHtml: this.interpolateTemplate(step.body_template, prospect),
        bodyText: this.interpolateTemplate(step.body_template, prospect),
        personalizationNotes: ["Template-based email with variable interpolation"],
      };
    }

    // AI-generated email
    const research = await this.researcher.research(prospect, context.icpProfile);

    if (currentStepIndex === 0) {
      return this.writer.writeFirstEmail(
        prospect,
        research,
        context.writingSample,
        context.icpProfile,
        context.senderName,
        context.senderTitle,
        context.companyName,
      );
    }

    // Get previous emails for context
    const supabase = createServiceClient();
    const { data: previousEmails } = await supabase
      .from("emails_sent")
      .select("subject, body_text")
      .eq("prospect_id", prospect.id)
      .eq("campaign_id", context.campaign.id)
      .order("sent_at", { ascending: true });

    return this.writer.writeFollowUp(
      prospect,
      research,
      (previousEmails ?? []).map((e) => ({
        subject: e.subject,
        body: e.body_text,
      })),
      currentStepIndex,
      context.writingSample,
    );
  }

  private interpolateTemplate(template: string, prospect: Prospect): string {
    return template
      .replace(/\{\{first_name\}\}/g, prospect.first_name)
      .replace(/\{\{last_name\}\}/g, prospect.last_name)
      .replace(/\{\{full_name\}\}/g, `${prospect.first_name} ${prospect.last_name}`)
      .replace(/\{\{title\}\}/g, prospect.title || "")
      .replace(/\{\{company\}\}/g, prospect.company_name || "")
      .replace(/\{\{industry\}\}/g, prospect.industry || "")
      .replace(/\{\{location\}\}/g, prospect.location || "");
  }
}
