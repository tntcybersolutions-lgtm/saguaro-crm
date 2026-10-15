/**
 * @jest-environment node
 *
 * The company Jobs map: which jobs get a pin, what address is looked up,
 * and that status, contract and % complete are the Jobs list's own figures.
 */
import { describe, test, expect } from '@jest/globals';
import { isMappableJob, jobAddressLine, jobGeo, jobPctComplete, jobPin, billedByJob } from './job-map';

describe('which jobs are on the map', () => {
  test('active only', () => {
    expect(isMappableJob({ id: '1', status: 'active' })).toBe(true);
    expect(isMappableJob({ id: '1', status: 'active', is_archived: true })).toBe(false);
    expect(isMappableJob({ id: '1', status: 'active', is_deleted: true })).toBe(false);
    expect(isMappableJob({ id: '1', status: 'completed' })).toBe(false);
    expect(isMappableJob({ id: '1', status: 'cancelled' })).toBe(false);
    expect(isMappableJob(null)).toBe(false);
  });
});

describe('address and stored pin', () => {
  test('one line, and nothing to look up without a street or zip', () => {
    expect(jobAddressLine({ address: '1 Main St', city: 'Phoenix', state: 'AZ', zip: '85004' })).toBe('1 Main St, Phoenix, AZ, 85004');
    expect(jobAddressLine({ zip: '85087' })).toBe('85087');
    expect(jobAddressLine({ city: 'Phoenix', state: 'AZ' })).toBe('');
    expect(jobAddressLine({ address: '  ' })).toBe('');
  });
  test('stored pin must be a real place', () => {
    expect(jobGeo({ latitude: '33.45', longitude: -112.07 })).toEqual({ lat: 33.45, lng: -112.07 });
    expect(jobGeo({ latitude: 0, longitude: 0 })).toBeNull();
    expect(jobGeo({ latitude: 95, longitude: 10 })).toBeNull();
    expect(jobGeo({ latitude: null, longitude: null })).toBeNull();
  });
});

describe('figures', () => {
  test('% complete: done 100, else billed / contract, else own figure, else null', () => {
    expect(jobPctComplete({ status: 'completed', contract_amount: 100 }, 10)).toBe(100);
    expect(jobPctComplete({ status: 'active', contract_amount: 200000 }, 50000)).toBe(25);
    expect(jobPctComplete({ status: 'active', contract_amount: 100 }, 150)).toBe(100);
    expect(jobPctComplete({ status: 'active', percent_complete: 40.4 }, null)).toBe(40);
    expect(jobPctComplete({ status: 'active' }, null)).toBeNull();
  });
  test('latest pay app wins', () => {
    const m = billedByJob([
      { project_id: 'p', app_number: 1, total_completed_stored: 100 },
      { project_id: 'p', app_number: 3, total_completed_stored: 900 },
      { project_id: 'p', app_number: 2, total_completed_stored: 500 },
      { project_id: null, app_number: 9, total_completed_stored: 1 },
    ]);
    expect(m.get('p')).toBe(900);
    expect(m.size).toBe(1);
  });
  test('pin: no spot, no pin; contract 0 reads as none', () => {
    const p = { id: 'j1', name: 'Anthem Retail', status: 'active', phase: 'construction', contract_amount: 0, address: '1 Main St' };
    expect(jobPin(p, null, null, null)).toBeNull();
    const pin = jobPin(p, { lat: 33.8, lng: -112.1 }, null, 'https://x/cover.jpg');
    expect(pin).toMatchObject({ id: 'j1', name: 'Anthem Retail', lat: 33.8, lng: -112.1, contract: null, pct_complete: null, cover_url: 'https://x/cover.jpg', address: '1 Main St' });
    expect(['Building', 'Bidding']).toContain(pin!.status);
  });
});
