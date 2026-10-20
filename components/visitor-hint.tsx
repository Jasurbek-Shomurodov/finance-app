import type { ReactNode } from 'react';
import { cookies, headers } from 'next/headers';
import { VisitorProvider } from '@/components/visitor-context';
import { acceptedLanguages, detectLanguage, dictionaries } from '@/lib/i18n';

/** Reads the request on the server so the public pages can be rendered there: a visitor
 * without session cookies is signed out, and the browser's language list picks the language. Its dictionary travels with
 * the page (English is already in the bundle), so the first render is in that language. */
export async function VisitorHint({ children }: { children: ReactNode }) {
  const jar = await cookies();
  const language = detectLanguage(acceptedLanguages((await headers()).get('accept-language')));
  return <VisitorProvider visitor={{ signedOut: !jar.has('hf_access') && !jar.has('hf_refresh'), language, dictionary: language === 'en' ? undefined : dictionaries[language] }}>{children}</VisitorProvider>;
}
