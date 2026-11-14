import type { ReactNode } from 'react';
import { InfoHint } from '@/components/presentation-foundation/info-hint';

type Props = { label: string; hint?: ReactNode;
 /** The control's id, when one field carries the row; a row of several controls names them through `labelId` instead. */
 htmlFor?: string; labelId?: string;
 /** A tall control (a list, preview cards) keeps its label on its first line. */
 tall?: boolean; children: ReactNode };

/** One setting: its label on the left, its control on the right, and any explanation behind the ⓘ. */
export function SettingRow({ label, hint, htmlFor, labelId, tall, children }: Props) {
 return <div className="setting-row" data-tall={tall || undefined}>
  <span className="setting-label">{htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span id={labelId}>{label}</span>}{hint && <InfoHint>{hint}</InfoHint>}</span>
  <div className="setting-control">{children}</div>
 </div>;
}

/** A titled card of settings rows. */
export function SettingsCard({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
 return <section className="panel preferences-card"><header><h3>{title}{hint && <InfoHint>{hint}</InfoHint>}</h3></header>{children}</section>;
}
