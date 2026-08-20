'use client';
import React, { useRef, useEffect, useState, useCallback } from 'react';

let THREE: typeof import('three') | null = null;
let OrbitControls: any = null;
let GLTFLoader: any = null;
let OBJLoader: any = null;

interface ThreeViewerProps {
  fileUrl: string;
  fileName: string;
  style?: React.CSSProperties;
  onScreenshot?: (dataUrl: string) => void;
  wireframe?: boolean;
}

export default function ThreeViewer({ fileUrl, fileName, style, onScreenshot, wireframe = false }: ThreeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<any>(null);
  const sceneRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const controlsRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState({ meshes: 0, vertices: 0 });

  const takeScreenshot = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    rendererRef.current.render(sceneRef.current, cameraRef.current);
    const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
    onScreenshot?.(dataUrl);
  }, [onScreenshot]);

  useEffect(() => {
    if (!containerRef.current || !fileUrl) return;
    let disposed = false;

    async function init() {
      try {
        // Dynamic imports — Three.js is heavy, only load when needed
        if (!THREE) {
          THREE = await import('three');
          const controls = await import('three/examples/jsm/controls/OrbitControls.js');
          OrbitControls = controls.OrbitControls;
          const gltf = await import('three/examples/jsm/loaders/GLTFLoader.js');
          GLTFLoader = gltf.GLTFLoader;
          const obj = await import('three/examples/jsm/loaders/OBJLoader.js');
          OBJLoader = obj.OBJLoader;
        }

        if (disposed || !containerRef.current) return;

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight || 400;

        // Scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0d1117);
        sceneRef.current = scene;

        // Grid helper
        const grid = new THREE.GridHelper(20, 20, 0x30363d, 0x1e2a3a);
        scene.add(grid);

        // Lights
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambient);
        const directional = new THREE.DirectionalLight(0xffffff, 0.8);
        directional.position.set(5, 10, 7);
        directional.castShadow = true;
        scene.add(directional);
        const hemi = new THREE.HemisphereLight(0xC8960F, 0x0d1117, 0.3);
        scene.add(hemi);

        // Camera
        const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
        camera.position.set(5, 5, 5);
        cameraRef.current = camera;

        // Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // Controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.minDistance = 1;
        controls.maxDistance = 100;
        controlsRef.current = controls;

        // Load model
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        let loadedObject: any = null;

        if (ext === 'glb' || ext === 'gltf') {
          const loader = new GLTFLoader();
          const gltf = await new Promise<any>((resolve, reject) => {
            loader.load(fileUrl, resolve, undefined, reject);
          });
          loadedObject = gltf.scene;
        } else if (ext === 'obj') {
          const loader = new OBJLoader();
          loadedObject = await new Promise<any>((resolve, reject) => {
            loader.load(fileUrl, resolve, undefined, reject);
          });
        } else {
          setError(`Unsupported format: .${ext}. Use .glb, .gltf, or .obj`);
          setLoading(false);
          return;
        }

        if (disposed) return;

        // Center and scale model
        const box = new THREE.Box3().setFromObject(loadedObject);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 5 / (maxDim || 1);
        loadedObject.scale.multiplyScalar(scale);
        loadedObject.position.sub(center.multiplyScalar(scale));

        // Count meshes and vertices
        let meshCount = 0;
        let vertCount = 0;
        loadedObject.traverse((child: any) => {
          if (child.isMesh) {
            meshCount++;
            vertCount += child.geometry?.attributes?.position?.count || 0;
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        setInfo({ meshes: meshCount, vertices: vertCount });

        scene.add(loadedObject);

        // Position camera to see model
        camera.position.set(maxDim * scale, maxDim * scale * 0.8, maxDim * scale);
        controls.target.set(0, 0, 0);
        controls.update();

        // Animation loop
        function animate() {
          if (disposed) return;
          animFrameRef.current = requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        }
        animate();

        // Resize handler
        const onResize = () => {
          if (!container || disposed) return;
          const w = container.clientWidth;
          const h = container.clientHeight || 400;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        };
        window.addEventListener('resize', onResize);

        setLoading(false);
      } catch (err: any) {
        if (!disposed) {
          setError(err.message || 'Failed to load model');
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      disposed = true;
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', () => {});
      if (rendererRef.current && containerRef.current) {
        try {
          containerRef.current.removeChild(rendererRef.current.domElement);
        } catch { /* already removed */ }
        rendererRef.current.dispose();
      }
    };
  }, [fileUrl, fileName]);

  // Apply wireframe toggle
  useEffect(() => {
    if (!sceneRef.current || !THREE) return;
    sceneRef.current.traverse((child: any) => {
      if (child.isMesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m: any) => { m.wireframe = wireframe; });
        } else {
          child.material.wireframe = wireframe;
        }
      }
    });
  }, [wireframe]);

  // Expose screenshot
  useEffect(() => {
    (window as any).__threeScreenshot = takeScreenshot;
    return () => { delete (window as any).__threeScreenshot; };
  }, [takeScreenshot]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 300, ...style }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden' }} />

      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13,17,23,0.9)', borderRadius: 12 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 32, height: 32, border: '3px solid rgba(200,150,15,0.3)', borderTopColor: '#C8960F', borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ color: '#8B9DB8', fontSize: 13 }}>Loading 3D model...</div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13,17,23,0.9)', borderRadius: 12 }}>
          <div style={{ textAlign: 'center', color: '#EF4444', fontSize: 13, padding: 24 }}>{error}</div>
        </div>
      )}

      {!loading && !error && (
        <div style={{ position: 'absolute', bottom: 8, left: 8, background: 'rgba(13,17,23,0.8)', borderRadius: 8, padding: '4px 10px', fontSize: 10, color: '#8B9DB8' }}>
          {info.meshes} meshes | {info.vertices.toLocaleString()} vertices
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
