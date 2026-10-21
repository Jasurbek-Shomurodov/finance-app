import type { CSSProperties } from 'react';
import { useLanguage } from '@/components/language-provider';
import { paletteColor, paletteLabels, type PaletteColor } from '@/lib/business';

const hex = /^#[0-9a-f]{6}$/i;

/** A row of round colour swatches from the shared palette. With `automatic` (the default colour), a first swatch
 * returns to it and stands for `null`. `presets` add fixed `#rrggbb` colours, and `custom` adds the system colour
 * picker for any other; its changes arrive while the picker is open, marked `live`. */
export function ColorChoices<C extends string = PaletteColor>({ value, colors, presets = [], custom = false, onChange, automatic, disabled, className }: { value: C | PaletteColor | null; colors: readonly PaletteColor[]; presets?: readonly C[]; custom?: boolean; onChange: (color: C | PaletteColor | null, live?: boolean) => void; automatic?: string; disabled?: boolean; className?: string }) {
 const { t } = useLanguage();
 const chosenCustom = custom && typeof value === 'string' && hex.test(value) && !presets.includes(value as C);
 return <fieldset className={className ? `business-color-field ${className}` : 'business-color-field'} disabled={disabled}><legend>{t('Colour')}</legend>
  <div role="radiogroup" aria-label={t('Colour')}>
   {automatic !== undefined && <button type="button" role="radio" aria-checked={value === null} aria-label={t('Automatic')} style={{ '--swatch': automatic } as CSSProperties} onClick={() => onChange(null)}/>}
   {colors.map(color => <button key={color} type="button" role="radio" aria-checked={value === color} aria-label={t(paletteLabels[color])} style={{ '--swatch': paletteColor(color) } as CSSProperties} onClick={() => onChange(color)}/>)}
   {presets.map(color => <button key={color} type="button" role="radio" aria-checked={value === color} aria-label={color} style={{ '--swatch': color } as CSSProperties} onClick={() => onChange(color)}/>)}
   {custom && <label className="color-custom" data-chosen={chosenCustom || undefined} style={chosenCustom ? { '--swatch': value } as CSSProperties : undefined} title={t('Custom colour')}>
    <input type="color" aria-label={t('Custom colour')} value={chosenCustom ? String(value).toLowerCase() : '#3b82f6'} onChange={event => onChange(event.currentTarget.value as C, true)}/>
   </label>}
  </div>
 </fieldset>;
}
