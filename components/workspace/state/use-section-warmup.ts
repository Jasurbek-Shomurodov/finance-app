"use client";
import { useEffect } from 'react';
import { warmRead } from '@/hooks/use-owner-resource';
import { depositToday } from '@/lib/deposit-interest';
import { sectionReads } from '@/lib/section-reads';

/** The open screen's own reads start as soon as the owner is known, beside the workspace reads, rather than after the
 * screen mounts once settings have arrived. Each card then finds its reply under way or answered (`warmRead`). */
export function useSectionWarmup(owner: string | null, demo: boolean, section: string, revision: number) {
 useEffect(() => {
  if (!owner || demo) return;
  for (const read of sectionReads(section, depositToday())) warmRead(read.session ? 'session' : owner, read.url, read.revision ?? revision);
 }, [owner, demo, section, revision]);
}
