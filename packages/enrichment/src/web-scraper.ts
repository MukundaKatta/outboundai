import { delay } from "@outboundai/shared";

export interface ScrapedContent {
  url: string;
  title: string;
  text: string;
  publishedDate: string | null;
  author: string | null;
  type: "blog_post" | "news" | "linkedin_post" | "tweet" | "press_release" | "other";
}

export class WebScraper {
  /**
   * Scrape a prospect's recent online content for personalization.
   * Uses a lightweight approach: fetch HTML and extract text content.
   */
  async scrapeProspectContent(
    prospectName: string,
    companyDomain: string | null,
    linkedinUrl: string | null,
    maxResults: number = 5,
  ): Promise<ScrapedContent[]> {
    const results: ScrapedContent[] = [];

    // Search for recent content by this person
    const searchQueries = this.buildSearchQueries(prospectName, companyDomain);

    for (const query of searchQueries) {
      try {
        const articles = await this.searchWeb(query, 3);
        results.push(...articles);
        if (results.length >= maxResults) break;
        await delay(500);
      } catch (error) {
        console.error(`Web search failed for query "${query}":`, error);
      }
    }

    // Try to scrape company blog/news
    if (companyDomain) {
      try {
        const companyContent = await this.scrapeCompanyNews(companyDomain);
        results.push(...companyContent);
      } catch (error) {
        console.error(`Company scraping failed for ${companyDomain}:`, error);
      }
    }

    return results.slice(0, maxResults);
  }

  /**
   * Scrape a specific URL and extract text content.
   */
  async scrapeUrl(url: string): Promise<ScrapedContent | null> {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) return null;

      const html = await response.text();
      return this.extractContent(url, html);
    } catch (error) {
      console.error(`Failed to scrape ${url}:`, error);
      return null;
    }
  }

  /**
   * Search the web for content about a person/company.
   * Uses a simple approach with public search APIs or direct site scraping.
   */
  private async searchWeb(query: string, maxResults: number): Promise<ScrapedContent[]> {
    // Use a search API (Google Custom Search, Bing, or SerpAPI)
    // For now, we'll structure the interface but the actual API call
    // depends on which search provider is configured
    const searchApiKey = process.env.SEARCH_API_KEY;
    const searchEngineId = process.env.SEARCH_ENGINE_ID;

    if (!searchApiKey || !searchEngineId) {
      // Fallback: try to scrape known content sites directly
      return this.fallbackSearch(query, maxResults);
    }

    try {
      const url = new URL("https://www.googleapis.com/customsearch/v1");
      url.searchParams.set("key", searchApiKey);
      url.searchParams.set("cx", searchEngineId);
      url.searchParams.set("q", query);
      url.searchParams.set("num", String(maxResults));
      url.searchParams.set("dateRestrict", "m6"); // Last 6 months

      const response = await fetch(url.toString());
      if (!response.ok) return [];

      const data = await response.json();
      const items = (data.items ?? []) as Array<{
        link: string;
        title: string;
        snippet: string;
      }>;

      return items.map((item) => ({
        url: item.link,
        title: item.title,
        text: item.snippet,
        publishedDate: null,
        author: null,
        type: "other" as const,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Fallback search for when no search API is configured.
   * Tries to find content on common platforms.
   */
  private async fallbackSearch(
    query: string,
    maxResults: number,
  ): Promise<ScrapedContent[]> {
    const results: ScrapedContent[] = [];

    // Try Google News RSS
    try {
      const newsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
      const response = await fetch(newsUrl, {
        headers: { "User-Agent": "OutboundAI/1.0" },
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const xml = await response.text();
        const items = this.parseRSSItems(xml);
        results.push(
          ...items.slice(0, maxResults).map((item) => ({
            url: item.link,
            title: item.title,
            text: item.description,
            publishedDate: item.pubDate,
            author: null,
            type: "news" as const,
          })),
        );
      }
    } catch {
      // Silent fail — this is best-effort
    }

    return results;
  }

  /**
   * Scrape a company's website for recent news/blog posts.
   */
  private async scrapeCompanyNews(domain: string): Promise<ScrapedContent[]> {
    const results: ScrapedContent[] = [];
    const commonPaths = ["/blog", "/news", "/press", "/resources"];

    for (const path of commonPaths) {
      try {
        const url = `https://${domain}${path}`;
        const response = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            Accept: "text/html",
          },
          signal: AbortSignal.timeout(5000),
          redirect: "follow",
        });

        if (response.ok) {
          const html = await response.text();
          const content = this.extractContent(url, html);
          if (content && content.text.length > 100) {
            results.push(content);
          }
        }
      } catch {
        // Try next path
      }
    }

    return results;
  }

  /**
   * Extract meaningful text content from HTML.
   */
  private extractContent(url: string, html: string): ScrapedContent {
    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch?.[1]?.trim() ?? url;

    // Extract meta description
    const metaDescMatch = html.match(
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i,
    );
    const metaDesc = metaDescMatch?.[1] ?? "";

    // Extract og:type for content classification
    const ogTypeMatch = html.match(
      /<meta[^>]*property=["']og:type["'][^>]*content=["']([^"']+)["']/i,
    );
    const ogType = ogTypeMatch?.[1] ?? "";

    // Extract article publish date
    const dateMatch =
      html.match(/<meta[^>]*property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<time[^>]*datetime=["']([^"']+)["']/i);
    const publishedDate = dateMatch?.[1] ?? null;

    // Extract author
    const authorMatch =
      html.match(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*property=["']article:author["'][^>]*content=["']([^"']+)["']/i);
    const author = authorMatch?.[1] ?? null;

    // Strip HTML tags and extract text from article/main content
    let text = html
      // Remove script and style tags with their content
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      // Remove all remaining HTML tags
      .replace(/<[^>]+>/g, " ")
      // Normalize whitespace
      .replace(/\s+/g, " ")
      .trim();

    // Take first 1000 characters
    if (text.length > 1000) {
      text = text.slice(0, 1000) + "...";
    }

    // Prepend meta description if available
    if (metaDesc) {
      text = metaDesc + "\n\n" + text;
    }

    const type = this.classifyContentType(url, ogType);

    return {
      url,
      title,
      text,
      publishedDate,
      author,
      type,
    };
  }

  /**
   * Classify the type of content based on URL and metadata.
   */
  private classifyContentType(
    url: string,
    ogType: string,
  ): ScrapedContent["type"] {
    const urlLower = url.toLowerCase();

    if (urlLower.includes("linkedin.com")) return "linkedin_post";
    if (urlLower.includes("twitter.com") || urlLower.includes("x.com")) return "tweet";
    if (urlLower.includes("/press") || urlLower.includes("prnewswire") || urlLower.includes("businesswire"))
      return "press_release";
    if (urlLower.includes("/blog") || ogType === "article") return "blog_post";
    if (urlLower.includes("/news") || urlLower.includes("techcrunch") || urlLower.includes("reuters"))
      return "news";

    return "other";
  }

  /**
   * Build search queries for finding prospect content.
   */
  private buildSearchQueries(
    prospectName: string,
    companyDomain: string | null,
  ): string[] {
    const queries: string[] = [];

    // Direct name search
    queries.push(`"${prospectName}" recent`);

    // Name + company
    if (companyDomain) {
      const companyName = companyDomain.replace(/\.\w+$/, "");
      queries.push(`"${prospectName}" "${companyName}"`);
      queries.push(`site:${companyDomain} blog OR news`);
    }

    // Name + LinkedIn
    queries.push(`"${prospectName}" site:linkedin.com`);

    return queries;
  }

  /**
   * Parse RSS XML to extract items.
   */
  private parseRSSItems(
    xml: string,
  ): Array<{ title: string; link: string; description: string; pubDate: string }> {
    const items: Array<{
      title: string;
      link: string;
      description: string;
      pubDate: string;
    }> = [];

    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1];
      const title = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] ?? "";
      const link = itemXml.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "";
      const description =
        itemXml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1] ?? "";
      const pubDate = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "";

      items.push({ title: title.trim(), link: link.trim(), description: description.trim(), pubDate: pubDate.trim() });
    }

    return items;
  }
}
