"use client";
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { showError, showSaved } from '@/lib/feedback';
import { PreferencesSkeleton } from '@/components/presentation-foundation/screen-skeletons';
import { useEffect, useState } from 'react';

import { resolveFont } from '@/lib/fonts';
import { formatDate, formatMoney } from '@/lib/format';
import { useLanguage } from '@/components/language-provider';
import { languageCatalogue } from '@/lib/languages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { FontChoices, ThemeChoices } from '@/components/settings/appearance-choices';
import { CountryCombobox } from '@/components/settings/country-combobox';
import { PreferredCurrencies } from '@/components/settings/preferred-currencies';
import { SettingRow, SettingsCard } from '@/components/settings/setting-row';
import type { Preferences } from '@/lib/currencies';
import { requestJson } from '@/lib/api-client';
type Props = { ratesDate?: string | null; /** The rates behind the line beside the second currency. */ rates?: number | Record<string, number>; initial: Preferences; demo: boolean; onSaved: (p: Preferences) => void; loading: boolean; loadError: string; onRetry:()=>void; onRestartSetup?:()=>Promise<void> };
/** Profile & preferences: every setting is one row, label on the left and control on the right, inside a few titled cards.
 * Nothing waits for a Save button: a change saves at once, and a typed name once the owner pauses or leaves the field. */
export function SettingsPanel({ initial, demo, onSaved, loading, loadError, onRetry, onRestartSetup, ratesDate, rates }: Props) {
  const { t, locale } = useLanguage();
  const [draft, setDraft] = useState(initial);
  const [saved,setSaved]=useState(initial);
  const serialized=JSON.stringify(draft);
  const dirty=serialized!==JSON.stringify(saved);
  // Typing a name waits until the owner pauses or leaves the field; every other change saves at once.
  const typingName=dirty&&JSON.stringify({...draft,display_name:saved.display_name})===JSON.stringify(saved);
  const [committed,setCommitted]=useState('');
  const [failed,setFailed]=useState('');
  const [busy, setBusy] = useState(false);
  async function save(snapshot: Preferences) {
    setBusy(true);
    try {
      let next = { ...snapshot, display_name: (snapshot.display_name ?? '').trim() };
      if (!demo) next = await requestJson<typeof next>('/api/settings', { method: 'PUT', body: { ...snapshot, onboarded: undefined }, fallback: 'Could not save settings. Try again.' });
      onSaved(next); setSaved(next); setDraft(current => JSON.stringify(current) === JSON.stringify(snapshot) ? next : current); showSaved(next.language);
    } catch (error) { setFailed(JSON.stringify(snapshot)); showError((error as Error).message); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (loading || loadError || busy || !dirty || serialized === failed) return;
    const timer = setTimeout(() => void save(draft), typingName && committed !== serialized ? 900 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, loadError, busy, dirty, serialized, failed, typingName, committed]);
  return <section className="settings-page">
    <header className="preferences-heading"><h2>{t('Profile & preferences')}<InfoHint>{t('Keep your profile details, language, and currency preferences up to date.')}</InfoHint></h2></header>
    {loadError && <InlineError message={t(loadError)}><Button type="button" variant="outline" onClick={onRetry}>{t('Retry loading settings')}</Button></InlineError>}
    {loading ? <PreferencesSkeleton label={t('Loading settings…')}/> : <form onSubmit={event => { event.preventDefault(); setCommitted(serialized); }} className="settings-form preferences-form">
      <fieldset disabled={!!loadError} className="preferences-fields">
        <SettingsCard title={t('About you')} hint={t('Personal details for your profile.')}>
          <SettingRow label={t('Your name (optional)')} htmlFor="profile-name"><Input id="profile-name" name="name" autoComplete="given-name" maxLength={80} placeholder={t('What should we call you?')} value={draft.display_name ?? ''} onChange={event => setDraft({ ...draft, display_name: event.target.value })} onBlur={() => setCommitted(serialized)}/></SettingRow>
          <SettingRow label={t('Country / region (optional)')} htmlFor="profile-country"><CountryCombobox id="profile-country" label={t('Country / region (optional)')} value={draft.country ?? ''} onChange={country => setDraft({ ...draft, country })}/></SettingRow>
          {onRestartSetup && <SettingRow label={t('Welcome setup')} hint={t('Want to go through the welcome setup again?')}><Button type="button" variant="outline" size="sm" disabled={busy||dirty} onClick={() => { setBusy(true); onRestartSetup().catch(error => showError((error as Error).message)).finally(() => setBusy(false)); }}>{t('Run setup again')}</Button></SettingRow>}
        </SettingsCard>
        <SettingsCard title={t('Language and currencies')}>
          <SettingRow label={t('App language')} hint={t('Choose the language for the app.')} htmlFor="profile-language"><NativeSelect id="profile-language" value={draft.language} onChange={event => setDraft({ ...draft, language: event.target.value as Preferences['language'] })}>{languageCatalogue.map(item => <option key={item.code} value={item.code}>{item.native}</option>)}</NativeSelect></SettingRow>
          <SettingRow tall label={t('Preferred currencies')} labelId="profile-currencies" hint={t('Choose one or two. The first one becomes your primary currency.')}>
            <PreferredCurrencies labelId="profile-currencies" currencies={draft.currencies} rates={rates} onChange={currencies => setDraft({ ...draft, currencies })}>
              {/* The rates’ source and date; the free rates service asks for this credit. */}
              {!demo && ratesDate && <p className="preferences-rates-credit"><span suppressHydrationWarning>{t('Updated {date}', { date: formatDate(ratesDate, locale) })}</span><a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">Rates By Exchange Rate API</a></p>}
            </PreferredCurrencies>
          </SettingRow>
        </SettingsCard>
        <SettingsCard title={t('Appearance')}>
          <SettingRow tall label={t('Font')} labelId="profile-font" hint={t('Choose the font used across the app. It is saved to your account, so the web and mobile apps match.')}>
            <FontChoices labelId="profile-font" value={resolveFont(draft.font)} onChange={font => setDraft({ ...draft, font })} caption={t('Net worth')} figure={formatMoney(1234567, draft.currencies[0], locale)}/>
          </SettingRow>
          <SettingRow tall label={t('Theme')} labelId="profile-theme"><ThemeChoices labelId="profile-theme"/></SettingRow>
        </SettingsCard>
      </fieldset>
    </form>}
  </section>;
}
