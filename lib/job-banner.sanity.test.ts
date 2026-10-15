/**
 * @jest-environment node
 *
 * The job banner's rules: the 4-day outlook from NWS periods, the stop-work
 * flags, the wind parser, the avatar row, initials, photo fit and days left.
 */
import { describe, test, expect } from '@jest/globals';
import { outlookFromPeriods, stopWorkFlags, windMph, trimTeam, initials, photoFit, daysLeft } from './job-banner';

const P = (startTime: string, isDaytime: boolean, temperature: number, windSpeed: string, rain: number | null, name = '') => ({
  startTime, isDaytime, temperature, temperatureUnit: 'F', windSpeed, windDirection: 'SW', name, shortForecast: isDaytime ? 'Sunny' : 'Clear',
  icon: 'https://api.weather.gov/icons/land/day/skc', probabilityOfPrecipitation: { value: rain },
});

describe('windMph', () => {
  test('takes the top of a range', () => { expect(windMph('10 to 25 mph')).toBe(25); });
  test('single value', () => { expect(windMph('5 mph')).toBe(5); });
  test('nothing', () => { expect(windMph('')).toBeNull(); expect(windMph(undefined)).toBeNull(); });
});

describe('outlookFromPeriods', () => {
  const periods = [
    P('2026-10-15T06:00:00-07:00', true, 98, '5 to 10 mph', 10, 'Today'),
    P('2026-10-15T18:00:00-07:00', false, 70, '5 mph', 20, 'Tonight'),
    P('2026-10-16T06:00:00-07:00', true, 112, '10 to 15 mph', 0, 'Friday'),
    P('2026-10-16T18:00:00-07:00', false, 80, '5 mph', 0, 'Friday Night'),
    P('2026-10-17T06:00:00-07:00', true, 85, '20 to 30 mph', 70, 'Saturday'),
    P('2026-10-17T18:00:00-07:00', false, 60, '15 mph', 40, 'Saturday Night'),
    P('2026-10-18T06:00:00-07:00', true, 90, '5 mph', null, 'Sunday'),
    P('2026-10-18T18:00:00-07:00', false, 62, '5 mph', null, 'Sunday Night'),
    P('2026-10-19T06:00:00-07:00', true, 91, '5 mph', null, 'Monday'),
  ];
  const o = outlookFromPeriods(periods);
  test('four days, today first', () => {
    expect(o.map((d) => d.date)).toEqual(['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
    expect(o[0].name).toBe('Today');
  });
  test('high, wind and rain from the working day; low from the night', () => {
    expect(o[0]).toMatchObject({ highF: 98, lowF: 70, windMph: 10, rainPct: 10 });
    expect(o[2]).toMatchObject({ highF: 85, lowF: 60, windMph: 30, rainPct: 70 });
  });
  test('a windy night does not flag the working day', () => {
    const t = outlookFromPeriods([P('2026-10-15T06:00:00-07:00', true, 85, '10 mph', 1), P('2026-10-15T18:00:00-07:00', false, 68, '20 to 25 mph', 0)]);
    expect(t[0].windMph).toBe(10);
  });
  test('missing rain stays missing (never 0 invented)', () => { expect(o[3].rainPct).toBeNull(); });
  test('forecast starting tonight: today has a low only', () => {
    const t = outlookFromPeriods([P('2026-10-15T18:00:00-07:00', false, 70, '5 mph', 0, 'Tonight'), P('2026-10-16T06:00:00-07:00', true, 95, '5 mph', 0, 'Friday')]);
    expect(t[0]).toMatchObject({ date: '2026-10-15', highF: null, lowF: 70, name: 'Today' });
  });
  test('Celsius converted', () => {
    const t = outlookFromPeriods([{ ...P('2026-10-15T06:00:00Z', true, 40, '5 mph', 0), temperatureUnit: 'C' }]);
    expect(t[0].highF).toBe(104);
  });
  test('garbage in, empty out', () => { expect(outlookFromPeriods(null as never)).toEqual([]); });
});

describe('stopWorkFlags', () => {
  test('rain at 60% stops work', () => { expect(stopWorkFlags({ rainPct: 60, windMph: 5, highF: 80 })).toEqual({ level: 'stop', reasons: ['Rain 60%'] }); });
  test('wind at 25 mph stops work', () => { expect(stopWorkFlags({ rainPct: 0, windMph: 25, highF: 80 })?.level).toBe('stop'); });
  test('heat at 110 stops work', () => { expect(stopWorkFlags({ rainPct: 0, windMph: 5, highF: 110 })?.reasons).toEqual(['Heat 110°F']); });
  test('near the line is a watch', () => { expect(stopWorkFlags({ rainPct: 45, windMph: 5, highF: 80 })?.level).toBe('watch'); });
  test('a calm day has no flag', () => { expect(stopWorkFlags({ rainPct: 10, windMph: 8, highF: 90 })).toBeNull(); });
  test('unknown values never flag', () => { expect(stopWorkFlags({ rainPct: null, windMph: null, highF: null })).toBeNull(); });
  test('several reasons together', () => { expect(stopWorkFlags({ rainPct: 80, windMph: 30, highF: 112 })?.reasons.length).toBe(3); });
});

describe('trimTeam', () => {
  const face = (k: string, avatar = false) => ({ key: k, name: 'Person ' + k, role: 'PM', avatarUrl: avatar ? 'https://x/' + k : null });
  test('under the cap: everyone, no more', () => { expect(trimTeam([face('a'), face('b')], 6)).toMatchObject({ more: 0 }); });
  test('over the cap: six shown, the rest counted', () => {
    const r = trimTeam(Array.from({ length: 9 }, (_, i) => face(String(i))), 6);
    expect(r.shown.length).toBe(6); expect(r.more).toBe(3);
  });
  test('photos first, then added order', () => {
    const r = trimTeam([face('a'), face('b', true), face('c')], 6);
    expect(r.shown.map((x) => x.key)).toEqual(['b', 'a', 'c']);
  });
  test('duplicates and blank names dropped', () => {
    const r = trimTeam([face('a'), face('a'), { key: 'z', name: '  ', role: null, avatarUrl: null }], 6);
    expect(r.shown.length).toBe(1);
  });
});

describe('initials / photoFit / daysLeft', () => {
  test('initials', () => { expect(initials('Ana María López')).toBe('AL'); expect(initials('sam@x.com')).toBe('S'); expect(initials('')).toBe('?'); });
  test('wide photo on a wide band covers', () => { expect(photoFit(4000, 1500, 440, 200)).toBe('cover'); });
  test('4:3 photo on a wide band is shown whole', () => { expect(photoFit(4000, 3000, 440, 200)).toBe('contain'); });
  test('portrait is shown whole', () => { expect(photoFit(3000, 4000, 390, 200)).toBe('contain'); });
  test('unknown size is shown whole', () => { expect(photoFit(0, 0, 390, 200)).toBe('contain'); });
  test('daysLeft', () => { expect(daysLeft('2026-10-25', '2026-10-15')).toBe(10); expect(daysLeft('2026-10-10', '2026-10-15')).toBe(-5); expect(daysLeft(null, '2026-10-15')).toBeNull(); });
});
