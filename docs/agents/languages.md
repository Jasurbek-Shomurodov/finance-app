# Languages and audience

This is an international app, not an Uzbek one. It offers thirty interface
languages, all defined once in `lib/languages.ts`: English, Spanish, Mexican
Spanish, Portuguese, French, Russian, Arabic, Urdu, Hindi, Bengali, Chinese,
Japanese, Korean, Thai, Vietnamese, Uzbek, German, Italian, Turkish, Indonesian,
Malay, Polish, Ukrainian, Dutch, Czech, Romanian, Persian, Hebrew, Filipino and
Swahili. Uzbek is one option among equals:
never a default, never listed first, never special-cased.

- English is the default for new accounts. Signed-out pages (sign-in, account
  access) show no language selector and follow the browser's language list
  (`detectLanguage`). A saved language this version does not offer loads as English.
- A new language needs all of: an entry in `lib/languages.ts`, a locale file in
  `lib/locales/` with every English key and the same `{placeholders}` (enforced by
  `tests/locales.mjs`), month and weekday tables in `lib/pos-date-format.js`, a
  format test in `tests/format.mjs`, and a migration widening the
  `user_preferences.language` check.
- Arabic, Urdu, Persian and Hebrew are right to left; the language provider sets `dir`. Use logical
  CSS properties (`margin-inline-start`, `inset-inline-end`) in new rules.
- Amounts always use Latin digits, whatever the language. The financial report PDF
  falls back to English for scripts the bundled font cannot draw
  (`pdfUnsupportedLanguages`).
- Do not preselect or suggest a local currency for everyone. The country choice in
  the welcome setup picks the primary currency.
