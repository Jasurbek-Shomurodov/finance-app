import { requestJson } from '@/lib/api-client';
export type AccountAccessResult = { message?: string; next?: string };
/** Posts one account action (sign-up, recovery, password change, deletion) and throws the server's message on failure. */
export const requestAccountAccess = (body: Record<string, string>) => requestJson<AccountAccessResult>('/api/account-access', { body, fallback: 'Account service is unavailable. Please try again.' });
