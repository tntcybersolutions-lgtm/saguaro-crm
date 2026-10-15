/**
 * ModelEngine — the three.js half of the job's 3D Models tool. Browser only:
 * it is imported from ModelViewer, which the page loads with
 * next/dynamic({ ssr: false }), so neither three nor web-ifc ever runs on the
 * server.
 *
 * One engine per open model. It owns the renderer, camera, orbit controls,
 * the section plane, selection, hide/isolate, IFC levels and the two-point
 * measure, and frees every GPU buffer, material, texture and the WebGL
 * context on dispose() — switching models or leaving the page gives the
 * memory back, which is what keeps a phone from killing the tab.
 *
 * Renders on demand (only when the camera moves or the scene changes), so an
 * idle model costs no battery.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { IfcAPI } from 'web-ifc';
import {
  flattenPropertySets, flattenUserData, ifcText, ifcTypeLabel, ifcValue, materialNames, sectionPosition,
  type ModelFormat, type PropRow,
} from '@/lib/model-viewer';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type ViewName = 'iso' | 'front' | 'back' | 'left' | 'right' | 'top';
export type Axis = 'x' | 'y' | 'z';
export type ToolMode = 'select' | 'measure';

export interface Level { id: number; name: string; elevation: number | null; count: number; visible: boolean }

export interface ElementProps {
  id: number;
  type: string;
  name: string;
  globalId: string;
  storey: string;
  materials: string[];
  rows: PropRow[];
}

export interface EngineCallbacks {
  onSelect?: (id: number | null) => void;
  onMeasure?: (meters: number | null, points: number) => void;
  onLevels?: (levels: Level[]) => void;
  onContextLost?: () => void;
}

/* ── web-ifc: one WASM instance for the whole tab ─────────────────────── */

let ifcApiPromise: Promise<IfcAPI> | null = null;
async function getIfcApi(): Promise<IfcAPI> {
  if (!ifcApiPromise) {
    ifcApiPromise = (async () => {
      const WebIFC = await import('web-ifc');
      const api = new WebIFC.IfcAPI();
      // public/wasm/web-ifc.wasm (copied from node_modules by prebuild).
      api.SetWasmPath('/wasm/', true);
      // Single-threaded: the threaded build needs cross-origin isolation the
      // app does not (and should not) turn on for one tool.
      await api.Init(undefined, true);
      return api;
    })();
    ifcApiPromise.catch(() => { ifcApiPromise = null; });
  }
  return ifcApiPromise;
}

const IFCBUILDINGSTOREY = 3124254112;

/** A CSS token's value as a three colour. Tokens only — no hex in this file. */
function tokenColor(name: string, fallbackVar = '--text-secondary'): THREE.Color {
  const css = getComputedStyle(document.documentElement);
  const read = (n: string) => css.getPropertyValue(n).trim();
  const c = new THREE.Color();
  for (const v of [read(name), read(fallbackVar)]) {
    if (!v || v.startsWith('color-mix') || v.startsWith('var(')) continue;
    try { c.setStyle(v); return c; } catch { /* unparseable token — try the fallback */ }
  }
  return c.setRGB(0.5, 0.5, 0.5);
}

const yieldFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export class ModelEngine {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private root = new THREE.Group();
  private overlay = new THREE.Group();
  private ro: ResizeObserver;
  private frame = 0;
  private disposed = false;

  private format: ModelFormat | null = null;
  private ifc: IfcAPI | null = null;
  private modelID = -1;

  /** element id → its meshes (an IFC element can have several placed geometries). */
  private elements = new Map<number, THREE.Mesh[]>();
  private hidden = new Set<number>();
  private levelHidden = new Set<number>();
  private elementLevel = new Map<number, number>();
  private levels: Level[] = [];
  private selected: number | null = null;
  private highlight: THREE.MeshLambertMaterial;
  private materialCache = new Map<string, THREE.MeshLambertMaterial>();

  private box = new THREE.Box3();
  private clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  private clipAxis: Axis = 'y';
  private clipPercent = 100;
  private clipOn = false;

  private mode: ToolMode = 'select';
  private measurePts: THREE.Vector3[] = [];
  private measureColor: THREE.Color;

  private raycaster = new THREE.Raycaster();
  private down: { x: number; y: number; t: number } | null = null;

  constructor(private container: HTMLElement, private cb: EngineCallbacks = {}) {
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: !coarse, alpha: false, powerPreference: 'default' });
    // Phones: cap the pixel ratio — a 3x retina buffer of a big model is the
    // fastest way to run out of GPU memory.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
    this.renderer.localClippingEnabled = false;
    this.renderer.setClearColor(tokenColor('--bg-base', '--bg-surface'), 1);
    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    container.appendChild(canvas);
    canvas.addEventListener('webglcontextlost', this.onContextLost, false);

    const { clientWidth: w, clientHeight: h } = container;
    this.camera = new THREE.PerspectiveCamera(45, Math.max(w, 1) / Math.max(h, 1), 0.05, 5000);
    this.camera.position.set(20, 16, 20);
    this.renderer.setSize(Math.max(w, 1), Math.max(h, 1), false);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener('change', this.requestRender);

    const sky = tokenColor('--text-primary');
    const ground = tokenColor('--bg-surface');
    this.scene.add(new THREE.HemisphereLight(sky, ground, 1.6));
    const sun = new THREE.DirectionalLight(sky, 1.4);
    sun.position.set(0.6, 1, 0.4);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(sky, 0.5);
    fill.position.set(-0.7, 0.3, -0.6);
    this.scene.add(fill);
    this.scene.add(this.root);
    this.scene.add(this.overlay);

    // Yellow is the selected item — the one place it belongs.
    this.highlight = new THREE.MeshLambertMaterial({
      color: tokenColor('--brand-primary'), side: THREE.DoubleSide, depthTest: true,
    });
    this.measureColor = tokenColor('--text-primary');

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.requestRender();
  }

  /* ── rendering ─────────────────────────────────────────────────────── */

  private requestRender = () => {
    if (this.frame || this.disposed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.disposed) return;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  };

  private resize() {
    if (this.disposed) return;
    const w = Math.max(this.container.clientWidth, 1);
    const h = Math.max(this.container.clientHeight, 1);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.cb.onContextLost?.();
  };

  /* ── loading ───────────────────────────────────────────────────────── */

  async load(buf: ArrayBuffer, format: ModelFormat, onStage?: (s: string) => void): Promise<{ elements: number }> {
    this.format = format;
    if (format === 'ifc') await this.loadIfc(new Uint8Array(buf), onStage);
    else await this.loadGltf(buf, format, onStage);
    if (this.disposed) return { elements: 0 };
    this.computeBox();
    this.setView('iso');
    return { elements: this.elements.size };
  }

  private async loadIfc(data: Uint8Array, onStage?: (s: string) => void) {
    onStage?.('Starting the IFC reader');
    const api = await getIfcApi();
    if (this.disposed) return;
    this.ifc = api;
    onStage?.('Reading the model');
    await yieldFrame();
    // Georeferenced models sit kilometers from the origin; float precision
    // there makes geometry shimmer. Move the model to the origin.
    this.modelID = api.OpenModel(data, { COORDINATE_TO_ORIGIN: true });
    if (this.modelID < 0) throw new Error('not an IFC file');
    if (this.disposed) return;

    onStage?.('Building geometry');
    await yieldFrame();
    const m4 = new THREE.Matrix4();
    let count = 0;
    api.StreamAllMeshes(this.modelID, (mesh) => {
      const id = mesh.expressID;
      const placed = mesh.geometries;
      for (let i = 0; i < placed.size(); i++) {
        const pg = placed.get(i);
        const g = api.GetGeometry(this.modelID, pg.geometryExpressID);
        try {
          const verts = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize());
          const idx = api.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize());
          if (!verts.length || !idx.length) continue;
          // Interleaved [x y z nx ny nz]; copy out of WASM memory.
          const n = verts.length / 6;
          const pos = new Float32Array(n * 3);
          const nor = new Float32Array(n * 3);
          for (let v = 0; v < n; v++) {
            pos[v * 3] = verts[v * 6]; pos[v * 3 + 1] = verts[v * 6 + 1]; pos[v * 3 + 2] = verts[v * 6 + 2];
            nor[v * 3] = verts[v * 6 + 3]; nor[v * 3 + 1] = verts[v * 6 + 4]; nor[v * 3 + 2] = verts[v * 6 + 5];
          }
          const geom = new THREE.BufferGeometry();
          geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          geom.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
          geom.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
          geom.applyMatrix4(m4.fromArray(pg.flatTransformation));
          geom.computeBoundingSphere();
          const c = pg.color;
          const mat = this.colorMaterial(c.x, c.y, c.z, c.w);
          const mesh3 = new THREE.Mesh(geom, mat);
          mesh3.matrixAutoUpdate = false;
          mesh3.userData.eid = id;
          mesh3.userData.base = mat;
          this.root.add(mesh3);
          const list = this.elements.get(id);
          if (list) list.push(mesh3); else this.elements.set(id, [mesh3]);
          count++;
        } finally {
          g.delete();
        }
      }
    });
    if (!count) throw new Error('This IFC file has no 3D geometry to show.');

    onStage?.('Reading levels');
    await yieldFrame();
    await this.readLevels().catch(() => { this.levels = []; });
    this.cb.onLevels?.(this.levels);
  }

  private colorMaterial(r: number, g: number, b: number, a: number): THREE.MeshLambertMaterial {
    const key = `${r.toFixed(3)}|${g.toFixed(3)}|${b.toFixed(3)}|${a.toFixed(2)}`;
    let m = this.materialCache.get(key);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
      m.color.setRGB(r, g, b, THREE.SRGBColorSpace);
      if (a < 0.999) { m.transparent = true; m.opacity = Math.max(0.15, a); m.depthWrite = false; }
      this.materialCache.set(key, m);
    }
    return m;
  }

  private async readLevels() {
    const api = this.ifc;
    if (!api || this.modelID < 0) return;
    const tree: any = await api.properties.getSpatialStructure(this.modelID, false);
    const levels: Level[] = [];
    const collect = (node: any, levelId: number | null) => {
      if (!node) return;
      let lvl = levelId;
      if (String(node.type).toUpperCase() === 'IFCBUILDINGSTOREY') {
        lvl = node.expressID;
        const line = api.GetLine(this.modelID, node.expressID);
        const elev = ifcValue(line?.Elevation);
        levels.push({
          id: node.expressID,
          name: ifcText(line?.Name) || ifcText(line?.LongName) || 'Level',
          elevation: typeof elev === 'number' ? elev : null,
          count: 0,
          visible: true,
        });
      } else if (lvl !== null && this.elements.has(node.expressID)) {
        this.elementLevel.set(node.expressID, lvl);
      }
      for (const ch of node.children || []) collect(ch, lvl);
    };
    collect(tree, null);
    if (!levels.length) {
      // No spatial tree — fall back to the storey list itself.
      const ids = api.GetLineIDsWithType(this.modelID, IFCBUILDINGSTOREY);
      for (let i = 0; i < ids.size(); i++) {
        const line = api.GetLine(this.modelID, ids.get(i));
        levels.push({ id: ids.get(i), name: ifcText(line?.Name) || 'Level', elevation: null, count: 0, visible: true });
      }
    }
    for (const l of levels) l.count = 0;
    const byId = new Map(levels.map((l) => [l.id, l]));
    this.elementLevel.forEach((lvl) => { const l = byId.get(lvl); if (l) l.count++; });
    levels.sort((a, b) => (b.elevation ?? 0) - (a.elevation ?? 0));
    this.levels = levels;
  }

  private async loadGltf(buf: ArrayBuffer, format: ModelFormat, onStage?: (s: string) => void) {
    if (format === 'gltf') {
      // A .gltf is JSON that may point at .bin and texture files next to it.
      // Only the one file is on the job, so those references cannot resolve.
      let json: any;
      try { json = JSON.parse(new TextDecoder().decode(buf)); } catch { throw new Error('not a glTF file'); }
      const outside = [...(json.buffers || []), ...(json.images || [])]
        .some((b: any) => typeof b?.uri === 'string' && !b.uri.startsWith('data:'));
      if (outside) throw new Error('This .gltf uses outside files (.bin or textures). Export it as a single .glb and upload that.');
    }
    onStage?.('Building geometry');
    await yieldFrame();
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf: any = await new Promise((resolve, reject) => loader.parse(buf, '', resolve, reject));
    if (this.disposed) { disposeTree(gltf.scene); return; }
    const sceneRoot: THREE.Object3D = gltf.scene || gltf.scenes?.[0];
    if (!sceneRoot) throw new Error('not a glTF file');
    let id = 1;
    sceneRoot.updateMatrixWorld(true);
    sceneRoot.traverse((o: any) => {
      if (!o.isMesh) return;
      const eid = id++;
      o.userData.eid = eid;
      o.userData.base = o.material;
      if (o.material && !Array.isArray(o.material)) o.material.side = THREE.DoubleSide;
      this.elements.set(eid, [o]);
    });
    if (!this.elements.size) throw new Error('This glTF file has no 3D geometry to show.');
    this.root.add(sceneRoot);
    this.levels = [];
    this.cb.onLevels?.([]);
  }

  /* ── camera ────────────────────────────────────────────────────────── */

  private computeBox() {
    this.box.makeEmpty();
    this.root.updateMatrixWorld(true);
    this.elements.forEach((meshes) => {
      for (const m of meshes) if (m.visible) this.box.expandByObject(m);
    });
    if (this.box.isEmpty()) this.root.traverse((o: any) => { if (o.isMesh) this.box.expandByObject(o); });
  }

  /** Frame what is visible (or everything, if nothing is). */
  fit() { this.setView(null); }

  setView(view: ViewName | null) {
    const box = new THREE.Box3();
    this.elements.forEach((meshes, id) => {
      if (!this.isShown(id)) return;
      for (const m of meshes) box.expandByObject(m);
    });
    if (box.isEmpty()) box.copy(this.box);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const r = Math.max(sphere.radius, 0.1);
    const dist = (r / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.08;
    const dirs: Record<ViewName, THREE.Vector3> = {
      iso: new THREE.Vector3(1, 0.75, 1),
      front: new THREE.Vector3(0, 0, 1),
      back: new THREE.Vector3(0, 0, -1),
      left: new THREE.Vector3(-1, 0, 0),
      right: new THREE.Vector3(1, 0, 0),
      top: new THREE.Vector3(0, 1, 0.0001),
    };
    const dir = view ? dirs[view].clone() : this.camera.position.clone().sub(this.controls.target);
    if (dir.lengthSq() < 1e-9) dir.copy(dirs.iso);
    dir.normalize();
    this.camera.near = Math.max(dist / 1000, 0.01);
    this.camera.far = dist * 20 + r * 4;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(sphere.center);
    this.camera.position.copy(sphere.center).addScaledVector(dir, dist);
    this.controls.maxDistance = dist * 8;
    this.controls.update();
    this.requestRender();
  }

  /** The longest side of the whole model, in meters. */
  modelSize(): THREE.Vector3 { return this.box.getSize(new THREE.Vector3()); }

  /* ── section plane ─────────────────────────────────────────────────── */

  setSection(enabled: boolean, axis: Axis, percent: number) {
    this.clipOn = enabled;
    this.clipAxis = axis;
    this.clipPercent = percent;
    if (!enabled || this.box.isEmpty()) {
      this.renderer.clippingPlanes = [];
    } else {
      const min = this.box.min[axis];
      const max = this.box.max[axis];
      const pos = sectionPosition(min, max, percent);
      // Keep what is below/behind the plane: normal points away from it.
      const n = new THREE.Vector3(axis === 'x' ? -1 : 0, axis === 'y' ? -1 : 0, axis === 'z' ? -1 : 0);
      this.clip.set(n, pos + (percent >= 100 ? Math.abs(max - min) * 0.001 + 1e-4 : 0));
      this.renderer.clippingPlanes = [this.clip];
    }
    this.requestRender();
  }

  /* ── selection, hide, isolate, levels ─────────────────────────────── */

  private isShown(id: number): boolean {
    if (this.hidden.has(id)) return false;
    const lvl = this.elementLevel.get(id);
    return lvl === undefined || !this.levelHidden.has(lvl);
  }

  private applyVisibility() {
    this.elements.forEach((meshes, id) => {
      const show = this.isShown(id);
      for (const m of meshes) m.visible = show;
    });
    if (this.selected !== null && !this.isShown(this.selected)) this.select(null);
    this.requestRender();
  }

  select(id: number | null) {
    if (this.selected !== null) {
      for (const m of this.elements.get(this.selected) || []) m.material = m.userData.base;
    }
    this.selected = id !== null && this.elements.has(id) ? id : null;
    if (this.selected !== null) {
      for (const m of this.elements.get(this.selected) || []) m.material = this.highlight;
    }
    this.cb.onSelect?.(this.selected);
    this.requestRender();
  }

  getSelected() { return this.selected; }
  hiddenCount() { return this.hidden.size; }

  hideSelected() {
    if (this.selected === null) return;
    this.hidden.add(this.selected);
    this.applyVisibility();
  }

  isolateSelected() {
    if (this.selected === null) return;
    const keep = this.selected;
    this.elements.forEach((_m, id) => { if (id !== keep) this.hidden.add(id); });
    this.hidden.delete(keep);
    const lvl = this.elementLevel.get(keep);
    if (lvl !== undefined) this.levelHidden.delete(lvl);
    this.syncLevels();
    this.applyVisibility();
    this.fit();
  }

  showAll() {
    this.hidden.clear();
    this.levelHidden.clear();
    this.syncLevels();
    this.applyVisibility();
  }

  setLevelVisible(levelId: number, visible: boolean) {
    if (visible) this.levelHidden.delete(levelId); else this.levelHidden.add(levelId);
    this.syncLevels();
    this.applyVisibility();
  }

  /** Show only this level. */
  soloLevel(levelId: number) {
    this.levelHidden.clear();
    for (const l of this.levels) if (l.id !== levelId) this.levelHidden.add(l.id);
    this.syncLevels();
    this.applyVisibility();
  }

  private syncLevels() {
    this.levels = this.levels.map((l) => ({ ...l, visible: !this.levelHidden.has(l.id) }));
    this.cb.onLevels?.(this.levels);
  }

  /* ── properties ────────────────────────────────────────────────────── */

  async properties(id: number): Promise<ElementProps | null> {
    const meshes = this.elements.get(id);
    if (!meshes) return null;
    if (this.format === 'ifc' && this.ifc && this.modelID >= 0) {
      const api = this.ifc;
      const line = api.GetLine(this.modelID, id, false);
      const typeName = api.GetNameFromTypeCode(api.GetLineType(this.modelID, id));
      const lvl = this.elementLevel.get(id);
      const level = lvl !== undefined ? this.levels.find((l) => l.id === lvl) : undefined;
      // web-ifc's includeType* flag returns ONLY the type's sets, not the
      // element's own — ask for both and put the element's first.
      const none = (): any[] => [];
      const [ownSets, typeSets, ownMats, typeMats] = await Promise.all([
        api.properties.getPropertySets(this.modelID, id, true, false).catch(none),
        api.properties.getPropertySets(this.modelID, id, true, true).catch(none),
        api.properties.getMaterialsProperties(this.modelID, id, true, false).catch(none),
        api.properties.getMaterialsProperties(this.modelID, id, true, true).catch(none),
      ]);
      const psets = [...ownSets, ...typeSets];
      const mats = ownMats.length ? ownMats : typeMats;
      const rows: PropRow[] = [];
      const objType = ifcText(line?.ObjectType);
      const tag = ifcText(line?.Tag);
      const desc = ifcText(line?.Description);
      if (objType) rows.push({ group: 'Element', label: 'Object type', value: objType });
      if (tag) rows.push({ group: 'Element', label: 'Tag', value: tag });
      if (desc) rows.push({ group: 'Element', label: 'Description', value: desc });
      rows.push(...flattenPropertySets(psets));
      return {
        id,
        type: ifcTypeLabel(typeName) || typeName,
        name: ifcText(line?.Name) || ifcText(line?.LongName) || '',
        globalId: ifcText(line?.GlobalId),
        storey: level?.name || '',
        materials: materialNames(mats),
        rows,
      };
    }
    const m = meshes[0] as any;
    const mats = (Array.isArray(m.material) ? m.material : [m.userData.base || m.material])
      .map((x: any) => String(x?.name || '').trim()).filter(Boolean);
    const parentName = m.parent && m.parent.type !== 'Scene' ? String(m.parent.name || '') : '';
    const rows: PropRow[] = [
      ...(parentName ? [{ group: 'Element', label: 'Part of', value: parentName }] : []),
      ...flattenUserData(m.userData?.extras ?? omitInternal(m.userData)),
    ];
    const tri = m.geometry?.index ? m.geometry.index.count / 3 : (m.geometry?.attributes?.position?.count || 0) / 3;
    rows.push({ group: 'Geometry', label: 'Triangles', value: Math.round(tri).toLocaleString('en-US') });
    return { id, type: 'Mesh', name: String(m.name || ''), globalId: '', storey: '', materials: mats, rows };
  }

  /* ── measure ───────────────────────────────────────────────────────── */

  setMode(mode: ToolMode) {
    this.mode = mode;
    if (mode !== 'measure') this.clearMeasure();
  }

  clearMeasure() {
    this.measurePts = [];
    disposeTree(this.overlay, false);
    this.overlay.clear();
    this.cb.onMeasure?.(null, 0);
    this.requestRender();
  }

  private addMeasurePoint(p: THREE.Vector3) {
    if (this.measurePts.length >= 2) {
      this.measurePts = [];
      disposeTree(this.overlay, false);
      this.overlay.clear();
    }
    this.measurePts.push(p.clone());
    const size = this.box.getSize(new THREE.Vector3()).length() || 10;
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(size * 0.004, 0.02), 16, 12),
      new THREE.MeshBasicMaterial({ color: this.measureColor, depthTest: false }),
    );
    dot.position.copy(p);
    dot.renderOrder = 10;
    this.overlay.add(dot);
    if (this.measurePts.length === 2) {
      const [a, b] = this.measurePts;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([a, b]),
        new THREE.LineBasicMaterial({ color: this.measureColor, depthTest: false }),
      );
      line.renderOrder = 10;
      this.overlay.add(line);
      this.cb.onMeasure?.(a.distanceTo(b), 2);
    } else {
      this.cb.onMeasure?.(null, 1);
    }
    this.requestRender();
  }

  /* ── picking ───────────────────────────────────────────────────────── */

  private onPointerDown = (e: PointerEvent) => {
    if (!e.isPrimary) { this.down = null; return; }
    this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
  };

  private onPointerUp = (e: PointerEvent) => {
    const d = this.down;
    this.down = null;
    if (!d || !e.isPrimary) return;
    // A drag is an orbit, not a click.
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 600) return;
    const hit = this.pick(e.clientX, e.clientY);
    if (this.mode === 'measure') { if (hit) this.addMeasurePoint(hit.point); return; }
    this.select(hit ? hit.id : null);
  };

  private pick(clientX: number, clientY: number): { id: number; point: THREE.Vector3 } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.root, true);
    for (const h of hits) {
      const o: any = h.object;
      if (!o.visible || o.userData.eid === undefined) continue;
      let p: THREE.Object3D | null = o;
      let shown = true;
      while (p) { if (!p.visible) { shown = false; break; } p = p.parent; }
      if (!shown) continue;
      // Ignore what the section plane has cut away.
      if (this.clipOn && this.renderer.clippingPlanes.length && this.clip.distanceToPoint(h.point) < -1e-4) continue;
      return { id: o.userData.eid, point: h.point };
    }
    return null;
  }

  /* ── screenshot ────────────────────────────────────────────────────── */

  screenshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  /* ── teardown ──────────────────────────────────────────────────────── */

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.ro.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.controls.removeEventListener('change', this.requestRender);
    this.controls.dispose();
    disposeTree(this.root);
    disposeTree(this.overlay);
    this.materialCache.forEach((m) => m.dispose());
    this.materialCache.clear();
    this.highlight.dispose();
    this.elements.clear();
    this.scene.clear();
    if (this.ifc && this.modelID >= 0) {
      try { this.ifc.CloseModel(this.modelID); } catch { /* already closed by a failed load */ }
    }
    this.modelID = -1;
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
  }
}

function omitInternal(ud: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ud || {})) if (k !== 'eid' && k !== 'base') out[k] = v;
  return out;
}

/** Free every geometry, material and texture under an object. */
function disposeTree(obj: THREE.Object3D, includeShared = true) {
  const mats = new Set<THREE.Material>();
  obj.traverse((o: any) => {
    if (o.geometry) o.geometry.dispose();
    const list = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of list) mats.add(m);
    if (includeShared && o.userData?.base) {
      const base = Array.isArray(o.userData.base) ? o.userData.base : [o.userData.base];
      for (const m of base) mats.add(m);
    }
  });
  mats.forEach((m: any) => {
    for (const v of Object.values(m)) if (v && (v as any).isTexture) (v as THREE.Texture).dispose();
    m.dispose();
  });
}
