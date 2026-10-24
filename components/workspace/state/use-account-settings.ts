"use client";
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { requestJson } from '@/lib/api-client';
import { useSessionResource } from '@/hooks/use-owner-resource';
import { useLanguage } from '@/components/language-provider';
import { defaultPreferences, type Preferences } from '@/lib/currencies';
import { applyFont, resolveFont } from '@/lib/fonts';
import { needsOnboarding } from '@/lib/onboarding';

const noPreferences: Preferences | null = null;
/** The account's saved defaults (Settings): language, font, currencies and whether the welcome setup is done. The
 * sample workspace keeps them for the visit only. */
export function useAccountSettings(user: string | null, demo: boolean) {
    const { language, setDefaultLanguage, setLanguage } = useLanguage();
    const [preferencesData, setPreferencesData] = useState<Preferences>(defaultPreferences);
    const [currency, setCurrency] = useState<string>('USD');
    const applied = useRef(false);
    const [settingsRevision,setSettingsRevision]=useState(0);
    // The saved defaults of the signed-in account; the sample workspace never reads them.
    const remote = useSessionResource('/api/settings', !!user && !demo, settingsRevision, noPreferences);
    const settingsLoading = remote.loading, settingsError = remote.error;
    const retrySettings=()=>setSettingsRevision(n=>n+1);
    function applyPreferences(next: Preferences) { setPreferencesData(next); if (demo) setLanguage(next.language); else setDefaultLanguage(next.language); applyFont(resolveFont(next.font), !demo);
     // The first load applies the saved primary. After that the top bar's display currency stays while it is still preferred; only a currency that was removed falls back to the primary.
     setCurrency(current => applied.current && next.currencies.includes(current) ? current : next.currencies[0]); applied.current = true; }
    // An account that has not finished the welcome setup has chosen no language yet, so the one already showing (saved earlier or matched to the browser) stays until it does.
    const receivePreferences = useEffectEvent((loaded: Preferences) => applyPreferences(loaded.onboarded === false ? { ...loaded, language } : loaded));
    /** Stores preferences without applying them, so the welcome setup can show its closing screen first. */
    async function savePreferences(next: Preferences) {
        return requestJson<Preferences>('/api/settings', { method: 'PUT', body: next, fallback: 'Could not save changes.' });
    }
    const onboardingNeeded = needsOnboarding({ user, demo, loading: settingsLoading, error: settingsError, preferences: preferencesData });
    const restartOnboarding = async () => applyPreferences(await savePreferences({ ...preferencesData, onboarded: false }));
    // The loaded defaults are applied once they arrive (to this state, the language and the font), as the saved reply is.
    const loaded = remote.data;
    useEffect(() => { if (!loaded) return; let current = true; queueMicrotask(() => { if (current) receivePreferences(loaded); }); return () => { current = false; }; }, [loaded]);
    /** Signing out forgets the account's defaults. */
    const resetSettings = () => { setPreferencesData(defaultPreferences); setCurrency('USD'); };
    return { preferencesData, currency, setCurrency, applyPreferences, savePreferences, settingsLoading, settingsError, retrySettings, onboardingNeeded, restartOnboarding, resetSettings };
}
