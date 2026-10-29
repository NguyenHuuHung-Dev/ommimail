type AccessEvent = {
  userId: string;
  reason: "disabled" | "deleted" | "role-changed";
};
const listeners = new Set<(event: AccessEvent) => void>();
export function onUserAccessChanged(listener: (event: AccessEvent) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function notifyUserAccessChanged(event: AccessEvent) {
  for (const listener of listeners) listener(event);
}
