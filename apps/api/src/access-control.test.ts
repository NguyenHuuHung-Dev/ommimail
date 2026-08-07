import { describe, expect, it } from "vitest";
import { compositeMessageAccountId, mayReadMailbox } from "./access-control.js";

describe("mailbox access isolation", () => {
  it("allows only the owner or an explicitly shared Premium user", () => {
    expect(mayReadMailbox({ ownerId: "owner", userId: "owner", role: "basic", shared: false })).toBe(true);
    expect(mayReadMailbox({ ownerId: "owner", userId: "guest", role: "premium", shared: true })).toBe(true);
    expect(mayReadMailbox({ ownerId: "owner", userId: "guest", role: "basic", shared: true })).toBe(false);
    expect(mayReadMailbox({ ownerId: "owner", userId: "attacker", role: "admin", shared: false })).toBe(false);
  });

  it("derives the owning mailbox from provider message IDs", () => {
    expect(compositeMessageAccountId("gmail-live:gmail-account:message")).toBe("gmail-account");
    expect(compositeMessageAccountId("microsoft-token:connection:message")).toBe("microsoft-token:connection");
    expect(compositeMessageAccountId("mailtm:account:message")).toBe("mailtm:account");
    expect(compositeMessageAccountId("unknown-message")).toBeUndefined();
  });
});
