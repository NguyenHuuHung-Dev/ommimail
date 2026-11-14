// Paid access is separate from administrator-assigned Firebase roles. A payment
// never writes an unlimited Premium custom claim into a long-lived session.
export const premiumExpirations = new Map<string, string>();
const accessRevisions = new Map<string, number>();
export const premiumAccessRevision = (userId: string) =>
  accessRevisions.get(userId) ?? 0;
export function publishPaidPremium(
  userId: string,
  expiresAt: string,
  revision: number,
) {
  if (premiumAccessRevision(userId) !== revision) return;
  if (
    !(Date.parse(premiumExpirations.get(userId) ?? "") >= Date.parse(expiresAt))
  ) {
    premiumExpirations.set(userId, expiresAt);
  }
}
export function revokePaidPremium(userId: string) {
  accessRevisions.set(userId, premiumAccessRevision(userId) + 1);
  premiumExpirations.delete(userId);
}

export function hasPaidPremium(userId: string, now = Date.now()) {
  return Date.parse(premiumExpirations.get(userId) ?? "") > now;
}

export function addPremiumMonth(value: string) {
  const date = new Date(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}
