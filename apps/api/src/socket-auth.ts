import { getAuth } from "firebase-admin/auth";
import type { Socket } from "socket.io";
import { authConfigured, localAuthEnabled } from "./auth.js";
import { hasVerifiedEmail } from "./auth-policy.js";

export async function authenticateSocket(
  socket: Pick<Socket, "handshake" | "data">,
  next: (error?: Error) => void,
) {
  if (!authConfigured) {
    if (!localAuthEnabled)
      return next(new Error("Authentication is not configured"));
    socket.data.userId = "local-user";
    return next();
  }
  const token =
    typeof socket.handshake.auth?.token === "string"
      ? socket.handshake.auth.token
      : socket.handshake.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return next(new Error("Authentication required"));
  try {
    const decoded = await getAuth().verifyIdToken(token, true);
    if (!hasVerifiedEmail(decoded))
      return next(new Error("Email verification required"));
    socket.data.userId = decoded.uid;
    return next();
  } catch {
    return next(new Error("Invalid or expired session"));
  }
}
