"use client";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { DemoWorkspace } from '@/lib/demo-finance';
import type { HoldingAccount } from '@/lib/holding-accounts';
import type { Language } from '@/lib/languages';
import type { Entry } from '@/lib/finance';
import { renameSample, sampleInLanguage } from '@/lib/sample-names';
import { emptyTags, type TagData } from '@/lib/tags';

const noPlanning: Pick<DemoWorkspace,'goals'|'occurrences'|'categories'> = {goals:[],occurrences:[],categories:[]};

/** What the sample workspace keeps besides its records: investment accounts, goals and schedules, categories and
 * tags, seeded from the backend's sample and changed locally for the visit. The sample is English on the backend and
 * reads in the visitor's language: `seedSample` rewords it, and a language switch rewords what is still as seeded. */
export function useSampleWorkspace({ demo, language, setRows }: { demo: boolean; language: Language; setRows: Dispatch<SetStateAction<Entry[]>> }) {
    const [demoHoldingAccounts,setDemoHoldingAccounts]=useState<HoldingAccount[]>([]);
    const [demoPlanning,setDemoPlanning]=useState(noPlanning);
    const [demoTags,setDemoTags]=useState<TagData>(emptyTags);
    const wordedIn = useRef<Language>('en');
    /** The sample in the visitor's language, seeded here; the caller keeps the records it returns. */
    const seedSample = (served: DemoWorkspace) => {
        const sample = sampleInLanguage(served, 'en', language); wordedIn.current = language;
        setDemoHoldingAccounts(sample.holdingAccounts); setDemoPlanning({goals:sample.goals,occurrences:sample.occurrences,categories:sample.categories}); setDemoTags(sample.tags);
        return sample;
    };
    const clearSample = () => { setDemoHoldingAccounts([]); setDemoPlanning(noPlanning); setDemoTags(emptyTags); };
    useEffect(() => {
        const from = wordedIn.current;
        if (!demo || from === language) return;
        wordedIn.current = language;
        const reword = () => {
            setRows(rows => renameSample(rows, from, language)); setDemoHoldingAccounts(accounts => renameSample(accounts, from, language));
            setDemoPlanning(planning => ({ ...planning, goals: renameSample(planning.goals, from, language), categories: renameSample(planning.categories, from, language) }));
            setDemoTags(tags => ({ ...tags, tags: renameSample(tags.tags, from, language) }));
        };
        reword();
    }, [demo, language, setRows]);
    return { demoHoldingAccounts, setDemoHoldingAccounts, demoPlanning, demoTags, seedSample, clearSample };
}
