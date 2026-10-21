import type { CSSProperties } from 'react';
import { useLanguage } from '@/components/language-provider';
import { paletteColor, paletteLabels, type PaletteColor } from '@/lib/business';

/** A row of round colour swatches from the shared palette. With `automatic` (the default colour), a first swatch
 * returns to it and stands for `null`. */
export function ColorChoices({ value, colors, onChange, automatic, disabled, className }: { value: PaletteColor | null; colors: readonly PaletteColor[]; onChange: (color: PaletteColor | null) => void; automatic?: string; disabled?: boolean; className?: string }) {
 const { t } = useLanguage();
 return <fieldset className={className ? `business-color-field ${className}` : 'business-color-field'} disabled={disabled}><legend>{t('Colour')}</legend>
  <div role="radiogroup" aria-label={t('Colour')}>
   {automatic !== undefined && <button type="button" role="radio" aria-checked={value === null} aria-label={t('Automatic')} style={{ '--swatch': automatic } as CSSProperties} onClick={() => onChange(null)}/>}
   {colors.map(color => <button key={color} type="button" role="radio" aria-checked={value === color} aria-label={t(paletteLabels[color])} style={{ '--swatch': paletteColor(color) } as CSSProperties} onClick={() => onChange(color)}/>)}
  </div>
 </fieldset>;
}
