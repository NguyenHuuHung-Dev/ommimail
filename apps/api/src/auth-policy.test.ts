import { describe, expect, it } from "vitest";
import { isTemporaryEmail, normalizeRegistrationEmail } from "./auth-policy.js";

describe("registration email policy", () => {
  it("normalizes email before checking the domain", () => {
    expect(normalizeRegistrationEmail("  USER@Example.COM ")).toBe("user@example.com");
  });

  it("blocks known temporary mail domains", () => {
    expect(isTemporaryEmail("person@mail.tm")).toBe(true);
    expect(isTemporaryEmail("person@tempmail.com")).toBe(true);
    expect(isTemporaryEmail("person@company.com")).toBe(false);
  });
});
