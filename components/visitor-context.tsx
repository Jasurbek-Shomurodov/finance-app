"use client";
import { createContext, useContext, type ReactNode } from 'react';
import type { Language } from '@/lib/languages';

/** What the server knows about a visitor before the browser has checked the session. */
/** `user` is the signed-in person the server already verified from the access cookie. */
type Visitor = { signedOut: boolean; user?: string; language: Language; dictionary?: Record<string, string> };

const VisitorContext = createContext<Visitor>({ signedOut: false, language: 'en' });

export function VisitorProvider({ visitor, children }: { visitor: Visitor; children: ReactNode }) {
  return <VisitorContext.Provider value={visitor}>{children}</VisitorContext.Provider>;
}

export const useVisitor = () => useContext(VisitorContext);
