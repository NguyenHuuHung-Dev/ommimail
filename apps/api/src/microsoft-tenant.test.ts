import { afterEach, describe, expect, it, vi } from "vitest";
import { microsoftTenant } from "./oauth.js";

afterEach(() => vi.unstubAllEnvs());

describe("Microsoft OAuth tenant", () => {
  it("accepts personal and organizational accounts by default", () => {
    vi.stubEnv("MICROSOFT_TENANT_ID", "");
    expect(microsoftTenant()).toBe("common");
  });

  it("keeps an explicitly configured tenant", () => {
    vi.stubEnv("MICROSOFT_TENANT_ID", "organizations");
    expect(microsoftTenant()).toBe("organizations");
  });
});
