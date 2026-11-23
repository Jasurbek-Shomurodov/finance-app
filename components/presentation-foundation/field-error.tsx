"use client";
import { useLanguage } from '@/components/language-provider';

/** Why a field cannot be saved as it is, shown under that field and announced when it appears. `message` is the English
 * key (`values` fill its placeholders, already formatted); the field points at `id` with `aria-describedby` and sets
 * `aria-invalid`. Nothing is rendered without a message. */
export function FieldError({ id, message, values }: { id: string; message?: string; values?: Record<string, string | number> }) {
 const { t } = useLanguage();
 return message ? <small id={id} role="alert" className="field-error">{t(message, values)}</small> : null;
}
