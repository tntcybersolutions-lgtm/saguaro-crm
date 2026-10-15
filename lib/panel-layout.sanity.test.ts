/**
 * @jest-environment node
 *
 * Arranged panels: a person's order and hidden panels save to their own
 * preferences (never another person's), come back the same, survive the page
 * adding a panel later, and reset to the standard layout.
 */
import { makeFakeDb } from './__fixtures__/fake-db';
import { describe, test, expect, beforeEach } from '@jest/globals';
declare const jest: { mock: (m: string, f: () => unknown) => void };

const fake = makeFakeDb();
let currentUser: { id: string; tenantId: string; email: string } | null = null;
jest.mock('@/lib/supabase-server', () => ({ createServerClient: () => fake.db, getUser: async () => currentUser, supabaseAdmin: {} }));

import { NextRequest } from 'next/server';
import { GET, PUT } from '@/app/api/layout-prefs/route';
import { arrange, move, cleanLayout } from '@/lib/panel-layout';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const U1 = { id: 'aaaaaaaa-0000-4000-8000-00000000ad01', tenantId: A, email: 'a@a.test' };
const U2 = { id: 'aaaaaaaa-0000-4000-8000-00000000ad02', tenantId: A, email: 'b@a.test' };
const get = async (scope: string) => (await GET(new NextRequest(`https://x.test/api/layout-prefs?scope=${scope}`))).json();
const put = async (body: unknown) => PUT(new NextRequest('https://x.test/api/layout-prefs', { method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));

beforeEach(() => { fake.reset(); currentUser = U1; fake.T('user_preferences').push({ id: 'p1', user_id: U1.id, tenant_id: A, custom_settings: { home_view: 'owner' } }); });

describe('panel layout', () => {
  test('arrange keeps the chosen order, drops hidden, and places new panels where they belong', () => {
    const defaults = ['brief', 'strip', 'jobs', 'money', 'activity'];
    expect(arrange(defaults, null)).toEqual(defaults);
    expect(arrange(defaults, { order: ['money', 'brief', 'jobs', 'strip', 'activity'], hidden: ['strip'] })).toEqual(['money', 'brief', 'jobs', 'activity']);
    // 'money' added to the page after the person arranged it: lands after 'jobs', its default neighbor.
    expect(arrange(defaults, { order: ['jobs', 'brief', 'strip', 'activity', 'gone'], hidden: [] })).toEqual(['jobs', 'money', 'brief', 'strip', 'activity']);
    expect(move(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b']);
    expect(move(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(cleanLayout({ order: ['ok', '<script>'], hidden: [] })).toBeNull();
  });

  test('saves to my preferences only, keeps my other settings, and reads back', async () => {
    expect((await put({ scope: 'home-owner', order: ['money', 'brief'], hidden: ['activity'] })).status).toBe(200);
    expect(await get('home-owner')).toEqual({ order: ['money', 'brief'], hidden: ['activity'] });
    expect(fake.T('user_preferences')[0].custom_settings.home_view).toBe('owner');
    currentUser = U2;
    expect(await get('home-owner')).toEqual({ order: [], hidden: [] });
    expect((await put({ scope: 'job-overview', order: ['steps'], hidden: [] })).status).toBe(200);
    expect(fake.T('user_preferences')).toHaveLength(2);
    expect(fake.T('user_preferences').find((r) => r.user_id === U1.id)!.custom_settings.layouts['job-overview']).toBeUndefined();
  });

  test('reset goes back to standard; bad input and no sign-in are refused', async () => {
    await put({ scope: 'home-owner', order: ['money'], hidden: [] });
    await put({ scope: 'home-owner', reset: true });
    expect(await get('home-owner')).toEqual({ order: [], hidden: [] });
    expect((await put({ scope: 'Home Owner!', order: [] })).status).toBe(400);
    expect((await put({ scope: 'home-owner', order: 'money' })).status).toBe(400);
    currentUser = null;
    expect((await put({ scope: 'home-owner', order: [] })).status).toBe(401);
  });
});
