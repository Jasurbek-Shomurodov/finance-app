"use client";
import Link from 'next/link';
import { Compass } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { Button } from '@/components/ui/button';

/** An address the workspace does not have (a mistyped or outdated link): one line and the way back. */
export function NotFoundPage() {
 const { t } = useLanguage();
 return <div data-page="Not found" className="content">
  <EmptyState icon={<Compass/>} title={t('Page not found')} description={t('This address does not open anything here.')}>
   <Button asChild><Link href="/">{t('Dashboard')}</Link></Button>
  </EmptyState>
 </div>;
}
