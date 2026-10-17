/**
 * @jest-environment node
 *
 * The job's top phase tab follows the screen you are on — including a record
 * page (/items/<type>/<id>), which is one route for every item type and used
 * to light Overview for all of them.
 */
import { describe, test, expect } from '@jest/globals';
import { PROJECT_NAV_SECTIONS, phaseForPath } from '@/lib/project-nav';
import { ITEM_TOOLS } from '@/lib/items/registry';

describe('phaseForPath', () => {
  test('every record type lights the phase of its own list', () => {
    for (const tool of Object.values(ITEM_TOOLS)) {
      const list = phaseForPath(`/${tool.listPath}`);
      expect([tool.type, list]).not.toEqual([tool.type, 'overview']);
      expect([tool.type, phaseForPath(`/items/${tool.type}/0b7e0c8e`)]).toEqual([tool.type, list]);
    }
  });

  test('the record types land where a GC looks for them', () => {
    expect(phaseForPath('/items/change_orders/x')).toBe('financial');
    expect(phaseForPath('/items/contracts/x')).toBe('financial');
    expect(phaseForPath('/items/purchase_orders/x')).toBe('financial');
    expect(phaseForPath('/items/rfis/x')).toBe('docs');
    expect(phaseForPath('/items/submittals/x')).toBe('docs');
    expect(phaseForPath('/items/punch_list/x')).toBe('field');
    expect(phaseForPath('/items/daily_logs/x')).toBe('field');
    expect(phaseForPath('/items/inspections/x')).toBe('field');
  });

  test('an unknown record type falls back to Overview, not a wrong phase', () => {
    expect(phaseForPath('/items/not_a_tool/x')).toBe('overview');
  });

  test('every tool in the job rail lights a phase (Overview and the More groups excepted)', () => {
    for (const sec of PROJECT_NAV_SECTIONS) {
      if (sec.label === 'PROJECT' || sec.label.startsWith('MORE')) continue;
      for (const it of sec.items) expect([it.href, phaseForPath(it.href)]).not.toEqual([it.href, 'overview']);
    }
  });
});
