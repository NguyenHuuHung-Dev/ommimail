import type { IdTokenResult, User } from "firebase/auth";
import { hasOwnerVerificationException } from "@omnimail/shared";

export function satisfiesClientEmailVerification(
  user: User,
  claims: IdTokenResult["claims"],
) {
  return (
    (user.emailVerified && claims.email_verified === true) ||
    hasOwnerVerificationException({
      uid: user.uid,
      email: user.email,
      admin: claims.admin,
    })
  );
}

export async function canEnterApp(user: User) {
  const { claims } = await user.getIdTokenResult();
  return satisfiesClientEmailVerification(user, claims);
}
