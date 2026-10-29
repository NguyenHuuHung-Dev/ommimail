import { accounts } from "./demo-data.js";
import { accountOwners } from "./ownership.js";
import { mailboxShares } from "./sharing.js";
import { gmailAppPasswords } from "./gmail-app-password.js";
import { microsoftTokens } from "./microsoft-token-accounts.js";
import { mailTm } from "./mail-tm.js";
import { microsoftGraph } from "./microsoft-graph.js";
import { gmail } from "./gmail.js";
import { removeOAuthCredential } from "./oauth.js";
import { clearMailboxSyncState } from "./sync-jobs.js";
import { deleteMailbox } from "./firestore-store.js";

export async function disconnectMailbox(accountId: string) {
  const index = accounts.findIndex((account) => account.id === accountId);
  if (index < 0) return false;
  const account = accounts[index];
  await deleteMailbox(accountId);
  if (account.id.startsWith("gmail-imap:"))
    gmailAppPasswords.remove(account.id.slice("gmail-imap:".length));
  else if (account.id.startsWith("microsoft-token:"))
    microsoftTokens.remove(account.id.slice("microsoft-token:".length));
  else if (account.id.startsWith("mailtm:")) {
    try {
      await mailTm.remove(account.id.replace(/^mailtm:/, ""));
    } catch {
      // The local connection should still be removable if the provider expired it.
    }
  } else {
    if (account.provider === "microsoft") microsoftGraph.clear(account.id);
    else gmail.clear(account.id);
    removeOAuthCredential(account.id);
  }
  const currentIndex = accounts.indexOf(account);
  if (currentIndex >= 0) accounts.splice(currentIndex, 1);
  accountOwners.delete(accountId);
  mailboxShares.delete(accountId);
  clearMailboxSyncState(accountId);
  return true;
}
