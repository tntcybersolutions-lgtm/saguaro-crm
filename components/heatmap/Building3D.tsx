'use client';
/**
 * Building3D — a true 3D building view for the Coverage Heatmap Designer.
 *
 * Renders one textured floor plane per floor (stacked on the Y axis), each plane
 * carrying THAT floor's plan image + coverage heatmap as a CanvasTexture. Walls are
 * thin extruded boxes in the wall material color; devices are markers (cameras render
 * as aimed cones, everything else as spheres) colored from DEVICE_REGISTRY. Ambient +
 * directional light, a ground grid, and OrbitControls (rotate / zoom / pan).
 *
 * CLIENT-ONLY: three.js touches window + WebGL, so this must never run during SSR.
 * It is imported in page.tsx via next/dynamic({ ssr: false }) and only mounted when the
 * 3D toggle is on. Everything here is additive — it reads the same HeatmapProject data
 * the 2D canvas uses and never mutates it.
 */
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { HeatmapProject } from '@/lib/heatmap/types';
import { DEVICE_REGISTRY, WALL_MATERIALS } from '@/lib/heatmap/models';
import { recompute } from '@/lib/heatmap/smart';

type FloorInput = { id: string; name: string; proj: HeatmapProject | null };

interface Props {
  floors: FloorInput[];
  activeFloorId: string;
  /** floor-to-floor height in feet (default 10) */
  heightFt?: number;
}

/** parse a #rrggbb / #rgb color to a THREE.Color, tolerant of alpha suffixes. */
function toColor(hex: string): THREE.Color {
  try { return new THREE.Color(hex.slice(0, 7)); } catch { return new THREE.Color('#888888'); }
}

/**
 * Paint a floor's plan image + coverage heatmap onto a 2D canvas so it can back a
 * CanvasTexture. Mirrors the page's own coverage renderer (low-res grid → upscaled).
 * The plan image loads async; onReady fires after it is composited so the texture can
 * be flagged needsUpdate.
 */
function paintFloorCanvas(proj: HeatmapProject, onReady: () => void): HTMLCanvasElement {
  const W = Math.max(1, proj.imgW), H = Math.max(1, proj.imgH);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  if (!ctx) return cv;

  const paintHeat = () => {
    let cov = null as ReturnType<typeof recompute> | null;
    try { cov = proj.scale ? recompute(proj, 10) : null; } catch { cov = null; }
    if (!cov) return;
    const { cols, rows, cells } = cov;
    const off = document.createElement('canvas'); off.width = cols; off.height = rows;
    const octx = off.getContext('2d'); if (!octx) return;
    const img = octx.createImageData(cols, rows);
    const mult = (proj.heatmapOpacity || 0.55) / 0.6;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i]; const o = i * 4;
      if (c) { img.data[o] = c.rgba[0]; img.data[o + 1] = c.rgba[1]; img.data[o + 2] = c.rgba[2]; img.data[o + 3] = Math.min(255, Math.round(c.opacity * mult * 255)); }
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, cols, rows, 0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
  };

  const composite = (planImg: HTMLImageElement | null) => {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f4f2ec'; ctx.fillRect(0, 0, W, H); // light plan backdrop
    if (planImg) { try { ctx.drawImage(planImg, 0, 0, W, H); } catch { /* tainted / broken */ } }
    paintHeat();
  };

  // draw once immediately (heatmap over backdrop) so the texture is never blank…
  composite(null);
  // …then load the plan and recomposite underneath the heatmap.
  if (proj.planDataUrl) {
    const im = new Image();
    im.onload = () => { composite(im); onReady(); };
    im.onerror = () => onReady();
    im.src = proj.planDataUrl;
  }
  return cv;
}

export default function Building3D({ floors, activeFloorId, heightFt = 10 }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current; if (!host) return;

    // ── disposal bookkeeping ──
    const disposables: { dispose: () => void }[] = [];
    const textures: THREE.Texture[] = [];
    let raf = 0;
    let disposed = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a0a0a');

    const width = host.clientWidth || 800;
    const height = host.clientHeight || 600;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    host.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.5, 100000);

    // ── lights ──
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(1, 2, 1);
    scene.add(dir);

    // ── build the stack ──
    const withProj = floors.filter((f) => f.proj);
    // world scale: 1 world unit = 1 ft. Size from the largest floor.
    let maxWFt = 40, maxDFt = 40;
    for (const f of withProj) {
      const p = f.proj!; const ppf = p.scale?.pxPerFt || 12;
      maxWFt = Math.max(maxWFt, p.imgW / ppf);
      maxDFt = Math.max(maxDFt, p.imgH / ppf);
    }
    const floorH = heightFt;
    const nLevels = Math.max(1, withProj.length);

    let needsRender = true;
    const flagRender = () => { needsRender = true; };

    withProj.forEach((f, level) => {
      const p = f.proj!;
      const ppf = p.scale?.pxPerFt || 12;
      const wFt = p.imgW / ppf;
      const dFt = p.imgH / ppf;
      const baseY = level * floorH;
      const isActive = f.id === activeFloorId;

      // ── textured floor plane (plan + heatmap) ──
      const canvas = paintFloorCanvas(p, () => { tex.needsUpdate = true; flagRender(); });
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      textures.push(tex);
      const planeGeo = new THREE.PlaneGeometry(wFt, dFt);
      disposables.push(planeGeo);
      const planeMat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: isActive ? 0.95 : 0.82,
        side: THREE.DoubleSide, depthWrite: false,
      });
      disposables.push(planeMat);
      const plane = new THREE.Mesh(planeGeo, planeMat);
      plane.rotation.x = -Math.PI / 2;     // lay flat in the XZ plane, facing up
      plane.position.y = baseY;
      scene.add(plane);

      // ── plane outline (brighter for the active floor) ──
      const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(wFt, 0.01, dFt));
      disposables.push(edges);
      const edgeMat = new THREE.LineBasicMaterial({ color: isActive ? 0xD4A017 : 0x3a4353 });
      disposables.push(edgeMat);
      const frame = new THREE.LineSegments(edges, edgeMat);
      frame.position.y = baseY;
      scene.add(frame);

      // image px → world coords (image top = world -Z, matches the plane texture)
      const wx = (px: number) => (px - p.imgW / 2) / ppf;
      const wz = (py: number) => (py - p.imgH / 2) / ppf;

      // ── walls: thin extruded boxes in the wall material color ──
      const wallH = floorH * 0.9;
      for (const w of p.walls) {
        const ax = wx(w.a.x), az = wz(w.a.y), bx = wx(w.b.x), bz = wz(w.b.y);
        const dx = bx - ax, dz = bz - az;
        const len = Math.hypot(dx, dz); if (len < 0.05) continue;
        const geo = new THREE.BoxGeometry(len, wallH, 0.35);
        disposables.push(geo);
        const mat = new THREE.MeshStandardMaterial({
          color: toColor(WALL_MATERIALS[w.material]?.color || '#A3ACBB'),
          transparent: true, opacity: 0.9, roughness: 0.85, metalness: 0.05,
        });
        disposables.push(mat);
        const box = new THREE.Mesh(geo, mat);
        box.position.set(ax + dx / 2, baseY + wallH / 2, az + dz / 2);
        box.rotation.y = Math.atan2(-dz, dx);
        scene.add(box);
      }

      // ── devices: cameras as aimed cones, everything else as spheres ──
      const devY = baseY + wallH; // mount near the ceiling
      for (const d of p.devices) {
        const def = DEVICE_REGISTRY[d.typeId];
        const color = toColor(def?.color || '#888888');
        const px = wx(d.pos.x), pz = wz(d.pos.y);
        if (def?.modelType === 'camera') {
          const coneGeo = new THREE.ConeGeometry(1.1, 3, 16);
          disposables.push(coneGeo);
          const coneMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2 });
          disposables.push(coneMat);
          const cone = new THREE.Mesh(coneGeo, coneMat);
          // aim: 0° = east (world +X); image-y (down) maps to world +Z
          const a = ((d.aimDeg ?? 0) * Math.PI) / 180;
          const aimDir = new THREE.Vector3(Math.cos(a), -0.25, Math.sin(a)).normalize();
          // cone points +Y by default → rotate that axis onto the aim direction
          cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), aimDir);
          cone.position.set(px, devY, pz);
          scene.add(cone);
        } else {
          const sphGeo = new THREE.SphereGeometry(1, 16, 12);
          disposables.push(sphGeo);
          const sphMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.25, emissive: color.clone().multiplyScalar(0.15) });
          disposables.push(sphMat);
          const sph = new THREE.Mesh(sphGeo, sphMat);
          const rf = def?.modelType === 'rf';
          sph.position.set(px, rf ? devY : baseY + 0.6, pz);
          scene.add(sph);
          // a thin drop-line to the floor so the marker reads in 3D
          const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 });
          disposables.push(lineMat);
          const lineGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(px, baseY, pz), new THREE.Vector3(px, sph.position.y, pz),
          ]);
          disposables.push(lineGeo);
          scene.add(new THREE.Line(lineGeo, lineMat));
        }
      }
    });

    // ── ground grid under the stack ──
    const gridSize = Math.max(maxWFt, maxDFt) * 1.6;
    const grid = new THREE.GridHelper(gridSize, Math.max(8, Math.round(gridSize / 5)), 0x30363d, 0x21262d);
    grid.position.y = -0.05;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    scene.add(grid);
    disposables.push(grid.geometry);

    // ── camera framing ──
    const stackH = nLevels * floorH;
    const target = new THREE.Vector3(0, stackH / 2, 0);
    const reach = Math.max(maxWFt, maxDFt, stackH);
    camera.position.set(reach * 0.9, stackH + reach * 0.7, reach * 1.1);
    camera.lookAt(target);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.copy(target);
    controls.maxDistance = reach * 6 + 50;
    controls.minDistance = 2;
    controls.addEventListener('change', flagRender);
    controls.update();

    // ── render loop (only when something changed → light on the GPU) ──
    const tick = () => {
      if (disposed) return;
      raf = requestAnimationFrame(tick);
      const moved = controls.update(); // true while damping
      if (moved || needsRender) { renderer.render(scene, camera); needsRender = false; }
    };
    tick();

    // ── resize ──
    const onResize = () => {
      const w = host.clientWidth || 800, h = host.clientHeight || 600;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h); flagRender();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    // ── teardown: dispose geometries/materials/textures/renderer (no leaks) ──
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.removeEventListener('change', flagRender);
      controls.dispose();
      for (const t of textures) t.dispose();
      for (const d of disposables) { try { d.dispose(); } catch { /* noop */ } }
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [floors, activeFloorId, heightFt]);

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}
