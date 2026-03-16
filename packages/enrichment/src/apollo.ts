import { delay } from "@outboundai/shared";

const APOLLO_API_BASE = "https://api.apollo.io/v1";

export interface ApolloPersonData {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  email: string;
  title: string;
  headline: string;
  linkedin_url: string;
  photo_url: string | null;
  city: string;
  state: string;
  country: string;
  organization: {
    id: string;
    name: string;
    website_url: string;
    linkedin_url: string;
    industry: string;
    estimated_num_employees: number;
    annual_revenue: number | null;
    founded_year: number | null;
    short_description: string;
    technologies: string[];
    keywords: string[];
  };
  phone_numbers: Array<{ raw_number: string; type: string }>;
  seniority: string;
  departments: string[];
  employment_history: Array<{
    title: string;
    organization_name: string;
    start_date: string;
    end_date: string | null;
    current: boolean;
  }>;
}

export interface ApolloCompanyData {
  id: string;
  name: string;
  website_url: string;
  linkedin_url: string;
  industry: string;
  estimated_num_employees: number;
  annual_revenue: number | null;
  founded_year: number | null;
  short_description: string;
  technologies: string[];
  keywords: string[];
  city: string;
  state: string;
  country: string;
  phone: string | null;
  logo_url: string | null;
  funding_rounds: Array<{
    round_type: string;
    amount: number;
    date: string;
  }>;
}

export interface ApolloSearchParams {
  personTitles?: string[];
  personLocations?: string[];
  organizationIndustries?: string[];
  organizationNumEmployeesRanges?: string[];
  organizationLocations?: string[];
  keywords?: string[];
  page?: number;
  perPage?: number;
}

export class ApolloClient {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.APOLLO_API_KEY || "";
    if (!this.apiKey) {
      throw new Error("Apollo API key is required. Set APOLLO_API_KEY env variable.");
    }
  }

  /**
   * Enrich a person by email address.
   */
  async enrichPerson(email: string): Promise<ApolloPersonData | null> {
    try {
      const response = await this.request("/people/match", {
        method: "POST",
        body: JSON.stringify({
          email,
          reveal_personal_emails: false,
          reveal_phone_number: true,
        }),
      });

      const data = await response.json();
      if (!data.person) return null;

      return this.mapPersonData(data.person);
    } catch (error) {
      console.error(`Apollo person enrichment failed for ${email}:`, error);
      return null;
    }
  }

  /**
   * Enrich a company by domain.
   */
  async enrichCompany(domain: string): Promise<ApolloCompanyData | null> {
    try {
      const response = await this.request("/organizations/enrich", {
        method: "GET",
        params: { domain },
      });

      const data = await response.json();
      if (!data.organization) return null;

      return this.mapCompanyData(data.organization);
    } catch (error) {
      console.error(`Apollo company enrichment failed for ${domain}:`, error);
      return null;
    }
  }

  /**
   * Search for people matching criteria.
   */
  async searchPeople(params: ApolloSearchParams): Promise<{
    people: ApolloPersonData[];
    totalCount: number;
    page: number;
  }> {
    try {
      const response = await this.request("/mixed_people/search", {
        method: "POST",
        body: JSON.stringify({
          person_titles: params.personTitles,
          person_locations: params.personLocations,
          organization_industry_tag_ids: params.organizationIndustries,
          organization_num_employees_ranges: params.organizationNumEmployeesRanges,
          organization_locations: params.organizationLocations,
          q_keywords: params.keywords?.join(" "),
          page: params.page ?? 1,
          per_page: params.perPage ?? 25,
        }),
      });

      const data = await response.json();

      return {
        people: (data.people ?? []).map((p: Record<string, unknown>) => this.mapPersonData(p)),
        totalCount: data.pagination?.total_entries ?? 0,
        page: data.pagination?.page ?? 1,
      };
    } catch (error) {
      console.error("Apollo people search failed:", error);
      return { people: [], totalCount: 0, page: 1 };
    }
  }

  /**
   * Batch enrich multiple people by email.
   */
  async batchEnrichPeople(
    emails: string[],
    concurrency: number = 3,
  ): Promise<Map<string, ApolloPersonData | null>> {
    const results = new Map<string, ApolloPersonData | null>();
    const chunks: string[][] = [];

    for (let i = 0; i < emails.length; i += concurrency) {
      chunks.push(emails.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(async (email) => {
        const data = await this.enrichPerson(email);
        results.set(email, data);
      });
      await Promise.all(promises);
      // Rate limit: Apollo allows ~5 requests/second
      await delay(300);
    }

    return results;
  }

  private async request(
    path: string,
    options: {
      method: string;
      body?: string;
      params?: Record<string, string>;
    },
  ): Promise<Response> {
    let url = `${APOLLO_API_BASE}${path}`;

    if (options.params) {
      const searchParams = new URLSearchParams(options.params);
      url += `?${searchParams.toString()}`;
    }

    const response = await fetch(url, {
      method: options.method,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": this.apiKey,
      },
      body: options.body,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Apollo API error (${response.status}): ${errorBody}`);
    }

    return response;
  }

  private mapPersonData(raw: Record<string, unknown>): ApolloPersonData {
    const org = (raw.organization ?? {}) as Record<string, unknown>;
    return {
      id: (raw.id as string) ?? "",
      first_name: (raw.first_name as string) ?? "",
      last_name: (raw.last_name as string) ?? "",
      name: (raw.name as string) ?? "",
      email: (raw.email as string) ?? "",
      title: (raw.title as string) ?? "",
      headline: (raw.headline as string) ?? "",
      linkedin_url: (raw.linkedin_url as string) ?? "",
      photo_url: (raw.photo_url as string) ?? null,
      city: (raw.city as string) ?? "",
      state: (raw.state as string) ?? "",
      country: (raw.country as string) ?? "",
      organization: {
        id: (org.id as string) ?? "",
        name: (org.name as string) ?? "",
        website_url: (org.website_url as string) ?? "",
        linkedin_url: (org.linkedin_url as string) ?? "",
        industry: (org.industry as string) ?? "",
        estimated_num_employees: (org.estimated_num_employees as number) ?? 0,
        annual_revenue: (org.annual_revenue as number) ?? null,
        founded_year: (org.founded_year as number) ?? null,
        short_description: (org.short_description as string) ?? "",
        technologies: (org.technologies as string[]) ?? [],
        keywords: (org.keywords as string[]) ?? [],
      },
      phone_numbers: (raw.phone_numbers as ApolloPersonData["phone_numbers"]) ?? [],
      seniority: (raw.seniority as string) ?? "",
      departments: (raw.departments as string[]) ?? [],
      employment_history: (raw.employment_history as ApolloPersonData["employment_history"]) ?? [],
    };
  }

  private mapCompanyData(raw: Record<string, unknown>): ApolloCompanyData {
    return {
      id: (raw.id as string) ?? "",
      name: (raw.name as string) ?? "",
      website_url: (raw.website_url as string) ?? "",
      linkedin_url: (raw.linkedin_url as string) ?? "",
      industry: (raw.industry as string) ?? "",
      estimated_num_employees: (raw.estimated_num_employees as number) ?? 0,
      annual_revenue: (raw.annual_revenue as number) ?? null,
      founded_year: (raw.founded_year as number) ?? null,
      short_description: (raw.short_description as string) ?? "",
      technologies: (raw.technologies as string[]) ?? [],
      keywords: (raw.keywords as string[]) ?? [],
      city: (raw.city as string) ?? "",
      state: (raw.state as string) ?? "",
      country: (raw.country as string) ?? "",
      phone: (raw.phone as string) ?? null,
      logo_url: (raw.logo_url as string) ?? null,
      funding_rounds: (raw.funding_rounds as ApolloCompanyData["funding_rounds"]) ?? [],
    };
  }
}
