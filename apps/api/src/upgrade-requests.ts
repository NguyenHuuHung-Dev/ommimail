export const upgradeRequests = new Map<string, string>();

export function setUpgradeRequest(userId: string, requestedAt?: string) {
  if (requestedAt) upgradeRequests.set(userId, requestedAt);
  else upgradeRequests.delete(userId);
}
