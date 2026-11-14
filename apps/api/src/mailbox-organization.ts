import crypto from "node:crypto";
import { Router } from "express";
import { getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import type { MailboxOrganization } from "@omnimail/shared";
import type { AuthRequest } from "./auth.js";
import { persistentStoreEnabled } from "./firestore-store.js";
import { accountOwners } from "./ownership.js";

// A separate document per mailbox prevents edits on different devices from
// overwriting unrelated mailbox preferences. User deletion removes this subtree.
const memory = new Map<string, Map<string, MailboxOrganization>>();
const collection = (userId: string) =>
  getFirestore()
    .collection("users")
    .doc(userId)
    .collection("mailboxOrganization");
export const organizationStore = {
  async list(userId: string): Promise<MailboxOrganization[]> {
    if (!persistentStoreEnabled)
      return [...(memory.get(userId)?.values() ?? [])];
    return (await collection(userId).get()).docs.map(
      (doc) => doc.data() as MailboxOrganization,
    );
  },
  async save(userId: string, value: MailboxOrganization) {
    if (!persistentStoreEnabled) {
      if (!memory.has(userId)) memory.set(userId, new Map());
      memory.get(userId)!.set(value.accountId, value);
      return;
    }
    const id = crypto
      .createHash("sha256")
      .update(value.accountId)
      .digest("hex");
    await collection(userId).doc(id).set(value);
  },
};

export const organizationRouter = Router();
organizationRouter.use((q, r, next) => {
  r.set("Cache-Control", "no-store");
  if (!["premium", "admin"].includes((q as AuthRequest).role))
    return r
      .status(403)
      .json({
        success: false,
        error: {
          code: "PREMIUM_REQUIRED",
          message: "Nhóm và ghim mailbox dành cho Premium.",
        },
      });
  next();
});
organizationRouter.get("/", async (q, r) => {
  const { userId } = q as AuthRequest;
  try {
    const values = await organizationStore.list(userId);
    // Revoked, removed and other users' mailboxes never appear here.
    return r.json({
      success: true,
      data: values.filter(
        (value) => accountOwners.get(value.accountId) === userId,
      ),
    });
  } catch {
    return r
      .status(503)
      .json({
        success: false,
        error: {
          code: "ORGANIZATION_UNAVAILABLE",
          message: "Chưa tải được nhóm mailbox. Hãy thử lại.",
        },
      });
  }
});
organizationRouter.put("/", async (q, r) => {
  const parsed = z
    .object({
      accountId: z.string().min(1).max(500),
      group: z
        .string()
        .trim()
        .max(40)
        .regex(/^[^\p{Cc}]*$/u),
      pinned: z.boolean(),
    })
    .strict()
    .safeParse(q.body);
  if (!parsed.success)
    return r
      .status(400)
      .json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Tên nhóm tối đa 40 ký tự, không chứa ký tự điều khiển.",
        },
      });
  const { userId } = q as AuthRequest;
  if (accountOwners.get(parsed.data.accountId) !== userId)
    return r
      .status(403)
      .json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Chỉ sắp xếp được mailbox của bạn.",
        },
      });
  try {
    await organizationStore.save(userId, parsed.data);
    return r.json({ success: true, data: parsed.data });
  } catch {
    return r
      .status(503)
      .json({
        success: false,
        error: {
          code: "ORGANIZATION_UNAVAILABLE",
          message: "Chưa lưu được thay đổi. Hãy thử lại.",
        },
      });
  }
});
