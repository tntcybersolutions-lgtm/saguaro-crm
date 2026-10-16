'use client';
/* The older owner-approval address. It used to be a second page that showed a
   made-up project and amount whenever its data was missing, and nothing at all
   once the link had been used. Every owner link now renders the one real
   review page (app/portals/owner/[token]) — same token, same API. */
export { default } from '@/app/portals/owner/[token]/page';
