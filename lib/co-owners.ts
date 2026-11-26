import { ownedPercent, shareOf, valuedKinds, type CoOwner, type Entry } from './finance';

/** How many other owners one asset can name (the database allows the same, migration 173). */
export const maxCoOwners = 12;
/** A name is at most this long, as the database requires. */
export const coOwnerNameLength = 60;
/** Shares are typed and summed as decimals; a sum within this of 100 is 100. */
const epsilon = 1e-9;

type Owned = Pick<Entry, 'kind' | 'ownership_percentage'> & Partial<Pick<Entry, 'co_owners'>>;

/** The other owners of an asset valued by hand, in the person's order; every other kind has none. */
export const coOwnersOf = (record: Owned): CoOwner[] =>
 valuedKinds.includes(record.kind) && Array.isArray(record.co_owners) ? record.co_owners.map(owner => ({ ...owner, percentage: Number(owner.percentage) })) : [];

/** What the co-owners hold together, in percent. */
export const coOwnedPercent = (owners: readonly CoOwner[]) => owners.reduce((sum, owner) => sum + (Number.isFinite(owner.percentage) ? owner.percentage : 0), 0);

/** What nobody is named for: 100 less the person's share and the co-owners'. Never below 0. */
export function unassignedPercent(record: Owned) {
 const left = 100 - ownedPercent(record) - coOwnedPercent(coOwnersOf(record));
 return left > epsilon ? left : 0;
}

/** One slice of an asset: the person's ('you'), a named co-owner's, or what is not assigned to anyone. `value` is that
 * slice of the whole value, or null when the whole value is not known. */
export type OwnershipPart = { key: string; role: 'you' | 'co-owner' | 'unassigned'; name: string; percentage: number; value: number | null; color: number };

/** Whether an asset is shared at all: the person owns less than all of it, or names someone with them. */
export const isShared = (record: Owned) => valuedKinds.includes(record.kind) && (ownedPercent(record) < 100 || coOwnersOf(record).length > 0);

/** The slices of an asset, the person's first, then each co-owner in the person's order, then the part nobody is named
 * for. `full` is the whole value; each slice is its share of it. `color` is the slice's place among the co-owners (0
 * for the person), so a bar and its legend paint the same person the same way. */
export function ownershipParts(record: Owned, full: number | null): OwnershipPart[] {
 const slice = (percentage: number) => full === null ? null : shareOf(full, percentage);
 const mine = ownedPercent(record), left = unassignedPercent(record);
 return [
  { key: 'you', role: 'you' as const, name: '', percentage: mine, value: slice(mine), color: 0 },
  ...coOwnersOf(record).map((owner, index) => ({ key: owner.id, role: 'co-owner' as const, name: owner.name, percentage: owner.percentage, value: slice(owner.percentage), color: index + 1 })),
  ...(left > 0 ? [{ key: 'unassigned', role: 'unassigned' as const, name: '', percentage: left, value: slice(left), color: -1 }] : []),
 ];
}

/** Why the list cannot be saved, named as the form shows it; empty when it can. */
export function coOwnersProblem(record: Owned): string {
 const owners = coOwnersOf(record);
 if (!owners.length) return '';
 if (owners.length > maxCoOwners) return 'Name at most 12 co-owners.';
 if (owners.some(owner => !owner.name.trim())) return 'Enter a name for each co-owner.';
 if (owners.some(owner => owner.name.trim().length > coOwnerNameLength)) return 'Keep each name under 60 characters.';
 if (owners.some(owner => !(owner.percentage > 0 && owner.percentage < 100))) return 'Enter a share above 0 for each co-owner.';
 if (ownedPercent(record) + coOwnedPercent(owners) > 100 + epsilon) return 'The shares add up to more than the whole asset.';
 return '';
}

/** A new co-owner for the form, offered what nobody holds yet. */
export const newCoOwner = (record: Owned): CoOwner => ({ id: crypto.randomUUID(), name: '', percentage: unassignedPercent(record) });

/** The list as it is saved: names trimmed. */
export const savedCoOwners = (owners: readonly CoOwner[]): CoOwner[] => owners.map(owner => ({ id: owner.id, name: owner.name.trim(), percentage: owner.percentage }));

/** The list with one co-owner moved to where another was dropped. */
export function moveCoOwner(owners: readonly CoOwner[], active: string, over: string): CoOwner[] {
 const from = owners.findIndex(owner => owner.id === active), to = owners.findIndex(owner => owner.id === over);
 if (from < 0 || to < 0 || from === to) return [...owners];
 const next = [...owners];
 const [moved] = next.splice(from, 1);
 next.splice(to, 0, moved);
 return next;
}

/** The largest share the person can give themselves while the co-owners keep theirs. */
export const maxOwnPercent = (record: Owned) => Math.max(0, 100 - coOwnedPercent(coOwnersOf(record)));
