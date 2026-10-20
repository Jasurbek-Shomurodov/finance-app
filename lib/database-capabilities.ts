export const requiredSchemaVersion = 150;
export const databaseUpdateMessage = 'The app database needs an update. Ask the administrator to apply the latest migrations.';
/** The migration number `finance_capabilities()` reports, or null when the answer carries none. */
export function schemaVersionOf(value: unknown): number | null {
 const version = value && typeof value === 'object' ? (value as Record<string, unknown>).schema_version : undefined;
 return typeof version === 'number' && Number.isInteger(version) ? version : null;
}
export function supportsDatabase(value: unknown): boolean {
 const version = schemaVersionOf(value);
 if (version === null) return false;
 const data=value as Record<string,unknown>;
 return version>=requiredSchemaVersion && data.record_revisions===true && data.verified_restore===true;
}
