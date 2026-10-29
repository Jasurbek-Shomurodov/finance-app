"use client";
import dynamic from 'next/dynamic';

// The workspace shell reaches these on every route, but a signed-in dashboard shows none of them at first: the public
// pages, onboarding and the dialogs (closed until a record, payment or split opens one). Each loads on its own, after the
// screen, instead of in the code every page waits for. The public pages keep their server rendering.
// next/dynamic needs its options written out as an object literal, so each call spells them out.
export const LandingPage = dynamic(() => import('@/components/landing-page').then(module => module.LandingPage));
export const SignInScreen = dynamic(() => import('@/components/sign-in-screen').then(module => module.SignInScreen));
export const OnboardingScreen = dynamic(() => import('@/components/onboarding-screen').then(module => module.OnboardingScreen), { ssr: false });
export const TelegramPanel = dynamic(() => import('@/components/telegram-panel').then(module => module.TelegramPanel), { ssr: false });
export const RecordDialog = dynamic(() => import('@/components/record-dialog').then(module => module.RecordDialog), { ssr: false });
export const TransactionDetailsDialog = dynamic(() => import('@/components/transaction-details-dialog').then(module => module.TransactionDetailsDialog), { ssr: false });
export const MortgagePaymentDialog = dynamic(() => import('@/components/mortgage-payment-dialog').then(module => module.MortgagePaymentDialog), { ssr: false });
export const SplitTransactionDialog = dynamic(() => import('@/components/transaction-tools-panel').then(module => module.SplitTransactionDialog), { ssr: false });
export const BusinessSetupFlow = dynamic(() => import('@/components/business-setup-flow').then(module => module.BusinessSetupFlow), { ssr: false });
export const JoinHouseholdDialog = dynamic(() => import('@/components/household-panel').then(module => module.JoinHouseholdDialog), { ssr: false });
export const IncomeSourceEditor = dynamic(() => import('@/components/income-sources-panel').then(module => module.IncomeSourceEditor), { ssr: false });
export const StopScheduleDialog = dynamic(() => import('@/components/stop-schedule-dialog').then(module => module.StopScheduleDialog), { ssr: false });
