/**
 * @jest-environment node
 *
 * The 3D Models tool's pure helpers: which job files are models, how a
 * measured distance reads in meters and on a tape, and how web-ifc's wrapped
 * lines flatten into the properties panel (property sets, quantities,
 * materials through layer sets, glTF extras).
 */
import { describe, test, expect } from '@jest/globals';
import {
  detectModelFormat, isModelFile, metersToFeet, feetToMeters, formatFeetInches, formatDistance, formatBytes,
  ifcValue, ifcText, ifcTypeLabel, flattenPropertySets, materialNames, flattenUserData, sectionPosition,
  modelErrorMessage,
} from './model-viewer';

describe('file-type detection', () => {
  test('extension decides, case and query strings ignored', () => {
    expect(detectModelFormat('Tower-ARCH.IFC')).toBe('ifc');
    expect(detectModelFormat('site.glb?token=abc')).toBe('glb');
    expect(detectModelFormat('scan.gltf')).toBe('gltf');
    expect(detectModelFormat('plans.pdf')).toBeNull();
    expect(detectModelFormat('plans.pdf', 'model/gltf-binary')).toBeNull();
    expect(detectModelFormat('', null)).toBeNull();
  });
  test('MIME type is the fallback when the name has no extension', () => {
    expect(detectModelFormat('model', 'model/gltf-binary')).toBe('glb');
    expect(detectModelFormat('model', 'model/gltf+json')).toBe('gltf');
    expect(detectModelFormat('model', 'application/x-ifc')).toBe('ifc');
    expect(isModelFile('a.ifc')).toBe(true);
    expect(isModelFile('a.dwg')).toBe(false);
  });
});

describe('units', () => {
  test('meters and feet round-trip', () => {
    expect(metersToFeet(0.3048)).toBeCloseTo(1, 10);
    expect(feetToMeters(10)).toBeCloseTo(3.048, 10);
    expect(metersToFeet(feetToMeters(123.456))).toBeCloseTo(123.456, 10);
  });
  test('feet-inches to the nearest eighth, with carry', () => {
    expect(formatFeetInches(feetToMeters(10))).toBe(`10' 0"`);
    expect(formatFeetInches(feetToMeters(10 + 8.25 / 12))).toBe(`10' 8 1/4"`);
    expect(formatFeetInches(feetToMeters(3 + 1.125 / 12))).toBe(`3' 1 1/8"`);
    expect(formatFeetInches(feetToMeters(1 + 6.5 / 12))).toBe(`1' 6 1/2"`);
    expect(formatFeetInches(feetToMeters(11 + 11.99 / 12))).toBe(`12' 0"`);
    expect(formatFeetInches(0)).toBe(`0' 0"`);
    expect(formatFeetInches(NaN)).toBe('—');
  });
  test('meters display', () => {
    expect(formatDistance(3.25, 'm')).toBe('3.250 m');
    expect(formatDistance(0.4, 'm')).toBe('400 mm');
    expect(formatDistance(250.123, 'm')).toBe('250.12 m');
    expect(formatDistance(feetToMeters(20), 'ft')).toBe(`20' 0"`);
  });
  test('file sizes', () => {
    expect(formatBytes(0)).toBe('—');
    expect(formatBytes(800)).toBe('800 B');
    expect(formatBytes(812 * 1024)).toBe('812 KB');
    expect(formatBytes(14.2 * 1024 * 1024)).toBe('14.2 MB');
  });
  test('section plane position', () => {
    expect(sectionPosition(0, 10, 100)).toBe(10);
    expect(sectionPosition(0, 10, 0)).toBe(0);
    expect(sectionPosition(-2, 2, 50)).toBe(0);
    expect(sectionPosition(0, 10, 140)).toBe(10);
  });
});

describe('IFC flattening', () => {
  test('wrapped values unwrap; IFC escapes decode', () => {
    expect(ifcValue({ type: 1, value: 'Wall-01' })).toBe('Wall-01');
    expect(ifcValue({ type: 4, value: 2.5 })).toBe(2.5);
    expect(ifcValue([{ value: 'A' }, { value: 'B' }])).toBe('A, B');
    expect(ifcValue(null)).toBeNull();
    expect(ifcText({ value: 'Caf\\X2\\00E9\\X0\\' })).toBe('Café');
  });
  test('type labels', () => {
    expect(ifcTypeLabel('IFCWALLSTANDARDCASE')).toBe('Wall');
    expect(ifcTypeLabel('IFCDOOR')).toBe('Door');
    expect(ifcTypeLabel('IfcFlowController')).toBe('Flow Controller');
    expect(ifcTypeLabel('IFCSANITARYTERMINAL')).toBe('Sanitaryterminal');
    expect(ifcTypeLabel('')).toBe('');
  });
  test('property sets and quantities', () => {
    const rows = flattenPropertySets([
      {
        Name: { value: 'Pset_WallCommon' },
        HasProperties: [
          { Name: { value: 'IsExternal' }, NominalValue: { type: 3, value: true } },
          { Name: { value: 'FireRating' }, NominalValue: { value: '2HR' } },
          { Name: { value: 'Empty' }, NominalValue: null },
        ],
      },
      {
        Name: { value: 'Qto_WallBaseQuantities' },
        Quantities: [{ Name: { value: 'Length' }, LengthValue: { value: 4.123456789 } }],
      },
      null,
    ]);
    expect(rows).toEqual([
      { group: 'Pset_WallCommon', label: 'IsExternal', value: 'Yes' },
      { group: 'Pset_WallCommon', label: 'FireRating', value: '2HR' },
      { group: 'Qto_WallBaseQuantities', label: 'Length', value: '4.1235' },
    ]);
    expect(flattenPropertySets(undefined)).toEqual([]);
  });
  test('materials through usage, layer sets and lists, de-duplicated', () => {
    const names = materialNames([
      {
        ForLayerSet: {
          LayerSetName: { value: 'Ext Wall' },
          MaterialLayers: [
            { Material: { Name: { value: 'Brick' } } },
            { Material: { Name: { value: 'Insulation' } } },
            { Material: { Name: { value: 'Brick' } } },
          ],
        },
      },
      { Materials: [{ Name: { value: 'Concrete' } }] },
      { Name: { value: 'Steel' } },
    ]);
    expect(names).toEqual(['Brick', 'Insulation', 'Concrete', 'Steel']);
    expect(materialNames(null)).toEqual([]);
  });
  test('glTF extras', () => {
    expect(flattenUserData({ tag: 'AHU-1', spec: { cfm: 1200, ok: true }, list: [1, 2], skip: null })).toEqual([
      { group: 'Extras', label: 'tag', value: 'AHU-1' },
      { group: 'Extras', label: 'spec.cfm', value: '1200' },
      { group: 'Extras', label: 'spec.ok', value: 'Yes' },
      { group: 'Extras', label: 'list', value: '1, 2' },
    ]);
  });
  test('error messages never leak internals', () => {
    expect(modelErrorMessage(new Error('RangeError: Array buffer allocation failed'), 'ifc')).toMatch(/too big/);
    expect(modelErrorMessage(new Error('wasm trap 0x1f'), 'ifc')).toMatch(/IFC model/);
    expect(modelErrorMessage(new Error('Unexpected token'), 'glb')).toMatch(/glTF/);
    expect(modelErrorMessage(new Error('Failed to fetch'), 'glb')).toMatch(/downloaded/);
  });
});
