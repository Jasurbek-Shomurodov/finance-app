"use client";
import {Suspense} from 'react';
import {useSearchParams} from 'next/navigation';
import {LanguageProvider} from '@/components/language-provider';
import {EmailLinkCard} from '@/components/email-link-card';
import {Brand} from '@/components/presentation-foundation/brand';
// An emailed link (confirm the address, or reset the password) lands here, in the same card as sign-in.
function Confirmation(){const query=useSearchParams();return <EmailLinkCard brand={<Brand/>} tokenHash={query.get('token_hash')??''} tokenType={query.get('type')??'email'}/>;}
export default function Confirm(){return <LanguageProvider><Suspense><Confirmation/></Suspense></LanguageProvider>;}
