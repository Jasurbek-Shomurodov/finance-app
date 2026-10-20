import en from './locales/en.json';
import type { Language } from './languages';

type Dictionary = Record<string, string>;

/** The browser's translations. English is bundled; every other language is fetched the first time it is shown
 * (`loadLanguage`), so a visitor downloads one dictionary instead of thirty. Server code reads them all through `lib/i18n`. */
const loaded: Partial<Record<string, Dictionary>> = { en };
// Mexican Spanish shares the Spanish text; only its number and date formats differ.
const fileOf = (language: Language) => language === 'es-MX' ? 'es' : language;

/** `key` as `dictionary` words it, with `{placeholders}` filled; a missing key reads as itself. */
export function textIn(dictionary: Dictionary, key: string, params: Record<string, string | number> = {}) {
  const text = Object.hasOwn(dictionary, key) ? dictionary[key] : key;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => params[name] === undefined ? match : String(params[name]));
}

export const languageLoaded = (language: Language) => !!loaded[fileOf(language)];

/** Keeps a dictionary the server sent with the page, so the first render is already in the visitor's language. */
export function addLanguage(language: Language, dictionary: Dictionary) {
  loaded[fileOf(language)] ??= dictionary;
}

/** Fetches a language's dictionary once; later calls reuse it. */
export async function loadLanguage(language: Language) {
  const file = fileOf(language);
  loaded[file] ??= (await import(`./locales/${file}.json`)).default as Dictionary;
}

/** A language not loaded yet reads in English until `loadLanguage` finishes; the language provider waits for it before switching. */
export const translate = (language: Language, key: string, params?: Record<string, string | number>) => textIn(loaded[fileOf(language)] ?? en, key, params);
