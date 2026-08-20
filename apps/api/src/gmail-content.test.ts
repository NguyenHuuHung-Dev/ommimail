import { afterEach, describe, expect, it, vi } from "vitest";
import { gmail, extractGmailContent } from "./gmail.js";
import { parsedMailContent } from "./gmail-app-password.js";
import { removeOAuthCredential, setOAuthCredential } from "./oauth.js";

const accountId = "gmail-content-test";

afterEach(() => {
  vi.unstubAllGlobals();
  gmail.clear(accountId);
  removeOAuthCredential(accountId);
});

describe("Gmail message content", () => {
  it("keeps nested HTML, plain text, inline images and attachments", async () => {
    const html = '<main><h1>Invitation</h1><img src="cid:logo@canva"><a href="https://canva.com">Open team</a></main>';
    const result = await extractGmailContent(
      {
        mimeType: "multipart/mixed",
        parts: [
          {
            mimeType: "multipart/alternative",
            parts: [
              { mimeType: "text/plain", body: { data: Buffer.from("Invitation text").toString("base64url") } },
              { mimeType: "text/html", body: { data: Buffer.from(html).toString("base64url") } },
            ],
          },
          {
            mimeType: "image/png",
            body: { attachmentId: "inline-logo", size: 3 },
            headers: [{ name: "Content-ID", value: "<logo@canva>" }],
          },
          {
            mimeType: "application/pdf",
            filename: "guide.pdf",
            body: { attachmentId: "guide", size: 2048 },
            headers: [{ name: "Content-Disposition", value: "attachment" }],
          },
        ],
      },
      async (id) => id === "inline-logo" ? Buffer.from("png").toString("base64url") : "",
    );

    expect(result.text).toBe("Invitation text");
    expect(result.html).toContain("<h1>Invitation</h1>");
    expect(result.html).toContain("data:image/png;base64,");
    expect(result.html).not.toContain("cid:logo@canva");
    expect(result.attachments).toEqual([
      { id: "guide", filename: "guide.pdf", mimeType: "application/pdf", size: 2048 },
    ]);
  });

  it("keeps HTML and attachments parsed through Gmail App Password", () => {
    expect(parsedMailContent({
      text: "Plain fallback",
      html: "<strong>Full HTML</strong>",
      attachments: [{ filename: "invoice.pdf", contentType: "application/pdf", size: 1024 }],
    }, 42)).toEqual({
      textBody: "Plain fallback",
      htmlBody: "<strong>Full HTML</strong>",
      attachments: [{ id: "42:0", filename: "invoice.pdf", mimeType: "application/pdf", size: 1024 }],
    });
  });

  it("loads more than twenty Gmail summaries once and reuses them on quick checks", async () => {
    setOAuthCredential(accountId, { access_token: "test-token", expiry_date: Date.now() + 60 * 60_000 });
    let metadataCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
      if (url.pathname.endsWith("/messages")) {
        const isSpam = url.searchParams.get("q") === "in:spam";
        if (isSpam) return Response.json({ messages: [] });
        const maxResults = Number(url.searchParams.get("maxResults"));
        const pageToken = url.searchParams.get("pageToken");
        if (pageToken === "second") {
          return Response.json({ messages: Array.from({ length: 27 }, (_, index) => ({ id: `message-${index + 41}` })) });
        }
        const firstPageSize = Math.min(maxResults, 40);
        return Response.json({
          messages: Array.from({ length: firstPageSize }, (_, index) => ({ id: `message-${index + 1}` })),
          ...(maxResults > 40 ? { nextPageToken: "second" } : {}),
        });
      }
      const match = url.pathname.match(/\/messages\/(message-\d+)$/);
      if (match) {
        metadataCalls += 1;
        const number = Number(match[1].slice("message-".length));
        return Response.json({
          id: match[1],
          threadId: `thread-${number}`,
          labelIds: ["INBOX", ...(number <= 3 ? ["UNREAD"] : [])],
          snippet: `Preview ${number}`,
          internalDate: String(Date.now() - number * 1_000),
          payload: {
            headers: [
              { name: "From", value: "Canva <no-reply@canva.com>" },
              { name: "To", value: "owner@example.com" },
              { name: "Subject", value: `Message ${number}` },
            ],
          },
        });
      }
      throw new Error(`Unexpected Gmail request: ${url}`);
    }));

    const first = await gmail.list(accountId);
    const second = await gmail.list(accountId);

    expect(first).toHaveLength(67);
    expect(second).toHaveLength(67);
    expect(metadataCalls).toBe(67);
  });
});
