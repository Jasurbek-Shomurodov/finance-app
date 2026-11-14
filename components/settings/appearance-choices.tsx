"use client";
import { useId, type ReactNode } from 'react';
import { useTheme } from 'next-themes';
import { useLanguage } from '@/components/language-provider';
import { fonts, type Font } from '@/lib/fonts';

type CardProps = { name: string; value: string; checked: boolean; onChoose: () => void; label: string; font?: Font; children?: ReactNode };

/** One choice as a card: a real radio button (so arrow keys move between the cards) under a preview of what it picks. */
function ChoiceCard({ name, value, checked, onChoose, label, font, children }: CardProps) {
 return <label className="choice-card" data-checked={checked || undefined} data-font={font}>
  <span className="choice-card-title"><input type="radio" name={name} value={value} checked={checked} onChange={onChoose}/>{label}</span>
  {children}
 </label>;
}

/** The interface font as preview cards: each shows a caption and a formatted figure set in that font. */
export function FontChoices({ value, onChange, caption, figure, labelId }: { value: Font; onChange: (font: Font) => void; caption: string; figure: string; labelId: string }) {
 const name = useId();
 return <div className="choice-cards" role="radiogroup" aria-labelledby={labelId}>{fonts.map(font => <ChoiceCard key={font.id} name={name} value={font.id} checked={value === font.id} onChoose={() => onChange(font.id)} label={font.name} font={font.id}>
  <span className="choice-card-caption" aria-hidden="true">{caption}</span><span className="choice-card-figure" aria-hidden="true">{figure}</span>
 </ChoiceCard>)}</div>;
}

const themes = [['light', 'Light'], ['dark', 'Dark'], ['system', 'Match system']] as const;

/** Light, dark or the device's own setting, each with a small picture of the app in it. Kept on this device, like the top bar's toggle. */
export function ThemeChoices({ labelId }: { labelId: string }) {
 const { t } = useLanguage();
 const { theme, setTheme } = useTheme();
 const name = useId();
 return <div className="choice-cards" data-columns="3" role="radiogroup" aria-labelledby={labelId}>{themes.map(([id, label]) => <ChoiceCard key={id} name={name} value={id} checked={(theme ?? 'system') === id} onChoose={() => setTheme(id)} label={t(label)}>
  <span className="theme-preview" data-preview={id} aria-hidden="true"><i/><i/></span>
 </ChoiceCard>)}</div>;
}
