import type {MetadataRoute} from 'next';

/** Pages that only render a signed-in workspace (or a sign-in or account link) stay out of search; the landing page,
 * the privacy notice and the terms are what a search should find. tests/robots.mjs keeps the list in step with the
 * drawer. */
export const privatePaths=['/assistant','/accounts','/transactions','/income-expenses','/reports','/budget','/upcoming','/goals','/assets','/loans-debts','/recently-deleted','/settings','/sign-in','/auth/','/connect/','/api/'];

export default function robots():MetadataRoute.Robots{return {rules:[{userAgent:'*',allow:['/','/privacy','/terms'],disallow:privatePaths}]};}
