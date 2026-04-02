export function diffById(previous = [], next = []) {
  const previousMap = new Map(previous.map((item) => [item.id, item]));
  const nextMap = new Map(next.map((item) => [item.id, item]));

  const added = next.filter((item) => !previousMap.has(item.id));
  const removed = previous.filter((item) => !nextMap.has(item.id));
  const changed = next.filter((item) => {
    const existing = previousMap.get(item.id);
    if (!existing) return false;

    if (
      item.updatedAt &&
      existing.updatedAt &&
      item.updatedAt !== existing.updatedAt
    ) {
      return true;
    }

    if (
      item.updatedAt &&
      existing.updatedAt &&
      item.updatedAt === existing.updatedAt
    ) {
      return false;
    }

    const keys = Object.keys(item);
    if (keys.length !== Object.keys(existing).length) return true;

    return keys.some((key) => {
      const currentValue = item[key];
      const previousValue = existing[key];

      if (currentValue === previousValue) return false;
      if (
        typeof currentValue === "object" &&
        typeof previousValue === "object"
      ) {
        return JSON.stringify(currentValue) !== JSON.stringify(previousValue);
      }
      return true;
    });
  });

  return { added, removed, changed };
}
