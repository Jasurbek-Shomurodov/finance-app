import type { Entry } from './finance';

/** An expense's business or property as one choice ("Linked to"): `business:<id>`, `property:<id>`, or '' for none. A
 * property is the more specific link, so it shows when an expense carries both. */
export function linkedValue(entry: Pick<Entry, 'business_id' | 'property_id'>): string {
 return entry.property_id ? `property:${entry.property_id}` : entry.business_id ? `business:${entry.business_id}` : '';
}

/** The ids a "Linked to" choice sets. A business clears the property; a property keeps the business its cash account
 * belongs to (rent paid from a rental company's account is both), and clears any other. */
export function chooseLinked(value: string, accountBusiness?: string | null): Pick<Entry, 'business_id' | 'property_id'> {
 const [kind, id] = value.split(':');
 if (kind === 'business' && id) return { business_id: id, property_id: null };
 if (kind === 'property' && id) return { business_id: accountBusiness ?? null, property_id: id };
 return { business_id: null, property_id: null };
}
