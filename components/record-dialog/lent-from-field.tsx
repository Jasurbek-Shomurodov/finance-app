"use client";
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { ExchangeRatePreview } from '@/components/presentation-foundation/exchange-rate-preview';
import { NativeSelect } from '@/components/ui/native-select';
import { useLanguage } from '@/components/language-provider';
import { useDatedExchangeRate } from '@/hooks/use-dated-exchange-rate';
import { formatAccountOption, formatMoney } from '@/lib/format';
import { accountAmount, lendingAccounts } from '@/lib/record-balance';
import type { Entry } from '@/lib/finance';

/** The cash account new money lent was paid from: it leaves that account when the loan is saved. Optional, so a loan
 * made before the accounts were tracked can be entered without moving cash. An account in another currency (UZS lent
 * from a USD wallet) pays at the lent date's rate: the loan keeps its own amount, the account loses the converted one,
 * and the rate travels with the form as `lent_exchange_rate` for the server to check. */
export function LentFromField({entry,records,loading,error,busy,onChange}:{entry:Entry;records:Entry[];loading:boolean;error:string;busy:boolean;onChange:(id:string|null)=>void}){
 const {t,locale}=useLanguage();
 const accounts=lendingAccounts(records,entry.currency);
 const account=accounts.find(record=>record.id===entry.lent_from);
 const cross=!!account&&account.currency!==entry.currency;
 const fx=useDatedExchangeRate(cross?account.currency:undefined,entry.currency,entry.lent_date??'');
 const rate=cross?fx.rate:1;
 const paid=account&&rate?accountAmount(entry.amount,rate):null;
 const after=account&&paid!==null?Number(account.amount)-paid:null;
 return <div className="cash-account-field"><label>{t('Lent from account (optional)')}<NativeSelect disabled={busy||loading||!!error} value={account?.id??''} onChange={event=>onChange(event.target.value||null)}><option value="">{t('Not from an account')}</option>{accounts.map(option=><option key={option.id} value={option.id}>{formatAccountOption(option,locale)} · {option.currency}</option>)}</NativeSelect></label>
  {error&&<p className="error" role="alert">{t(error)}</p>}
  <input type="hidden" name="lent_exchange_rate" value={cross&&rate?rate:''}/>
  {cross&&<ExchangeRatePreview fx={fx}/>}
  {account&&after!==null&&<div className="ownership-summary" aria-live="polite"><p>{t('Cash deducted from {account}: {amount}',{account:account.name,amount:formatMoney(paid!,account.currency,locale)})}</p><p>{t('Cash balance after update')}: {formatMoney(after,account.currency,locale)}</p>{after<0&&<InlineError message={t('Not enough money in the selected cash account.')}/>}</div>}
 </div>;
}
