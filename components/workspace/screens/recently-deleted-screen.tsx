"use client";
import { RecentlyDeleted } from '@/components/recently-deleted';
import { useRestorePreview } from '@/components/deleted-items/use-restore-preview';
import { useWorkspace } from '@/components/workspace/workspace-provider';

export function RecentlyDeletedScreen() {
 const { demo, deletedItems, restoreDemoItem, discardDeletedItem, refreshRecords, navigate } = useWorkspace();
 const context = useRestorePreview();
 return <div data-page="Recently deleted" className="content">
  <RecentlyDeleted demo={demo} demoItems={deletedItems} onRestore={restoreDemoItem} onDelete={discardDeletedItem} onSaved={refreshRecords} context={context} onBrowse={() => navigate('/transactions')}/>
 </div>;
}
