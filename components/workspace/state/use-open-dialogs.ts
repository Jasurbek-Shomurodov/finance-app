"use client";
import { useState } from 'react';
import type { EarningSource } from '@/lib/earning-sources';
import type { Entry } from '@/lib/finance';
import type { HistoryUpdateType } from '@/lib/investment-history';
import type { DrillTarget } from '@/lib/cash-flow-drill-types';

/** A Sankey to open over the page: what, its title, the month it is for, and what its schedule's details open. */
export type SankeyRequest = { target: DrillTarget; title: string; month: string; onDetails?: () => void };

/** Which of the shell's dialogs is open, and for which record: ending a schedule, splitting, viewing, a transaction's
 * Sankey, tracking a
 * holding, a mortgage or debt payment, an income source, or business setup (`guide` reopens only its closing guide,
 * from Settings). */
export function useOpenDialogs() {
    const [stopping,setStopping]=useState<Entry|null>(null);
    const [splitting,setSplitting]=useState<Entry|null>(null);
    const [viewing,setViewing]=useState<Entry|null>(null);
    /** A transaction row opens its Sankey (`TransactionSankey`); the transaction's details open from there. */
    const [drilling,setDrilling]=useState<Entry|null>(null);
    /** Any other Sankey a row opens over its page (a schedule's, a loan's), with what its own node's details open. */
    const [sankey,setSankey]=useState<SankeyRequest|null>(null);
    const [tracking, setTracking] = useState<Entry | null>(null);
    /** The Tracker's first update type when it was opened for one, such as Add investment on a business card. */
    const [trackingType, setTrackingType] = useState<HistoryUpdateType | null>(null);
    /** Opens the Tracker on Money invested: a purchase for the business (a computer) paid from a cash account. */
    const investIn = (record: Entry) => { setTrackingType('contribution'); setTracking(record); };
    const closeTracker = () => { setTracking(null); setTrackingType(null); };
    const [payingMortgage, setPayingMortgage] = useState<Entry | null>(null);
    const [debtPayment,setDebtPayment]=useState<Entry|null>(null);
    const [editingIncomeSource,setEditingIncomeSource]=useState<EarningSource|null>(null);
    const [settingUpBusinesses,setSettingUpBusinesses]=useState<boolean|'guide'>(false);
    /** Signing out closes the record dialogs and business setup. */
    const closeRecordDialogs = () => { setStopping(null); setSplitting(null); setViewing(null); setDrilling(null); setSankey(null); closeTracker(); setPayingMortgage(null); setSettingUpBusinesses(false); };
    return { stopping, setStopping, splitting, setSplitting, viewing, setViewing, drilling, setDrilling, sankey, setSankey, tracking, setTracking, trackingType, investIn, closeTracker, payingMortgage, setPayingMortgage, debtPayment, setDebtPayment, editingIncomeSource, setEditingIncomeSource, settingUpBusinesses, setSettingUpBusinesses, closeRecordDialogs };
}
