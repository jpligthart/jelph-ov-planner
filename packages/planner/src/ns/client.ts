const GATEWAY = "https://gateway.apiportal.ns.nl";

export class NsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds?: number,
    readonly errorType?: string,
  ) {
    super(message);
    this.name = "NsApiError";
  }

  get isDoorToDoorForbidden(): boolean {
    return (
      this.errorType === "API_KEY_NOT_ALLOWED_TO_PLAN_DOOR_TO_DOOR" ||
      /deur-tot-deur|door-to-door/i.test(this.message)
    );
  }
}

export type NsClientOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
};

export class NsClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: NsClientOptions) {
    if (!options.apiKey?.trim()) {
      throw new Error("NS_API_KEY is missing. Set it in the environment or .env file.");
    }
    this.apiKey = options.apiKey.trim();
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getJson<T>(
    path: string,
    query?: Record<
      string,
      | string
      | number
      | boolean
      | Array<string | number | boolean>
      | undefined
      | null
    >,
  ): Promise<T> {
    const url = new URL(path.startsWith("http") ? path : `${GATEWAY}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === "") continue;
        if (Array.isArray(value)) {
          for (const item of value) {
            url.searchParams.append(key, String(item));
          }
          continue;
        }
        url.searchParams.set(key, String(value));
      }
    }

    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Ocp-Apim-Subscription-Key": this.apiKey,
        "x-caller-id": "ns-smart-planner",
      },
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? "60");
      throw new NsApiError(
        `NS API rate limit hit (429). Retry after ~${retryAfter}s.`,
        429,
        Number.isFinite(retryAfter) ? retryAfter : 60,
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      let errorType: string | undefined;
      let detail = body.slice(0, 300);
      try {
        const parsed = JSON.parse(body) as {
          message?: string;
          errors?: Array<{ type?: string; message?: string }>;
        };
        errorType = parsed.errors?.[0]?.type;
        detail = parsed.errors?.[0]?.message ?? parsed.message ?? detail;
      } catch {
        // keep raw body snippet
      }
      throw new NsApiError(
        `NS API ${response.status} for ${url.pathname}: ${detail}`,
        response.status,
        undefined,
        errorType,
      );
    }

    return (await response.json()) as T;
  }
}

export function createNsClientFromEnv(): NsClient {
  const apiKey = process.env.NS_API_KEY ?? "";
  return new NsClient({ apiKey });
}
