import { convert } from "html-to-text";
import type { MailMessage } from "@omnimail/shared";

// Conservative, local extraction: no message content leaves the mail API.
// Require a nearby verification phrase, not just an arbitrary number.
const context =
  /\b(?:otp|one[ -]time (?:password|code|passcode)|verification code|security code|authentication code|confirmation code|login code|sign[ -]in code|passcode)\b|mã\s+(?:xác\s+(?:minh|nhận)|bảo\s+mật|đăng\s+nhập|otp)/giu;
const candidate =
  /(?<![\p{L}\p{N}@.+/-])(?:\d{3}[ -]\d{3}|\d{4,8}|(?=[A-Z\d]{6,8}(?![A-Z\d]))(?=[A-Z\d]*[A-Z])(?=[A-Z\d]*\d)[A-Z\d]+)(?![\p{L}\p{N}@+/-]|\.\d)/gu;

export function extractOtp(
  message: Pick<
    MailMessage,
    "subject" | "textBody" | "preview" | "sanitizedHtmlBody"
  >,
): string[] {
  const plain = (value: string) =>
    /<[a-z][\s\S]*>/i.test(value)
      ? convert(value.slice(0, 150_000), {
          wordwrap: false,
          selectors: [
            { selector: "a", options: { ignoreHref: true } },
            { selector: "img", format: "skip" },
            { selector: "script", format: "skip" },
            { selector: "style", format: "skip" },
            { selector: "blockquote", format: "skip" },
            { selector: ".gmail_quote", format: "skip" },
            { selector: ".yahoo_quoted", format: "skip" },
          ],
        })
      : value.slice(0, 150_000);
  const body = plain(
    message.textBody || message.sanitizedHtmlBody || message.preview || "",
  );
  const fields = [
    message.subject,
    /^\s*\d{4,8}\s*$/.test(body) ? `${message.subject}\n${body}` : body,
  ];
  const results = new Set<string>();
  for (const field of fields) {
    // Stop at common reply/forward delimiters; old OTPs are not fresh codes.
    const text = plain(field || "").split(/\n\s*(?:On .+wrote:|From:|>)/i)[0];
    const hints = [...text.matchAll(context)];
    for (const match of text.matchAll(candidate)) {
      const start = match.index!;
      const end = start + match[0].length;
      const nearby = hints.some((hint) => {
        const hintEnd = hint.index! + hint[0].length;
        const gap =
          start >= hintEnd
            ? text.slice(hintEnd, start)
            : end <= hint.index!
              ? text.slice(end, hint.index!)
              : "";
        return (
          gap.length <= 65 &&
          !/[.!?\d]/.test(gap) &&
          !/expir|valid for|hết hạn|hiệu lực/i.test(gap)
        );
      });
      const after = text.slice(end, end + 25);
      const before = text.slice(Math.max(0, start - 25), start);
      // Ignore durations, amounts and obvious order/reference numbers.
      if (
        !nearby ||
        /^\s*(?:minutes?|seconds?|hours?|phút|giây|vnd|₫|usd|đồng)\b/i.test(
          after,
        ) ||
        /(?:order|invoice|ticket|phone|đơn hàng|hóa đơn)\s*[:#-]?\s*$/i.test(
          before,
        )
      )
        continue;
      results.add(match[0].replace(/[ -]/g, ""));
    }
  }
  return [...results].slice(0, 5);
}
