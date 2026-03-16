import { delay } from "@outboundai/shared";

const CLEARBIT_API_BASE = "https://person.clearbit.com/v2";
const CLEARBIT_COMPANY_BASE = "https://company.clearbit.com/v2";

export interface ClearbitPersonData {
  id: string;
  fullName: string;
  email: string;
  gender: string | null;
  location: string | null;
  timeZone: string | null;
  utcOffset: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  bio: string | null;
  site: string | null;
  avatar: string | null;
  employment: {
    domain: string | null;
    name: string | null;
    title: string | null;
    role: string | null;
    subRole: string | null;
    seniority: string | null;
  };
  facebook: { handle: string | null };
  github: { handle: string | null };
  twitter: { handle: string | null };
  linkedin: { handle: string | null };
  indexedAt: string | null;
}

export interface ClearbitCompanyData {
  id: string;
  name: string;
  legalName: string | null;
  domain: string;
  domainAliases: string[];
  url: string;
  logo: string | null;
  description: string | null;
  category: {
    sector: string | null;
    industryGroup: string | null;
    industry: string | null;
    subIndustry: string | null;
  };
  tags: string[];
  emailProvider: boolean;
  type: string | null; // "private", "public", etc.
  ticker: string | null;
  identifiers: { usEIN: string | null };
  phone: string | null;
  site: {
    phoneNumbers: string[];
    emailAddresses: string[];
  };
  foundedYear: number | null;
  metrics: {
    raised: number | null;
    annualRevenue: string | null;
    estimatedAnnualRevenue: string | null;
    employees: number | null;
    employeesRange: string | null;
    marketCap: number | null;
    fiscalYearEnd: number | null;
  };
  tech: string[];
  techCategories: string[];
  parent: { domain: string | null };
  geo: {
    streetNumber: string | null;
    streetName: string | null;
    subPremise: string | null;
    city: string | null;
    postalCode: string | null;
    state: string | null;
    stateCode: string | null;
    country: string | null;
    countryCode: string | null;
    lat: number | null;
    lng: number | null;
  };
  linkedin: { handle: string | null };
  facebook: { handle: string | null };
  twitter: { handle: string | null; followers: number | null };
  crunchbase: { handle: string | null };
}

export class ClearbitClient {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.CLEARBIT_API_KEY || "";
    if (!this.apiKey) {
      throw new Error("Clearbit API key is required. Set CLEARBIT_API_KEY env variable.");
    }
  }

  /**
   * Look up a person by email.
   */
  async findPerson(email: string): Promise<ClearbitPersonData | null> {
    try {
      const response = await fetch(
        `${CLEARBIT_API_BASE}/people/find?email=${encodeURIComponent(email)}`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
        },
      );

      if (response.status === 404) return null;
      if (response.status === 202) {
        // Async lookup — Clearbit will webhook when ready
        return null;
      }
      if (!response.ok) {
        throw new Error(`Clearbit API error (${response.status})`);
      }

      return (await response.json()) as ClearbitPersonData;
    } catch (error) {
      console.error(`Clearbit person lookup failed for ${email}:`, error);
      return null;
    }
  }

  /**
   * Look up a company by domain.
   */
  async findCompany(domain: string): Promise<ClearbitCompanyData | null> {
    try {
      const response = await fetch(
        `${CLEARBIT_COMPANY_BASE}/companies/find?domain=${encodeURIComponent(domain)}`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
        },
      );

      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`Clearbit API error (${response.status})`);
      }

      return (await response.json()) as ClearbitCompanyData;
    } catch (error) {
      console.error(`Clearbit company lookup failed for ${domain}:`, error);
      return null;
    }
  }

  /**
   * Combined person + company lookup.
   */
  async enrichFull(
    email: string,
  ): Promise<{ person: ClearbitPersonData | null; company: ClearbitCompanyData | null }> {
    try {
      const response = await fetch(
        `https://person.clearbit.com/v2/combined/find?email=${encodeURIComponent(email)}`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
        },
      );

      if (response.status === 404) return { person: null, company: null };
      if (response.status === 202) return { person: null, company: null };
      if (!response.ok) {
        throw new Error(`Clearbit API error (${response.status})`);
      }

      const data = await response.json();
      return {
        person: data.person as ClearbitPersonData,
        company: data.company as ClearbitCompanyData,
      };
    } catch (error) {
      console.error(`Clearbit combined enrichment failed for ${email}:`, error);
      return { person: null, company: null };
    }
  }

  /**
   * Batch enrich multiple emails.
   */
  async batchEnrich(
    emails: string[],
    concurrency: number = 3,
  ): Promise<
    Map<string, { person: ClearbitPersonData | null; company: ClearbitCompanyData | null }>
  > {
    const results = new Map<
      string,
      { person: ClearbitPersonData | null; company: ClearbitCompanyData | null }
    >();
    const chunks: string[][] = [];

    for (let i = 0; i < emails.length; i += concurrency) {
      chunks.push(emails.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(async (email) => {
        const data = await this.enrichFull(email);
        results.set(email, data);
      });
      await Promise.all(promises);
      await delay(500); // Rate limiting
    }

    return results;
  }

  /**
   * Map Clearbit company data to a simplified format for our system.
   */
  static simplifyCompanyData(company: ClearbitCompanyData): {
    name: string;
    domain: string;
    industry: string | null;
    size: string | null;
    description: string | null;
    techStack: string[];
    location: string;
    founded: number | null;
    revenue: string | null;
    funding: number | null;
  } {
    return {
      name: company.name,
      domain: company.domain,
      industry: company.category?.industry ?? null,
      size: company.metrics?.employeesRange ?? null,
      description: company.description,
      techStack: company.tech ?? [],
      location: [company.geo?.city, company.geo?.state, company.geo?.country]
        .filter(Boolean)
        .join(", "),
      founded: company.foundedYear,
      revenue: company.metrics?.estimatedAnnualRevenue ?? null,
      funding: company.metrics?.raised ?? null,
    };
  }
}
