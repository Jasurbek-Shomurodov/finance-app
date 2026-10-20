"use client";

import { useContext, useEffect, useState } from 'react';
import { detectLanguage, directionOf, isLanguage, locales, type Language } from '@/lib/languages';
import { addLanguage, languageLoaded, loadLanguage, translate } from '@/lib/translations';

import { LanguageContext } from '@/components/language-context';
import { useVisitor } from '@/components/visitor-context';

// The language most recently asked for, so a slow dictionary never overrides a later choice.
let wanted: Language | null = null;
/** The page stays in its current language until the next one's dictionary has arrived; the latest choice wins. */
function switchTo(next: Language, show: (language: Language) => void) {
  wanted = next;
  if (languageLoaded(next)) show(next);
  else loadLanguage(next).then(() => { if (wanted === next) show(next); }, () => { /* Offline: keep the language on screen. */ });
}

/** `initial` is the language the server rendered in (by default the request's, from `VisitorHint`); a saved choice or the browser's own list still takes over after loading. */
export function LanguageProvider({ children, initial: given }: { children: React.ReactNode; initial?: Language }) {
  const visitor = useVisitor();
  const initial = given ?? visitor.language;
  if (visitor.dictionary) addLanguage(visitor.language, visitor.dictionary);
  const [language, showLanguage] = useState<Language>(initial);
  const updateLanguage = (next: Language) => switchTo(next, showLanguage);
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem('hoggish-default-language'); } catch { /* Language selection also works when browser storage is blocked. */ }
    // Nothing chosen yet: follow the browser. Only an explicit choice is ever saved as the default.
    const chosen = isLanguage(saved) ? saved : detectLanguage(typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]);
    if (chosen !== initial) queueMicrotask(() => switchTo(chosen, showLanguage));
    const sync = (event: StorageEvent) => {
      if (event.key === 'hoggish-default-language' && isLanguage(event.newValue)) switchTo(event.newValue, showLanguage);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [initial]);
  useEffect(() => {
    document.documentElement.lang = language;
    // Arabic and Urdu read right to left.
    document.documentElement.dir = directionOf(language);
  }, [language]);
  const setLanguage = (next: Language) => updateLanguage(next);
  const setDefaultLanguage = (next: Language) => {
    updateLanguage(next);
    try { localStorage.setItem('hoggish-default-language', next); } catch {}
  };
  return <LanguageContext.Provider value={{ language, setLanguage, setDefaultLanguage }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider');
  return { ...context, locale: locales[context.language], t: (key: string, params?: Record<string, string | number>) => translate(context.language, key, params) };
}
