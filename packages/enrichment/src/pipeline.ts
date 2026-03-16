import { ApolloClient, type ApolloPersonData, type ApolloCompanyData } from "./apollo";
import { ClearbitClient, type ClearbitPersonData, type ClearbitCompanyData } from "./clearbit";
import { WebScraper, type ScrapedContent } from "./web-scraper";
import { domainFromEmail, delay } from "@outboundai/shared";
import type { Prospect } from "@outboundai/shared";

export interface EnrichmentResult {
  prospect: {
    title: string | null;
    company_name: string | null;
    company_domain: string | null;
    company_size: string | null;
    industry: string | null;
    linkedin_url: string | null;
    phone: string | null;
    location: string | null;
  };
  apolloData: ApolloPersonData | null;
  clearbitPerson: ClearbitPersonData | null;
  clearbitCompany: ClearbitCompanyData | null;
  scrapedContent: ScrapedContent[];
  enrichedAt: string;
  sources: string[];
}

export class EnrichmentPipeline {
  private apollo: ApolloClient | null = null;
  private clearbit: ClearbitClient | null = null;
  private scraper = new WebScraper();

  constructor(options?: { apolloApiKey?: string; clearbitApiKey?: string }) {
    try {
      this.apollo = new ApolloClient(options?.apolloApiKey);
    } catch {
      console.warn("Apollo client not configured — skipping Apollo enrichment.");
    }

    try {
      this.clearbit = new ClearbitClient(options?.clearbitApiKey);
    } catch {
      console.warn("Clearbit client not configured — skipping Clearbit enrichment.");
    }
  }

  /**
   * Full enrichment pipeline for a single prospect.
   * Combines data from all available sources.
   */
  async enrichProspect(prospect: Prospect): Promise<EnrichmentResult> {
    const sources: string[] = [];
    let apolloData: ApolloPersonData | null = null;
    let clearbitPerson: ClearbitPersonData | null = null;
    let clearbitCompany: ClearbitCompanyData | null = null;
    let scrapedContent: ScrapedContent[] = [];

    // Run enrichment in parallel where possible
    const enrichmentPromises: Promise<void>[] = [];

    // Apollo enrichment
    if (this.apollo) {
      enrichmentPromises.push(
        this.apollo.enrichPerson(prospect.email).then((data) => {
          if (data) {
            apolloData = data;
            sources.push("apollo");
          }
        }),
      );
    }

    // Clearbit enrichment
    if (this.clearbit) {
      enrichmentPromises.push(
        this.clearbit.enrichFull(prospect.email).then(({ person, company }) => {
          if (person) {
            clearbitPerson = person;
            sources.push("clearbit_person");
          }
          if (company) {
            clearbitCompany = company;
            sources.push("clearbit_company");
          }
        }),
      );
    }

    // Web scraping
    const companyDomain = prospect.company_domain || domainFromEmail(prospect.email);
    enrichmentPromises.push(
      this.scraper
        .scrapeProspectContent(
          `${prospect.first_name} ${prospect.last_name}`,
          companyDomain,
          prospect.linkedin_url,
        )
        .then((content) => {
          if (content.length > 0) {
            scrapedContent = content;
            sources.push("web_scraping");
          }
        }),
    );

    await Promise.allSettled(enrichmentPromises);

    // Merge data from all sources to fill in missing fields
    const merged = this.mergeEnrichmentData(
      prospect,
      apolloData,
      clearbitPerson,
      clearbitCompany,
    );

    return {
      prospect: merged,
      apolloData,
      clearbitPerson,
      clearbitCompany,
      scrapedContent,
      enrichedAt: new Date().toISOString(),
      sources,
    };
  }

  /**
   * Enrich a batch of prospects.
   */
  async enrichBatch(
    prospects: Prospect[],
    concurrency: number = 3,
    onProgress?: (completed: number, total: number) => void,
  ): Promise<Map<string, EnrichmentResult>> {
    const results = new Map<string, EnrichmentResult>();
    let completed = 0;

    const chunks: Prospect[][] = [];
    for (let i = 0; i < prospects.length; i += concurrency) {
      chunks.push(prospects.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(async (prospect) => {
        try {
          const result = await this.enrichProspect(prospect);
          results.set(prospect.id, result);
        } catch (error) {
          console.error(`Enrichment failed for ${prospect.email}:`, error);
        }
        completed++;
        onProgress?.(completed, prospects.length);
      });

      await Promise.all(promises);
      await delay(500); // Rate limiting between batches
    }

    return results;
  }

  /**
   * Merge data from all enrichment sources, preferring non-null values.
   */
  private mergeEnrichmentData(
    prospect: Prospect,
    apollo: ApolloPersonData | null,
    clearbitPerson: ClearbitPersonData | null,
    clearbitCompany: ClearbitCompanyData | null,
  ): EnrichmentResult["prospect"] {
    return {
      title:
        prospect.title ||
        apollo?.title ||
        clearbitPerson?.employment?.title ||
        null,
      company_name:
        prospect.company_name ||
        apollo?.organization?.name ||
        clearbitPerson?.employment?.name ||
        clearbitCompany?.name ||
        null,
      company_domain:
        prospect.company_domain ||
        apollo?.organization?.website_url?.replace(/^https?:\/\//, "").replace(/\/$/, "") ||
        clearbitPerson?.employment?.domain ||
        clearbitCompany?.domain ||
        domainFromEmail(prospect.email) ||
        null,
      company_size:
        prospect.company_size ||
        (apollo?.organization?.estimated_num_employees
          ? this.categorizeSize(apollo.organization.estimated_num_employees)
          : null) ||
        clearbitCompany?.metrics?.employeesRange ||
        null,
      industry:
        prospect.industry ||
        apollo?.organization?.industry ||
        clearbitCompany?.category?.industry ||
        null,
      linkedin_url:
        prospect.linkedin_url ||
        apollo?.linkedin_url ||
        (clearbitPerson?.linkedin?.handle
          ? `https://linkedin.com/in/${clearbitPerson.linkedin.handle}`
          : null) ||
        null,
      phone:
        prospect.phone ||
        apollo?.phone_numbers?.[0]?.raw_number ||
        null,
      location:
        prospect.location ||
        (apollo ? [apollo.city, apollo.state, apollo.country].filter(Boolean).join(", ") : null) ||
        clearbitPerson?.location ||
        null,
    };
  }

  private categorizeSize(employeeCount: number): string {
    if (employeeCount <= 10) return "1-10";
    if (employeeCount <= 50) return "11-50";
    if (employeeCount <= 200) return "51-200";
    if (employeeCount <= 500) return "201-500";
    if (employeeCount <= 1000) return "501-1000";
    if (employeeCount <= 5000) return "1001-5000";
    if (employeeCount <= 10000) return "5001-10000";
    return "10000+";
  }
}
