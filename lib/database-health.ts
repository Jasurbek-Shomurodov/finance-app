/** What Settings' database check found: up to date, behind (with the versions when the database reports one), or
 * unanswered. `error` is a translation key. */
export type DatabaseHealth = { compatible: boolean; schemaVersion: number | null; requiredVersion: number | null; error: string };
const unreachable = 'Could not check the database. Please try again.';
const version = (value: unknown) => typeof value === 'number' && Number.isInteger(value) ? value : null;
export async function checkDatabaseHealth(read: typeof fetch = fetch): Promise<DatabaseHealth> {
 try {
  const response = await read('/api/database-status', { cache: 'no-store' });
  const result = await response.json().catch(() => ({})) as { compatible?: unknown; schemaVersion?: unknown; requiredVersion?: unknown; error?: unknown };
  const compatible = response.ok && result.compatible === true;
  return { compatible, schemaVersion: version(result.schemaVersion), requiredVersion: version(result.requiredVersion), error: compatible ? '' : typeof result.error === 'string' && result.error ? result.error : unreachable };
 } catch { return { compatible: false, schemaVersion: null, requiredVersion: null, error: unreachable }; }
}
