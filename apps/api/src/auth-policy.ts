export function normalizeRegistrationEmail(value: string) {
  return value.trim().toLowerCase();
}

export function hasVerifiedEmail(identity: {
  email?: string;
  email_verified?: boolean;
}) {
  return Boolean(identity.email?.trim()) && identity.email_verified === true;
}
