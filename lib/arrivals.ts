/** How many new rows at once still read as "someone just added this". More than that is a new page, a filter or a
 * reload, where nothing in particular arrived. */
export const arrivalLimit = 3;

/** What can arrive: a list item, a table row, a budget category row, a holding card, a day of transactions. */
export const arrivalRows = 'li,tr,.budget-category-row,.asset-card,.transaction-day';
/** Never an arrival: loading placeholders, table headings, and anything that opts out. */
const arrivalSkip = '[aria-busy=true],thead,[data-arrivals=off]';

/** Of the elements one DOM update inserted (`added`, moved elements already left out), the rows that joined a list
 * already on screen: each has a sibling that was there before. A whole new list, a page, or more than `limit` rows
 * at once is not an arrival. */
export function arrivedRows<T extends Element>(added: readonly T[], limit = arrivalLimit): T[] {
 const fresh = new Set<Element>(added);
 const rows = added.filter(element => element.matches(arrivalRows) && !element.closest(arrivalSkip)
  && [...(element.parentElement?.children ?? [])].some(sibling => !fresh.has(sibling)));
 return rows.length <= limit ? rows : [];
}
