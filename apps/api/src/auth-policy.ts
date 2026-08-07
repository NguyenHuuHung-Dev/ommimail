const temporaryEmailDomains = new Set([
  "10minutemail.com",
  "20minutemail.com",
  "emailondeck.com",
  "getnada.com",
  "guerrillamail.com",
  "mail.tm",
  "maildrop.cc",
  "mailinator.com",
  "moakt.com",
  "sharklasers.com",
  "temp-mail.org",
  "tempmail.com",
  "throwawaymail.com",
  "yopmail.com",
]);

export function normalizeRegistrationEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isTemporaryEmail(value: string) {
  const email = normalizeRegistrationEmail(value);
  const domain = email.split("@")[1] ?? "";
  return temporaryEmailDomains.has(domain) || domain.endsWith(".mail.tm") || /(^|[.-])(temp|tempmail|disposable|throwaway|guerrilla|mailinator)([.-]|$)/.test(domain);
}
