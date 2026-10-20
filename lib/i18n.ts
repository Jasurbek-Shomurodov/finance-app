import en from './locales/en.json';
import es from './locales/es.json';
import pt from './locales/pt.json';
import ru from './locales/ru.json';
import ar from './locales/ar.json';
import zh from './locales/zh.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import fr from './locales/fr.json';
import hi from './locales/hi.json';
import ur from './locales/ur.json';
import bn from './locales/bn.json';
import th from './locales/th.json';
import vi from './locales/vi.json';
import uz from './locales/uz.json';
import de from './locales/de.json';
import it from './locales/it.json';
import tr from './locales/tr.json';
import id from './locales/id.json';
import ms from './locales/ms.json';
import pl from './locales/pl.json';
import uk from './locales/uk.json';
import nl from './locales/nl.json';
import cs from './locales/cs.json';
import ro from './locales/ro.json';
import fa from './locales/fa.json';
import he from './locales/he.json';
import fil from './locales/fil.json';
import sw from './locales/sw.json';
import { textIn } from './translations';
import type { Language } from './languages';

// Server code (the Telegram bot, scheduled reports, API routes) words messages in any language, so it reads every
// dictionary here. The browser bundles English only and fetches the language it shows (`lib/translations.ts`).
export type { Language } from './languages';
export { acceptedLanguages, detectLanguage, directionOf, isLanguage, languageCatalogue, languageCodes, locales } from './languages';
// Mexican Spanish shares the Spanish text; only its number and date formats differ.
export const dictionaries: Record<Language, Record<string, string>> = { en, es, 'es-MX': es, pt, fr, ru, ar, ur, hi, bn, zh, ja, ko, th, vi, uz, de, it, tr, id, ms, pl, uk, nl, cs, ro, fa, he, fil, sw };
export const translate = (language: Language, key: string, params: Record<string, string | number> = {}) => textIn(dictionaries[language], key, params);
