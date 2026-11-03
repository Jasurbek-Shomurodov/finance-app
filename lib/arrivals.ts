/** How many new rows at once still read as "someone just added this". More than that is a new page, a filter or a
 * first load, where every row is new and nothing has arrived. */
export const arrivalLimit = 3;

/** The ids in `ids` that were not in the list before, when that is a handful added to a list that was already
 * showing; otherwise none. A first render (`before` null) and an empty list before it never count as arrivals. */
export function freshIds(before: ReadonlySet<string> | null, ids: readonly string[], limit = arrivalLimit): string[] {
 if (!before?.size) return [];
 const fresh = ids.filter(id => !before.has(id));
 return fresh.length <= limit ? fresh : [];
}
