/** A link that opens Accounts with Transfer money already open: the bar's Add and the command menu use it. */
export const transferLink = '/accounts#transfer';
export const transferRequested = (hash: string) => hash === '#transfer';

// One home per feature: another page links to it with an anchor, and the home page opens it (`useHashRequest`).
/** The anchor that opens Cash flow's money flow diagram for the month it shows. */
export const flowHash = '#flow';
/** Cash flow with the month's money flow diagram open: Budget and Recurring link here. */
export const flowLink = '/income-expenses' + flowHash;
/** The anchor that opens the Rules list on Transactions. */
export const rulesHash = '#rules';
/** Transactions with the Rules list open: Settings, the command menu and the business guide link here. */
export const rulesLink = '/transactions' + rulesHash;
/** Budget at its spending watchlists (the element with this id): Cash flow › Spending links here. */
export const watchlistsLink = '/budget#watchlists';
/** Settings › Investment benchmarks, for the net worth chart the benchmarks are drawn on. */
export const benchmarksLink = '/settings#benchmarks';
/** Reports › Cash flow › Trends: every period, where Cash flow keeps the recent months. */
export const allPeriodsLink = '/reports?tab=cash_flow&view=trends';
/** Reports › Cash flow › Flow: the money flow diagram for any period. */
export const reportFlowLink = '/reports?tab=cash_flow&view=sankey';
/** Reports › Business tax prep. */
export const taxPrepLink = '/reports?tab=tax';
