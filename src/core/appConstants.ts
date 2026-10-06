const trimSlash = (url: string) => url.replace(/\/$/, "");

const browserOrigin = () => (typeof window === "undefined" ? "http://localhost:3005" : window.location.origin);

export class AppConstants {
  /** Serve every request from the in-browser mock backend until the real API is live. */
  static get useMockApi(): boolean {
    return process.env.NEXT_PUBLIC_USE_MOCK_API !== "false";
  }

  /** Must match `App:AppId` on tvs-accounting-bk; the API rejects any other value. */
  static get appId(): string {
    return process.env.NEXT_PUBLIC_APP_ID || "app-accounting";
  }

  static get baseUrl(): string {
    const apiUrl = process.env.NEXT_PUBLIC_BACKEND_ACCOUNTING_API_URL;
    if (this.useMockApi || !apiUrl) {
      if (!this.useMockApi && process.env.NODE_ENV === "production") {
        throw new Error("NEXT_PUBLIC_BACKEND_ACCOUNTING_API_URL is not set. Point it at the accounting API host.");
      }
      return `${browserOrigin()}/api/v1`;
    }
    return `${trimSlash(apiUrl)}/api/v1`;
  }

  /** Trovesuite Core Platform API: sign-up, login, OTP and password routes under /landingpage. */
  static get coreApiUrl(): string {
    const coreUrl = process.env.NEXT_PUBLIC_BACKEND_TROVESUITE_CORE_API_URL;
    if (this.useMockApi || !coreUrl) {
      if (!this.useMockApi && process.env.NODE_ENV === "production") {
        throw new Error("NEXT_PUBLIC_BACKEND_TROVESUITE_CORE_API_URL is not set. Point it at the Core Platform API host.");
      }
      return `${browserOrigin()}/mock-core/api/v1`;
    }
    return `${trimSlash(coreUrl)}/api/v1`;
  }

  /** The Core shell's login when it is configured, otherwise this app's own login page. */
  static get loginUrl(): string {
    const core = process.env.NEXT_PUBLIC_FRONTEND_CORE_URL;
    return core ? `${trimSlash(core)}/auth/login` : "/auth/login";
  }
}
