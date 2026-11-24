/** Where signed-out visitors sign in. The main page shows them the product tour instead. */
export const signInPath = '/sign-in';
export const signUpPath = '/auth/access?mode=signup';
export const recoverPath = '/auth/access?mode=recover';
/** Where the browser keeps the email typed on sign-in while the person moves to Forgot password; it never travels in the address. */
const recoverEmailKey = 'hoggish-recover-email';
/** Remembers the email typed on sign-in for the Forgot password form, for this tab only. */
export function carryRecoverEmail(email: string) {
  try { if (email.trim()) sessionStorage.setItem(recoverEmailKey, email.trim()); } catch { /* storage is off: the form starts empty */ }
}
/** Takes the carried email, once. */
export function takeRecoverEmail(): string {
  try { const email = sessionStorage.getItem(recoverEmailKey) ?? ''; sessionStorage.removeItem(recoverEmailKey); return email; } catch { return ''; }
}
