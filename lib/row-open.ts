import type { KeyboardEvent, MouseEvent } from 'react';

/** Props that make a row or card open something (its details or history) by click, Enter or Space, focusable and labelled. A tap on
 * its own controls (buttons, links, fields, a menu, a details toggle) does only that, also from a menu React bubbles in
 * from a portal. `open` gets the event, whose currentTarget is the row. Without `open` it stays a plain row. */
export function openProps(open: ((event: MouseEvent | KeyboardEvent) => void) | undefined, label: string) {
 if (!open) return {};
 return {
  tabIndex: 0, 'aria-label': label, 'data-clickable': true,
  onClick: (event: MouseEvent) => {
   const target = event.target as HTMLElement;
   if ((event.currentTarget as HTMLElement).contains(target) && !target.closest('button,a,input,select,label,summary,[role=menu],[role=menuitem]')) open(event);
  },
  onKeyDown: (event: KeyboardEvent) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); open(event); } },
 };
}
