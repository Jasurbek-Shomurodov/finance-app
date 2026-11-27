import type { ReactNode } from 'react';
import { InfoHint } from '@/components/presentation-foundation/info-hint';

type Props = { title: ReactNode; hint?: ReactNode; count?: ReactNode; description?: ReactNode; children?: ReactNode };

/** The heading row of a `.panel`: one line with the title, an optional count pill and ⓘ explanation, and any aside or action
 * on the right. `description` is one short line under it saying what the panel is for (Settings sections). */
export function PanelTitle({ title, hint, count, description, children }: Props) {
 const heading = <h2>{title}{count}{hint && <InfoHint>{hint}</InfoHint>}</h2>;
 return <div className="panel-title">{description ? <div className="panel-title-text">{heading}<p className="panel-description">{description}</p></div> : heading}{children}</div>;
}
