"use client";
import { ChevronRight } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';

/** Questions the assistant answers well, beside the conversation: one press asks it. */
export function TryAsking({ questions, disabled, onAsk }: { questions: readonly string[]; disabled: boolean; onAsk: (question: string) => void }) {
 const { t } = useLanguage();
 return <aside className="panel assistant-prompts" aria-label={t('Try asking')}>
  <PanelTitle title={t('Try asking')}/>
  <ul>{questions.map(question => <li key={question}><button type="button" disabled={disabled} onClick={() => onAsk(question)}><span>{question}</span><ChevronRight size={16} aria-hidden="true"/></button></li>)}</ul>
 </aside>;
}

/** After an answer, the suggested questions not asked yet in this conversation, as chips to ask next. */
export function FollowUps({ questions, onAsk }: { questions: readonly string[]; onAsk: (question: string) => void }) {
 const { t } = useLanguage();
 if (!questions.length) return null;
 return <div className="assistant-suggestions" role="group" aria-label={t('Try asking')}>{questions.map(question => <button key={question} type="button" onClick={() => onAsk(question)}>{question}</button>)}</div>;
}
