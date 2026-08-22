import { afterEach, describe, expect, it, vi } from "vitest";
import { microsoftTokens } from "./microsoft-token-accounts.js";

const contentAccount = "microsoft-content-test";
const listAccount = "microsoft-list-test";

const credential = {
  email: "owner@outlook.com",
  clientId: "client-id",
  refreshToken: "refresh-token",
};

afterEach(() => {
  vi.unstubAllGlobals();
  microsoftTokens.remove(contentAccount);
  microsoftTokens.remove(listAccount);
});

function tokenResponse() {
  return Response.json({ access_token: "access-token", expires_in: 3600 });
}

describe("Microsoft message content", () => {
  it("keeps HTML, a text fallback, inline images and file attachments", async () => {
    microsoftTokens.restore(contentAccount, credential);
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
      if (url.hostname === "login.microsoftonline.com") return tokenResponse();
      if (url.pathname.endsWith("/messages/message-1")) {
        return Response.json({
          id: "message-1",
          subject: "Netflix",
          bodyPreview: "Complete registration",
          receivedDateTime: "2026-08-22T06:19:00.000Z",
          hasAttachments: true,
          body: {
            contentType: "html",
            content: '<main><h1>Complete registration</h1><img src="cid:netflix-logo"><a href="https://netflix.com">Continue</a></main>',
          },
        });
      }
      if (url.pathname.endsWith("/messages/message-1/attachments")) {
        return Response.json({ value: [
          {
            id: "inline-logo",
            name: "logo.png",
            contentType: "image/png",
            size: 3,
            isInline: true,
            contentId: "<netflix-logo>",
            contentBytes: Buffer.from("png").toString("base64"),
          },
          {
            id: "terms",
            name: "terms.pdf",
            contentType: "application/pdf",
            size: 2048,
            isInline: false,
          },
        ] });
      }
      throw new Error(`Unexpected Microsoft request: ${url}`);
    }));

    const message = await microsoftTokens.get(contentAccount, "message-1");

    expect(message.textBody).toContain("Complete registration");
    expect(message.sanitizedHtmlBody).toContain("<h1>Complete registration</h1>");
    expect(message.sanitizedHtmlBody).toContain("data:image/png;base64,");
    expect(message.sanitizedHtmlBody).not.toContain("cid:netflix-logo");
    expect(message.attachments).toEqual([
      { id: "terms", filename: "terms.pdf", mimeType: "application/pdf", size: 2048 },
    ]);
  });

  it("follows Microsoft Graph pages beyond the first ten messages", async () => {
    microsoftTokens.restore(listAccount, credential);
    const makeMessage = (number: number, spam = false) => ({
      id: `${spam ? "junk" : "inbox"}-${number}`,
      subject: `Message ${number}`,
      bodyPreview: `Preview ${number}`,
      receivedDateTime: new Date(Date.UTC(2026, 7, 22, 12, 0, 0) - number * 1_000).toISOString(),
    });
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
      if (url.hostname === "login.microsoftonline.com") return tokenResponse();
      if (url.pathname.includes("/mailFolders/junkemail/messages")) {
        return Response.json({ value: Array.from({ length: 12 }, (_, index) => makeMessage(index + 1, true)) });
      }
      if (url.pathname.includes("/mailFolders/inbox/messages")) {
        const page = Number(url.searchParams.get("testPage") ?? "1");
        const start = (page - 1) * 50 + 1;
        const count = page < 3 ? 50 : 25;
        return Response.json({
          value: Array.from({ length: count }, (_, index) => makeMessage(start + index)),
          ...(page < 3 ? {
            "@odata.nextLink": `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?testPage=${page + 1}`,
          } : {}),
        });
      }
      throw new Error(`Unexpected Microsoft request: ${url}`);
    }));

    const messages = await microsoftTokens.list(listAccount);

    expect(messages).toHaveLength(137);
    expect(messages.some((message) => message.providerMessageId === "inbox-125")).toBe(true);
    expect(messages.some((message) => message.providerMessageId === "junk-12")).toBe(true);
  });
});
