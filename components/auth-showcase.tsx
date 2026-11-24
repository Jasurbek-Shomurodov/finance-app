"use client";

import { ChartPie, EyeOff, Globe, Target, Users, Wallet, type LucideIcon } from 'lucide-react';
import { AppPreview } from '@/components/app-preview';
import { useLanguage } from '@/components/language-provider';
import styles from './sign-in-screen.module.css';

// The real app in its sample workspace, stepping through the screens people use most. It is laid out wide enough that
// the dashboard sets its net worth chart first, beside the tiles, and all of the chart is in the window.
const showcaseTour = ['/', '/accounts', '/income-expenses', '/budget', '/goals'] as const;
const showcaseSize = { width: 1280, height: 800 };
// What sets Hoggish apart, each a feature that exists.
const features: readonly { icon: LucideIcon; label: string }[] = [
  { icon: ChartPie, label: 'Budget' }, { icon: Target, label: 'Goals' }, { icon: Users, label: 'Household' },
  { icon: Globe, label: '30 languages' }, { icon: Wallet, label: 'Multiple currencies' }, { icon: EyeOff, label: 'No ads, no tracking' },
];

/** The panel beside the sign-in card on wide screens: the promise in one line, the app itself with its charts, and
 * the features that set it apart. Nothing in it is drawn by hand. */
export function AuthShowcase() {
  const { t } = useLanguage();
  return <aside className={styles.showcase} aria-label={t('Sample data')}>
    <p className={styles.showcaseTitle}>{t('Take a clear look at your money.')}</p>
    <div className={styles.preview}><AppPreview tour={showcaseTour} size={showcaseSize}/></div>
    <ul className={styles.features}>{features.map(({ icon: Icon, label }) => <li key={label}><Icon size={15} aria-hidden="true"/>{t(label)}</li>)}</ul>
  </aside>;
}
