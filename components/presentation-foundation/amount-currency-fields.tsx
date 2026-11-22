"use client";
import { useId } from 'react';
import { FieldError } from '@/components/presentation-foundation/field-error';
import { useLanguage } from '@/components/language-provider';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { CurrencySelect } from '@/components/presentation-foundation/currency-select';

type Props={amount:number;currency:string;currencies:string[];savedCurrency?:string;disabled?:boolean;label?:string;amountPlaceholder?:string;currencyLocked?:boolean;max?:number;/** The figure a transaction form is about: drawn larger, ahead of its currency. */prominent?:boolean;/** Why the amount cannot be saved, as an English key: shown under the amount. */error?:string;onAmountChange:(amount:number)=>void;onCurrencyChange:(currency:string)=>void};

export function AmountCurrencyFields({amount,currency,currencies,savedCurrency,disabled,label,amountPlaceholder,currencyLocked=false,max=1e15,prominent=false,error,onAmountChange,onCurrencyChange}:Props){
 const {t}=useLanguage();
 const errorId=useId();
 return <div className={prominent?"form-grid amount-currency-row is-prominent":"form-grid amount-currency-row"}><label className="amount-value-field">{label??t('Amount')}{currencyLocked?` · ${currency}`:''}<FormattedNumberInput placeholder={amountPlaceholder} value={amount} max={max} requireEntry invalid={!!error} describedBy={error?errorId:undefined} onValueChange={amount=>onAmountChange(amount)}/><FieldError id={errorId} message={error}/></label>{!currencyLocked&&<CurrencySelect value={currency} currencies={currencies} savedCurrency={savedCurrency} disabled={disabled} onChange={onCurrencyChange}/>}</div>;
}
