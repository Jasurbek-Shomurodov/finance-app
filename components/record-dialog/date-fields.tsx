import { useLanguage } from '@/components/language-provider';
import { DatePicker } from '@/components/presentation-foundation/date-picker';
import { HintedLabel } from '@/components/presentation-foundation/hinted-label';
import { NativeSelect } from '@/components/ui/native-select';
import { depositToday as today } from '@/lib/deposit-interest';
import { liabilities, simpleInterestKinds, type Entry } from '@/lib/finance';
import { PaymentDayField } from './payment-day-field';
import type { FormContext } from './record-form';

/** When: the start of a debt, the day money was lent, the due or maturity date, and whether a cash flow repeats. */
export function DateFields({form}:{form:FormContext}){
 const {t}=useLanguage();
 const {editing,setEditing,editingCashFlow,field,existing,liability}=form;
 return <><div className="form-grid">{liability&&<HintedLabel label={t('Start date')} hint={t(existing?'Monthly payments fall on this day of each month. It cannot be after a recorded payment.':'When this debt or loan began. Enter the principal outstanding on that date, then record later repayments in Tracker.')}><DatePicker value={existing?editing.opened_on??'':editing.opened_on??today()} max={editing.date&&editing.date<today()?editing.date:today()} onChange={date=>field('opened_on',date)}/></HintedLabel>}{liability&&<PaymentDayField record={editing} onChange={date=>field('opened_on',date)}/>}{editing.kind === 'Money lent' && <label>{t("Date lent")}<DatePicker value={editing.lent_date || ''} max={editing.lent_from ? today() : undefined} onChange={value => field('lent_date', value)}/></label>}<DueDateField form={form}/>{editingCashFlow && <label>{t("Repeats")}<NativeSelect value={editing.frequency} onChange={e => setEditing({...editing,frequency:e.target.value as Entry['frequency'],account_id:null,end_date:e.target.value==='Once'?null:editing.end_date})}><option value="Once">{t("One time")}</option><option value="Monthly">{t("Every month")}</option><option value="Yearly">{t("Every year")}</option></NativeSelect></label>}</div></>;
}
/** A new account or holding is dated by its opening balance or purchase date alone; its record date follows that one. */
export const openingDated=(form:FormContext)=>['Cash','Stock','Crypto','Precious metals'].includes(form.editing.kind)&&!form.rows.some(row=>row.id===form.editing.id);
/** The record's own date: when money lent is due, when a bill or deposit matures, or when a cash flow is recorded or starts. */
function DueDateField({form}:{form:FormContext}){
 const {t}=useLanguage();
 const {editing,editingCashFlow,field,existing,liability}=form;
 if(openingDated(form))return null;
 return <><label>{editing.kind === 'Money lent' ? t("Due date (optional)") : simpleInterestKinds.includes(editing.kind) ? t("Maturity date") : editing.kind === 'Equity compensation' ? t("Vesting date") : ['Deposit', ...liabilities].includes(editing.kind) ? t("Due / maturity date") : editingCashFlow && editing.frequency !== 'Once' ? t("Start date") : t("Record date")}<DatePicker value={editing.date} required={editing.kind !== 'Money lent'} min={editing.kind === 'Money lent' ? editing.lent_date || undefined : liability || simpleInterestKinds.includes(editing.kind) ? editing.opened_on??(existing?undefined:today()) : undefined} onChange={value => field('date', value)}/></label></>;
}
/** Until when a repeating cash flow runs, and what it means. */
export function RecurrenceFields({form}:{form:FormContext}){
 const {t}=useLanguage();
 const {editing,setEditing,editingCashFlow,money,formatDate}=form;
 return <>{editingCashFlow && editing.frequency !== 'Once' && <label>{t("End date (optional)")}<DatePicker value={editing.end_date||''} required={false} min={editing.date} onChange={end_date=>setEditing({...editing,end_date:end_date||null})}/></label>}{editingCashFlow && editing.frequency !== 'Once' && <p className="recurrence-help">{t('{amount} {frequency} from {date}. This is a recurring plan; it does not automatically create transactions or change account balances.', { amount: money(editing.amount, editing.currency), frequency: t(editing.frequency === 'Monthly' ? 'every month' : 'every year'), date: formatDate(editing.date) })}</p>}</>;
}
