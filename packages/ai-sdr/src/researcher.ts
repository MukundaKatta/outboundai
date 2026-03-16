import { askClaudeJSON } from "./claude-client";
import type { Prospect, ICPProfile } from "@outboundai/shared";

export interface ResearchResult {
  summary: string;
  recentActivity: string[];
  painPoints: string[];
  talkingPoints: string[];
  iceBreakers: string[];
  companyInsights: {
    recentNews: string[];
    techStack: string[];
    competitors: string[];
    fundingStage: string | null;
    employeeCount: string | null;
  };
  personalInsights: {
    careerPath: string[];
    interests: string[];
    sharedConnections: string[];
  };
  relevanceScore: number; // 0-100 how well they match ICP
}

export class ProspectResearcher {
  /**
   * Research a prospect using enrichment data and AI analysis.
   * Combines data from Apollo, Clearbit, LinkedIn, and web scraping
   * to build a comprehensive prospect profile for personalization.
   */
  async research(
    prospect: Prospect,
    icpProfile: ICPProfile | null,
    enrichmentData?: {
      apolloData?: Record<string, unknown>;
      clearbitData?: Record<string, unknown>;
      scrapedContent?: string[];
    },
  ): Promise<ResearchResult> {
    const systemPrompt = `You are an expert B2B sales researcher. Your job is to analyze prospect data and produce actionable intelligence for writing highly personalized outreach emails.

Focus on:
1. Recent professional activity and achievements
2. Company challenges and pain points relevant to our solution
3. Potential ice breakers and conversation starters
4. How well this prospect matches our Ideal Customer Profile
5. Specific details that can be referenced in emails to show genuine research

Be specific and actionable. Avoid generic insights.`;

    const userMessage = this.buildResearchPrompt(prospect, icpProfile, enrichmentData);

    const result = await askClaudeJSON<ResearchResult>(systemPrompt, [
      { role: "user", content: userMessage },
    ]);

    return result;
  }

  /**
   * Batch research multiple prospects efficiently.
   */
  async batchResearch(
    prospects: Prospect[],
    icpProfile: ICPProfile | null,
    concurrency: number = 3,
  ): Promise<Map<string, ResearchResult>> {
    const results = new Map<string, ResearchResult>();
    const chunks = this.chunkArray(prospects, concurrency);

    for (const chunk of chunks) {
      const promises = chunk.map(async (prospect) => {
        try {
          const result = await this.research(prospect, icpProfile);
          results.set(prospect.id, result);
        } catch (error) {
          console.error(`Research failed for prospect ${prospect.id}:`, error);
          results.set(prospect.id, this.getDefaultResearch());
        }
      });
      await Promise.all(promises);
    }

    return results;
  }

  /**
   * Score how well a prospect matches an ICP.
   */
  async scoreICPFit(prospect: Prospect, icpProfile: ICPProfile): Promise<number> {
    let score = 0;
    const maxScore = 100;

    // Title match (30 points)
    if (prospect.title && icpProfile.target_titles.length > 0) {
      const titleLower = prospect.title.toLowerCase();
      const titleMatch = icpProfile.target_titles.some(
        (t) => titleLower.includes(t.toLowerCase()) || t.toLowerCase().includes(titleLower),
      );
      if (titleMatch) score += 30;
      else {
        // Partial match for related titles
        const hasRelatedKeywords = icpProfile.target_titles.some((t) =>
          t.toLowerCase().split(/\s+/).some((word) => titleLower.includes(word)),
        );
        if (hasRelatedKeywords) score += 15;
      }
    }

    // Industry match (20 points)
    if (prospect.industry && icpProfile.target_industries.length > 0) {
      const industryMatch = icpProfile.target_industries.some(
        (i) => i.toLowerCase() === prospect.industry?.toLowerCase(),
      );
      if (industryMatch) score += 20;
    }

    // Company size match (20 points)
    if (prospect.company_size && icpProfile.target_company_sizes.length > 0) {
      const sizeMatch = icpProfile.target_company_sizes.some(
        (s) => s.toLowerCase() === prospect.company_size?.toLowerCase(),
      );
      if (sizeMatch) score += 20;
    }

    // Location match (15 points)
    if (prospect.location && icpProfile.target_locations.length > 0) {
      const locationMatch = icpProfile.target_locations.some((loc) =>
        prospect.location?.toLowerCase().includes(loc.toLowerCase()),
      );
      if (locationMatch) score += 15;
    }

    // Exclude domain check (-100 if matched)
    if (prospect.company_domain && icpProfile.exclude_domains.length > 0) {
      const excluded = icpProfile.exclude_domains.some(
        (d) => d.toLowerCase() === prospect.company_domain?.toLowerCase(),
      );
      if (excluded) return 0;
    }

    // Keyword match in enrichment data (15 points)
    if (icpProfile.keywords.length > 0 && prospect.enrichment_data) {
      const enrichStr = JSON.stringify(prospect.enrichment_data).toLowerCase();
      const keywordMatches = icpProfile.keywords.filter((k) =>
        enrichStr.includes(k.toLowerCase()),
      );
      score += Math.min(15, (keywordMatches.length / icpProfile.keywords.length) * 15);
    }

    return Math.min(maxScore, Math.round(score));
  }

  private buildResearchPrompt(
    prospect: Prospect,
    icpProfile: ICPProfile | null,
    enrichmentData?: {
      apolloData?: Record<string, unknown>;
      clearbitData?: Record<string, unknown>;
      scrapedContent?: string[];
    },
  ): string {
    let prompt = `Research this prospect for a personalized outreach email:

PROSPECT:
- Name: ${prospect.first_name} ${prospect.last_name}
- Title: ${prospect.title || "Unknown"}
- Company: ${prospect.company_name || "Unknown"}
- Industry: ${prospect.industry || "Unknown"}
- Location: ${prospect.location || "Unknown"}
- LinkedIn: ${prospect.linkedin_url || "Not available"}`;

    if (prospect.recent_posts?.length) {
      prompt += `\n\nRECENT POSTS/ACTIVITY:\n${prospect.recent_posts.map((p, i) => `${i + 1}. ${p}`).join("\n")}`;
    }

    if (enrichmentData?.apolloData) {
      prompt += `\n\nAPOLLO.IO DATA:\n${JSON.stringify(enrichmentData.apolloData, null, 2)}`;
    }

    if (enrichmentData?.clearbitData) {
      prompt += `\n\nCLEARBIT DATA:\n${JSON.stringify(enrichmentData.clearbitData, null, 2)}`;
    }

    if (enrichmentData?.scrapedContent?.length) {
      prompt += `\n\nSCRAPED WEB CONTENT:\n${enrichmentData.scrapedContent.join("\n---\n")}`;
    }

    if (icpProfile) {
      prompt += `\n\nOUR IDEAL CUSTOMER PROFILE:
- Target Titles: ${icpProfile.target_titles.join(", ")}
- Target Industries: ${icpProfile.target_industries.join(", ")}
- Pain Points We Solve: ${icpProfile.pain_points.join(", ")}
- Our Value Propositions: ${icpProfile.value_propositions.join(", ")}`;
    }

    prompt += `\n\nReturn a JSON object with this structure:
{
  "summary": "Brief prospect summary",
  "recentActivity": ["Recent professional activities"],
  "painPoints": ["Likely pain points"],
  "talkingPoints": ["Conversation starters"],
  "iceBreakers": ["Personalized ice breakers"],
  "companyInsights": {
    "recentNews": ["Company news"],
    "techStack": ["Technologies used"],
    "competitors": ["Competitors"],
    "fundingStage": "Funding info or null",
    "employeeCount": "Employee count or null"
  },
  "personalInsights": {
    "careerPath": ["Career highlights"],
    "interests": ["Professional interests"],
    "sharedConnections": ["Shared connections"]
  },
  "relevanceScore": 75
}`;

    return prompt;
  }

  private getDefaultResearch(): ResearchResult {
    return {
      summary: "Limited information available for this prospect.",
      recentActivity: [],
      painPoints: [],
      talkingPoints: [],
      iceBreakers: [],
      companyInsights: {
        recentNews: [],
        techStack: [],
        competitors: [],
        fundingStage: null,
        employeeCount: null,
      },
      personalInsights: {
        careerPath: [],
        interests: [],
        sharedConnections: [],
      },
      relevanceScore: 50,
    };
  }

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }
}
