'use client';
import { useEffect, useState } from 'react';

/**
 * False on the server and on the first browser paint, true once React has
 * attached its handlers. Credential forms keep their submit button disabled
 * until then: a tap that lands before hydration would otherwise be a native
 * form submit, which (with no method) puts the email and password in the URL
 * — browser history, server logs, analytics. Every form also has
 * method="post" as a second guard.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  return hydrated;
}
