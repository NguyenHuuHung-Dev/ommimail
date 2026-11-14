import { describe, expect, it } from "vitest";
import { extractOtp } from "./otp.js";
const extract = (textBody: string, subject = "") =>
  extractOtp({ textBody, subject, preview: "" });

describe("conservative OTP extraction", () => {
  it.each([
    ["Your verification code is 012345. Expires in 10 minutes.", ["012345"]],
    ["Mã xác nhận của bạn: 987654", ["987654"]],
    ["Security code: AB12CD", ["AB12CD"]],
    ["Verification code: 123 456", ["123456"]],
    ["765432 is your verification code.", ["765432"]],
    ["OTP: 4567\nMã bảo mật: 87654321", ["4567", "87654321"]],
    ["Order 123456 is ready. Total 2000 VND. Call +84987654321.", []],
    ["Your verification code expires in 2026. Order: 456789", []],
    ["Your security code expires in 1000 seconds", []],
    ["Verification code: 123456789", []],
    ["Verification code: https://example.test/123456", []],
  ])("reads %s", (body, expected) => expect(extract(body)).toEqual(expected));
  it("decodes HTML entities and ignores attributes, links, styles and quoted replies", () => {
    expect(
      extractOtp({
        subject: "",
        preview: "",
        sanitizedHtmlBody:
          '<style>.x{width:123456px}</style><p>Verification code:&nbsp;<b>123456</b></p><a href="https://test/555555">Sign in</a><blockquote>OTP: 999999</blockquote>',
      }),
    ).toEqual(["123456"]);
  });
  it("deduplicates subject/body and avoids old quoted plaintext codes", () => {
    expect(
      extract(
        "OTP: 123456\nOn Monday someone wrote:\nOTP: 999999",
        "OTP: 123456",
      ),
    ).toEqual(["123456"]);
  });
  it("does not guess when a message contains no verification context", () => {
    expect(extract("Welcome! Your invoice is 654321. Happy 2026.")).toEqual([]);
  });
  it("uses a verification subject for a body containing only the code", () => {
    expect(extract("004321", "Your verification code")).toEqual(["004321"]);
  });
});
