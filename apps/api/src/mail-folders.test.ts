import { describe, expect, it } from "vitest";
import type { MailMessage } from "@omnimail/shared";
import {
  decodeMailboxPath,
  encodeMailboxPath,
  findJunkMailboxPath,
  gmailFolderIds,
  mergeLatestMessages,
} from "./mail-folders.js";

const message = (id: string, receivedAt: string): MailMessage => ({
  id,
  accountId: "account",
  providerMessageId: id,
  folderIds: ["inbox"],
  labelIds: [],
  from: { address: "sender@example.com" },
  to: [],
  cc: [],
  subject: id,
  preview: "",
  isRead: false,
  isStarred: false,
  hasAttachments: false,
  receivedAt,
});

describe("mail folder normalization", () => {
  it("keeps Gmail promotions and spam distinguishable", () => {
    expect(gmailFolderIds(["INBOX", "CATEGORY_PROMOTIONS"])).toEqual([
      "inbox",
      "promotions",
    ]);
    expect(gmailFolderIds(["SPAM"])).toEqual(["spam"]);
  });

  it("merges folders by received time and removes duplicates", () => {
    const older = message("older", "2026-08-15T00:00:00.000Z");
    const newer = message("newer", "2026-08-16T00:00:00.000Z");
    expect(
      mergeLatestMessages([[older], [newer, older]], 10).map((item) => item.id),
    ).toEqual(["newer", "older"]);
  });

  it("discovers junk folders and round-trips mailbox paths", () => {
    expect(
      findJunkMailboxPath([
        { path: "INBOX" },
        { path: "[Gmail]/Spam", specialUse: "\\Junk" },
      ]),
    ).toBe("[Gmail]/Spam");
    const token = encodeMailboxPath("Junk Email");
    expect(decodeMailboxPath(token)).toBe("Junk Email");
  });
});
