import { describe, expect, it } from "vitest";
import { normalizeRegistrationEmail } from "./auth-policy.js";

describe("registration email policy", () => {
  it("normalizes email before checking the domain", () => {
    expect(normalizeRegistrationEmail("  USER@Example.COM ")).toBe("user@example.com");
  });
});
