import { CanvasAPIError } from "./types.js";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export class CanvasClient {
  private baseURL: string;
  private token: string;
  private maxRetries: number;
  private retryDelay: number;

  constructor(token: string, domain: string, options?: { maxRetries?: number; retryDelay?: number }) {
    this.baseURL = `https://${domain}/api/v1`;
    this.token = token;
    this.maxRetries = options?.maxRetries ?? 3;
    this.retryDelay = options?.retryDelay ?? 1000;
  }

  async request<T>(
    method: HttpMethod,
    path: string,
    options?: { params?: Record<string, unknown>; body?: unknown }
  ): Promise<T> {
    const url = new URL(`${this.baseURL}${path}`);

    if (options?.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
          for (const v of value) {
            url.searchParams.append(`${key}[]`, String(v));
          }
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url.toString(), {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
          body: options?.body ? JSON.stringify(options.body) : undefined,
        });

        if (response.status === 429 || response.status >= 500) {
          if (attempt < this.maxRetries) {
            await this.sleep(this.retryDelay * Math.pow(2, attempt));
            continue;
          }
        }

        if (!response.ok) {
          let errorMessage: string;
          try {
            const errorData = await response.text();
            errorMessage = errorData.length > 200 ? errorData.substring(0, 200) + "..." : errorData;
          } catch {
            errorMessage = `HTTP ${response.status}`;
          }
          throw new CanvasAPIError(`Canvas API Error (${response.status}): ${errorMessage}`, response.status);
        }

        if (response.status === 204) {
          return undefined as T;
        }

        const data = await response.json();

        if (Array.isArray(data)) {
          return (await this.handlePagination(data, response)) as T;
        }

        return data as T;
      } catch (error) {
        if (error instanceof CanvasAPIError) throw error;
        if (attempt < this.maxRetries) {
          await this.sleep(this.retryDelay * Math.pow(2, attempt));
          continue;
        }
        throw new CanvasAPIError(`Network error: ${error instanceof Error ? error.message : String(error)}`, 0);
      }
    }

    throw new CanvasAPIError("Max retries exceeded", 0);
  }

  private async handlePagination(data: unknown[], response: Response): Promise<unknown[]> {
    const allData = [...data];
    let nextUrl = this.getNextPageUrl(response.headers.get("link"));

    while (nextUrl) {
      const nextResponse = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      });

      if (!nextResponse.ok) {
        throw new CanvasAPIError(
          `Pagination failed (HTTP ${nextResponse.status})`,
          nextResponse.status
        );
      }

      let nextData: unknown;
      try {
        nextData = await nextResponse.json();
      } catch (e) {
        throw new CanvasAPIError(
          `Failed to parse paginated response: ${e instanceof Error ? e.message : String(e)}`,
          0
        );
      }

      if (Array.isArray(nextData)) {
        allData.push(...nextData);
      }
      nextUrl = this.getNextPageUrl(nextResponse.headers.get("link"));
    }

    return allData;
  }

  private getNextPageUrl(linkHeader: string | null): string | null {
    if (!linkHeader) return null;
    const links = linkHeader.split(",");
    const nextLink = links.find((link) => link.includes('rel="next"'));
    if (!nextLink) return null;
    const match = nextLink.match(/<(.+?)>/);
    return match ? match[1] : null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Install generated API methods onto the prototype
import { installApiMethods } from "./generated/canvas-api.js";
installApiMethods(CanvasClient);
