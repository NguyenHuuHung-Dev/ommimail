import { describe, expect, it } from "vitest";
import {
  normalizeRegistrationEmail,
  satisfiesEmailVerification,
} from "./auth-policy.js";
import { OWNER_VERIFICATION_EXCEPTION } from "@omnimail/shared";

describe("registration email policy", () => {
  it("normalizes email before checking the domain", () => {
    expect(normalizeRegistrationEmail("  USER@Example.COM ")).toBe(
      "user@example.com",
    );
  });
});

describe("owner verification exception", () => {
  const owner = {
    ...OWNER_VERIFICATION_EXCEPTION,
    admin: true,
    email_verified: false,
  };
  it("allows only the pinned owner identity with a signed admin claim", () => {
    expect(satisfiesEmailVerification(owner)).toBe(true);
    expect(
      satisfiesEmailVerification({ ...owner, email: "OMMIMAIL@GMAIL.COM" }),
    ).toBe(true);
  });
  it.each([
    { ...owner, uid: "different-account" },
    { ...owner, admin: false },
    { ...owner, admin: undefined },
    { ...owner, email: "another-admin@gmail.com" },
    { ...owner, email: "ommimail+alias@gmail.com" },
    { ...owner, email: undefined },
  ])(
    "does not extend the exception to other identities or claimed roles",
    (identity) => {
      expect(satisfiesEmailVerification(identity)).toBe(false);
    },
  );
  it("keeps verified regular accounts eligible", () => {
    expect(
      satisfiesEmailVerification({
        uid: "normal",
        email: "normal@example.com",
        email_verified: true,
      }),
    ).toBe(true);
  });
});
