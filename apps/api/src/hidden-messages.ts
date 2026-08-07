const hidden = new Map<string, Set<string>>();
export const hiddenMessages = {
  has: (userId: string, id: string) => hidden.get(userId)?.has(id) ?? false,
  add: (userId: string, id: string) => {
    const set = hidden.get(userId) ?? new Set<string>();
    set.add(id);
    hidden.set(userId, set);
    return set.size;
  },
  restore: (userId: string, id: string) => {
    const set = hidden.get(userId) ?? new Set<string>();
    set.add(id);
    hidden.set(userId, set);
  },
};
