'use client';
import { useEffect, useState } from 'react';
import { isNative } from '@/lib/native';

/**
 * True inside the iPhone app (the Capacitor shell), false in a browser.
 *
 * The app is a free companion to the paid web platform, so App Store rules
 * (3.1.1 / 3.1.3) mean it shows no way to buy or change a plan: plan and add-on
 * purchase buttons render only in a browser. Starts false so the server render
 * and the first client render match; flips after mount.
 */
export function useInApp(): boolean {
  const [inApp, setInApp] = useState(false);
  useEffect(() => { setInApp(isNative()); }, []);
  return inApp;
}
