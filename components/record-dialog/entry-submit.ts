"use client";
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import type { EntryField, FieldProblems } from '@/lib/record-save';

/** Where each field's control sits in the income and expense forms. */
const fieldControls: Record<EntryField, string> = {
 amount: '.amount-value-field input:not([disabled])',
 source: '[data-field="source"] :is(button,select):not([disabled])',
 name: '.record-name-field input:not([disabled])',
 account: '.cash-account-field button:not([disabled])',
};

/** Moves focus to the first field with a problem, in the order the form shows its fields. */
export function focusFirstProblem(form: Pick<ParentNode, 'querySelector'>, problems: FieldProblems) {
 const controls = (Object.keys(problems) as EntryField[]).map(field => fieldControls[field]);
 if (controls.length) form.querySelector<HTMLElement>(controls.join(','))?.focus();
}

/** ⌘Enter or Ctrl+Enter saves and starts the next one, when the form offers Save and add another. Keys pressed in a
 * popover of the form (a picker's search) are left alone. */
export function submitAnother(event: KeyboardEvent<HTMLFormElement>) {
 if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
 const form = event.currentTarget;
 if (!form.contains(event.target as Node)) return;
 const another = form.querySelector<HTMLButtonElement>('button[name="another"]:not([disabled])');
 if (!another) return;
 event.preventDefault();
 form.requestSubmit(another);
}

/** Submitting an income or expense form: a form with problems shows each under its field and focuses the first one
 * instead of saving. The problems stay hidden until a save was tried, then follow the form as it is corrected. */
export function useEntrySubmit(save: (event: FormEvent) => void) {
 const [attempted, setAttempted] = useState(false);
 return {
  shown: (problems: FieldProblems): FieldProblems => attempted ? problems : {},
  submit(event: FormEvent<HTMLFormElement>, problems: FieldProblems) {
   if (!Object.keys(problems).length) { save(event); return; }
   event.preventDefault();
   setAttempted(true);
   focusFirstProblem(event.currentTarget, problems);
  },
  shortcut: submitAnother,
 };
}
