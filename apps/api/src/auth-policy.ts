export function normalizeRegistrationEmail(value: string) {
  return value.trim().toLowerCase();
}

export function hasVerifiedEmail(identity: {
  email?: string;
  email_verified?: boolean;
}) {
  return Boolean(identity.email?.trim()) && identity.email_verified === true;
}
import { hasOwnerVerificationException } from "@omnimail/shared";

export function satisfiesEmailVerification(identity: {
  uid?: string;
  email?: string;
  email_verified?: boolean;
  admin?: unknown;
}) {
  return hasVerifiedEmail(identity) || hasOwnerVerificationException(identity);
}
