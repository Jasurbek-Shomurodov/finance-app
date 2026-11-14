"use client";
import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUp, Plus, Sparkles } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { assistantSuggestions, assistantUnavailable } from '@/lib/assistant';
import { marketRates } from '@/lib/market';
import { Textarea } from '@/components/ui/textarea';
import { requestJson } from '@/lib/api-client';
import { signInPath } from '@/lib/sign-in-path';
import { FollowUps, TryAsking } from '@/components/assistant/try-asking';
const notAnswered = 'The assistant could not answer. Please try again.';

type Turn = { role: 'user' | 'assistant'; content: string };

// Ask the server up front whether the assistant is configured, so nobody types a question it cannot answer.
// Null while unknown, or when nobody is signed in (sample workspace).
function useAssistantAvailability(live: boolean, user: string | null) {
 const [status, setStatus] = useState<{ owner: string | null; available: boolean | null }>({ owner: null, available: null });
 useEffect(() => {
  if (!live) return;
  const controller = new AbortController();
  requestJson<{ available?: boolean }>('/api/assistant', { method: 'GET', signal: controller.signal })
   .then(result => setStatus({ owner: user, available: result.available !== false }))
   .catch(() => { if (!controller.signal.aborted) setStatus({ owner: user, available: true }); });
  return () => controller.abort();
 }, [live, user]);
 return [live && status.owner === user ? status.available : null, setStatus] as const;
}

/** AI assistant: ask about your own money in plain words. Questions and a summary of your records go to the model. */
export function AssistantScreen() {
 const { t, language } = useLanguage();
 const { user, demo, currency, market } = useWorkspace();
 const [turns, setTurns] = useState<Turn[]>([]);
 const [draft, setDraft] = useState('');
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const end = useRef<HTMLDivElement>(null);
 // The question in flight: leaving the screen stops it, so a paid answer nobody will read is not finished.
 const pending = useRef<AbortController | null>(null);
 useEffect(() => () => pending.current?.abort(), []);
 const [available, setStatus] = useAssistantAvailability(!demo && !!user, user);
 const unavailable = available === false;
 // Send says why it is off: the empty state already explains the sample workspace and a missing setup, so it points there.
 const reasonId = useId();
 const send = sendBlocker({ busy, demo, unavailable, asked: turns.length > 0, draft }, reasonId, t);
 const rates = marketRates(market) ?? {};
 async function ask(question: string) {
  const text = question.trim();
  if (!text || busy || demo || !user || !available) return;
  const next = [...turns, { role: 'user' as const, content: text }].slice(-19);
  setTurns(next); setDraft(''); setBusy(true); setError('');
  requestAnimationFrame(() => end.current?.scrollIntoView({ block: 'end' }));
  pending.current?.abort();
  const controller = new AbortController();
  pending.current = controller;
  try {
   const result = await requestJson<{ answer?: string }>('/api/assistant', { body: { messages: next, currency, rates, language }, signal: controller.signal, fallback: notAnswered });
   if (!result.answer) throw Error(notAnswered);
   setTurns([...next, { role: 'assistant', content: result.answer }]);
  } catch (reason) {
   // A question stopped on purpose is no failure: no message, and the conversation is not rewound.
   if (controller.signal.aborted) return;
   setTurns(turns); setDraft(text);
   // The server says the assistant is not set up: the empty state explains it instead of an error.
   if ((reason as Error).message === assistantUnavailable) { setStatus({ owner: user, available: false }); return; }
   setError((reason as Error).message);
  } finally {
   if (pending.current === controller) { pending.current = null; setBusy(false); requestAnimationFrame(() => end.current?.scrollIntoView({ block: 'end' })); }
  }
 }
 // A fresh conversation stops a question still in flight and clears the page.
 function restart() { pending.current?.abort(); pending.current = null; setBusy(false); setTurns([]); setDraft(''); setError(''); }
 const questions = assistantSuggestions.map(item => t(item));
 const asked = new Set(turns.filter(turn => turn.role === 'user').map(turn => turn.content));
 const answered = !busy && turns.at(-1)?.role === 'assistant';
 return <div data-page="Assistant" className="content assistant-content">
  <PageHeader title={t('Assistant')} hint={t('Your questions and a summary of your records are sent to Claude, an AI model by Anthropic, to answer them. Answers can be wrong and are not financial advice.')}>
   {turns.length > 0 && <Button onClick={restart}><Plus size={16} aria-hidden="true"/>{t('New conversation')}</Button>}
  </PageHeader>
  <div className="assistant-layout">
   <section className="panel assistant-panel" aria-label={t('Assistant')}>
    <div className={unavailable && !turns.length ? 'assistant-log is-unavailable' : 'assistant-log'} aria-live="polite">
     {turns.length ? turns.map((turn, index) => <div key={index} className="assistant-turn" data-role={turn.role}><p>{turn.content}</p></div>) : <AssistantEmpty id={reasonId} demo={demo} unavailable={unavailable}/>}
     {answered && <FollowUps questions={questions.filter(question => !asked.has(question)).slice(0, 3)} onAsk={ask}/>}
     {busy && <div className="assistant-turn" data-role="assistant"><p className="assistant-thinking">{t('Thinking…')}</p></div>}
     <div ref={end}/>
    </div>
    {error && <p className="form-error" role="alert">{t(error)}</p>}
    <form className="assistant-form" onSubmit={event => { event.preventDefault(); ask(draft); }}>
     <Textarea aria-label={t('Ask anything about your money')} placeholder={t('Ask anything about your money…')} value={draft} maxLength={4000} rows={2} disabled={demo || !user || !available} onChange={event => setDraft(event.currentTarget.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ask(draft); } }}/>
     <span title={send.title}><Button size="icon" disabled={busy || demo || !available || !draft.trim()} aria-label={t('Send')} aria-describedby={send.describedBy}><ArrowUp size={18}/></Button></span>
    </form>
    <p className="assistant-note">{t('The assistant can make mistakes and is not financial advice.')}</p>
   </section>
   {!unavailable && <TryAsking questions={questions} disabled={busy || demo || !available} onAsk={ask}/>}
  </div>
 </div>;
}

/** Before the first question: one sentence, and in the sample workspace a way to sign in (a full page load leaves it). */
function AssistantEmpty({ id, demo, unavailable }: { id: string; demo: boolean; unavailable: boolean }) {
 const { t } = useLanguage();
 if (unavailable) return <EmptyState id={id} icon={<Sparkles/>} title={t('The assistant isn’t available yet')} description={t('It will answer questions here once it has been set up for this app.')}/>;
 if (demo) return <EmptyState id={id} icon={<Sparkles/>} title={t('Ask anything about your money')} description={t('Sign in to ask about your own records.')}><Button asChild><a href={signInPath}>{t('Sign in')}</a></Button></EmptyState>;
 return <EmptyState id={id} icon={<Sparkles/>} title={t('Ask anything about your money')}/>;
}

type SendState = { busy: boolean; demo: boolean; unavailable: boolean; asked: boolean; draft: string };
/** Why Send is off. The empty state on screen already explains the sample workspace and a missing setup, so Send points to it (`describedBy`); other reasons are its `title`. */
function sendBlocker({ busy, demo, unavailable, asked, draft }: SendState, emptyId: string, t: (key: string) => string) {
 if (!asked && (demo || unavailable)) return { describedBy: emptyId, title: undefined };
 if (busy) return { describedBy: undefined, title: undefined };
 return { describedBy: undefined, title: unavailable ? t('The assistant isn’t available yet') : draft.trim() ? undefined : t('Type a question.') };
}
