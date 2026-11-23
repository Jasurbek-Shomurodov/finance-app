import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceWithParts} from './helpers/source.mjs';
test('expense shortcut uses owned outstanding liabilities and guards unsaved changes',()=>{
 const ui=sourceWithParts('components/record-dialog.tsx');
 assert.match(ui,/planning.data.records.filter\(record=>liabilities.includes\(record.kind\)&&record.amount>0\)/);
 assert.match(ui,/planning.loading\?/);
 assert.match(ui,/planning.error\?/);
 // The tab is offered only where payments can be saved.
 assert.match(ui,/\{!schedule&&payments&&<TabsList/);
});
test('shortcut hands every debt to the one Record payment form, with the workspace\'s own saves',()=>{
 const workspace=fs.readFileSync('components/workspace/workspace-dialogs.tsx','utf8');
 assert.match(workspace,/payments=\{\{ mortgage: recordMortgagePayment, tracker: recordRepayment, planning: planning\.save \}\}/);
 assert.doesNotMatch(workspace,/debtPayment|payingMortgage|initialType="withdrawal"/);
 const form=fs.readFileSync('components/investment-tracker-form.tsx','utf8');
 assert.match(form,/initialType&&updateTypes.includes\(initialType\)\?initialType:updateTypes\[0\]/);
});

test('debt payment is a third segment and cannot submit an ordinary expense',()=>{
 const ui=sourceWithParts('components/record-dialog.tsx');
 assert.match(ui,/<TabsTrigger value="debt"/);
 assert.match(ui,/<TabsContent value="debt"/);
 assert.match(ui,/if\(mode==='debt'\)\{event.preventDefault\(\);return;\}/);
 assert.match(ui,/mode!=='debt'&&<Button className="primary"/);
 assert.doesNotMatch(ui,/showPayments|expense-debt-shortcut/);
});

test('a chosen debt embeds the shared payment form and guards draft switches',()=>{
 const ui=sourceWithParts('components/record-dialog.tsx');
 // A loan chosen here is paid as from its own row: kept in its Tracker history unless interest is entered.
 assert.match(ui,/planPayment\(\{record:selectedDebt,tracked:true\},planning\.data,today\(\)\)/);
 assert.match(ui,/<PaymentForm inline key=\{plan\.target\.id\} plan=\{plan\} data=\{planning\.data\} currencies=\{currencies\} saves=\{payments\}/);
 assert.match(ui,/requestPaymentSwitch\(change\)/);
 assert.match(ui,/paymentState.dirty/);
 assert.doesNotMatch(ui,/MortgagePaymentDialog|InvestmentTracker/);
 const payment=fs.readFileSync('components/payments/payment-form.tsx','utf8');
 // Inside the expense form it is no form of its own.
 assert.match(payment,/if \(inline\) return <><div className="record-form payment-form"/);
 assert.match(payment,/'Save payment'/);
});

test('the sample workspace keeps mortgage payments and explains that a loan repayment needs an account',()=>{
 const ui=sourceWithParts('components/record-dialog.tsx');
 assert.match(ui,/const available=!!plan&&!\(demo&&plan\.kind!=='mortgage'\);/);
 assert.match(ui,/Debt repayments are available in your signed-in workspace\./);
 // A repayment is still limited to what is owed, and may be any part of it.
 const plan=fs.readFileSync('lib/payment-plan.ts','utf8');
 assert.match(plan,/draft\.amount > plan\.due\) problems\.amount = 'Repayment cannot exceed the outstanding balance\.'/);
});
