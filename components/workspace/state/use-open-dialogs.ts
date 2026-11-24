"use client";
import { useState } from 'react';
import type { EarningSource } from '@/lib/earning-sources';
import type { Entry } from '@/lib/finance';
import type { HistoryUpdateType } from '@/lib/investment-history';
import type { DrillScope, DrillTarget } from '@/lib/cash-flow-drill-types';
import type { PaymentPlan } from '@/lib/payment-plan';
import type { PlanningData } from '@/lib/planning';

/** A Sankey to open over the page: what, its title, the month it is for, and what its schedule's details open. */
export type SankeyRequest = { target: DrillTarget; title: string; month: string; onDetails?: () => void;
 /** Several months (a year on Budget) with their label; otherwise `month` alone. */ months?: string[]; period?: string;
 /** What was saved in the period, for a Savings Sankey (where it went). */ savings?: number;
 /** A report narrowed to some businesses or people: only their own income and spending count. */ scope?: DrillScope;
 /** What the opening page has already read for these months, and whether it runs to today: the dialog reads nothing again. */ ready?: { data: PlanningData; throughToday: boolean } };

/** Which of the shell's dialogs is open, and for which record: ending a schedule, splitting, viewing, a Money flow
 * Sankey, tracking a holding, Record payment, changing a recorded mortgage payment, an income source, or business setup (`guide` reopens only its closing guide,
 * from Settings). */
export function useOpenDialogs() {
    const [stopping,setStopping]=useState<Entry|null>(null);
    const [splitting,setSplitting]=useState<Entry|null>(null);
    const [viewing,setViewing]=useState<Entry|null>(null);
    /** The Sankey a Money flow button opens over its page (`TransactionSankey`), with what its own node's details open. */
    const [sankey,setSankey]=useState<SankeyRequest|null>(null);
    const [tracking, setTracking] = useState<Entry | null>(null);
    /** The Tracker's first update type when it was opened for one, such as Money invested from an asset card. */
    const [trackingType, setTrackingType] = useState<HistoryUpdateType | null>(null);
    /** Opens the Tracker on Money invested: a purchase or a repair for the asset, paid from a cash account. */
    const investIn = (record: Entry) => { setTrackingType('contribution'); setTracking(record); };
    const closeTracker = () => { setTracking(null); setTrackingType(null); };
    /** The payment the one Record payment dialog is open for, worked out when it was opened (`openPayment` on the workspace). */
    const [paying, setPaying] = useState<PaymentPlan | null>(null);
    /** The mortgage payment (its transaction) whose recorded amounts are being changed. */
    const [editingPayment, setEditingPayment] = useState<Entry | null>(null);
    const [editingIncomeSource,setEditingIncomeSource]=useState<EarningSource|null>(null);
    const [settingUpBusinesses,setSettingUpBusinesses]=useState<boolean|'guide'>(false);
    /** Signing out closes the record dialogs and business setup. */
    const closeRecordDialogs = () => { setStopping(null); setSplitting(null); setViewing(null); setSankey(null); closeTracker(); setPaying(null); setEditingPayment(null); setSettingUpBusinesses(false); };
    return { stopping, setStopping, splitting, setSplitting, viewing, setViewing, sankey, setSankey, tracking, setTracking, trackingType, investIn, closeTracker, paying, setPaying, editingPayment, setEditingPayment, editingIncomeSource, setEditingIncomeSource, settingUpBusinesses, setSettingUpBusinesses, closeRecordDialogs };
}
