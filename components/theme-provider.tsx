"use client";

import { flushSync } from 'react-dom';
import { ThemeProvider as NextThemeProvider, useTheme } from 'next-themes';
import { useLanguage } from '@/components/language-provider';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Follows the device's light or dark setting until the person picks one with the toggle, which is remembered (THEME-009). */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <NextThemeProvider attribute="data-theme" defaultTheme="system" enableSystem storageKey="hoggish-theme" disableTransitionOnChange>{children}</NextThemeProvider>;
}

type RevealDocument = Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } };

/** Switches between light and dark. Where the browser can, the new theme opens as a circle growing from `origin` (the
 * toggle that was pressed; the top of the page otherwise) while the old one stays underneath; `app/styles/motion.css`
 * draws it. Under reduced motion, or without view transitions, the theme simply changes. */
export function useThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  return (origin?: { x: number; y: number }) => {
    const next = resolvedTheme === 'light' ? 'dark' : 'light';
    const page = document as RevealDocument, root = document.documentElement;
    if (!page.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setTheme(next); return; }
    const x = origin?.x ?? window.innerWidth / 2, y = origin?.y ?? 0;
    root.style.setProperty('--theme-x', `${x}px`);
    root.style.setProperty('--theme-y', `${y}px`);
    root.style.setProperty('--theme-r', `${Math.ceil(Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)))}px`);
    root.dataset.themeSwitch = '';
    // The page must show the new theme before the transition's callback returns, so the update is flushed at once.
    page.startViewTransition(() => flushSync(() => setTheme(next))).finished.finally(() => { delete root.dataset.themeSwitch; });
  };
}

export function ThemeToggle() {
  const { t } = useLanguage();
  const switchTheme = useThemeSwitch();
  return <Button variant="outline" size="icon" className="theme-toggle" aria-label={t('Toggle light and dark mode')} title={t('Toggle light and dark mode')} onClick={event => { const box = event.currentTarget.getBoundingClientRect(); switchTheme({ x: box.left + box.width / 2, y: box.top + box.height / 2 }); }}><Sun className="theme-sun" size={18}/><Moon className="theme-moon" size={18}/></Button>;
}
