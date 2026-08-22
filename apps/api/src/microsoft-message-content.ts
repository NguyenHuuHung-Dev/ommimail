import type { Attachment } from "@omnimail/shared";

export type MicrosoftMessageBody = {
  contentType?: string;
  content?: string;
};

export type MicrosoftFileAttachment = {
  id?: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
  contentId?: string;
  contentBytes?: string;
};

const htmlToText = (value: string) => value
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<br\s*\/?\s*>/gi, "\n")
  .replace(/<\/p>/gi, "\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&#39;/gi, "'")
  .replace(/&quot;/gi, '"')
  .replace(/[ \t]+/g, " ")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

const escapePattern = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function extractMicrosoftContent(
  body?: MicrosoftMessageBody,
  sourceAttachments: MicrosoftFileAttachment[] = [],
) {
  const content = body?.content?.trim() || undefined;
  const isHtml = body?.contentType?.toLowerCase() === "html";
  let html = isHtml ? content : undefined;

  for (const attachment of sourceAttachments) {
    const contentId = attachment.contentId?.replace(/^<|>$/g, "").trim();
    if (!html || !attachment.isInline || !contentId || !attachment.contentBytes)
      continue;
    const mimeType = attachment.contentType || "application/octet-stream";
    html = html.replace(
      new RegExp(`cid:${escapePattern(contentId)}`, "gi"),
      `data:${mimeType};base64,${attachment.contentBytes}`,
    );
  }

  const attachments: Attachment[] = sourceAttachments
    .filter((attachment) => !attachment.isInline)
    .map((attachment, index) => ({
      id: attachment.id || `attachment-${index}`,
      filename: attachment.name || "attachment",
      mimeType: attachment.contentType || "application/octet-stream",
      size: Math.max(0, Number(attachment.size) || 0),
    }));

  return {
    textBody: content ? (isHtml ? htmlToText(content) : content) : undefined,
    sanitizedHtmlBody: html,
    attachments,
  };
}
