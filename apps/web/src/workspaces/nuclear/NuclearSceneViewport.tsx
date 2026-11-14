import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type NuclearParticleKind, getNuclearPresetById } from '@matterlab/domain';
import { useLabStore } from '../../state/useLabStore';

interface ProjectedNuclearLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  kind: NuclearParticleKind;
}

function isWebGL2Available(): boolean {
  try {
    const testCanvas = document.createElement('canvas');
    return Boolean(testCanvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

function particleColorHex(kind: NuclearParticleKind): string {
  switch (kind) {
    case 'alpha':
      return '#f59e0b';
    case 'proton':
      return '#ef4444';
    case 'neutron':
      return '#94a3b8';
  }
}

function particleVisualRadiusFm(kind: NuclearParticleKind): number {
  return kind === 'alpha' ? 0.92 : 0.52;
}

export const NuclearSceneViewport: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [webgl2Supported] = useState<boolean>(() => isWebGL2Available());
  const [labels, setLabels] = useState<ProjectedNuclearLabel[]>([]);
  const [pixelPerFm, setPixelPerFm] = useState<number>(48);

  const nuclearPresetId = useLabStore((s) => s.nuclearPresetId);
  const nuclearParticles = useLabStore((s) => s.nuclearParticles);
  const nuclearEdges = useLabStore((s) => s.nuclearEdges);
  const selectedNuclearParticleId = useLabStore((s) => s.selectedNuclearParticleId);
  const nuclearResult = useLabStore((s) => s.nuclearResult);
  const nuclearPlaybackFrameIndex = useLabStore((s) => s.nuclearPlaybackFrameIndex);
  const showLabels = useLabStore((s) => s.showLabels);
  const showAxes = useLabStore((s) => s.showAxes);
  const showGrid = useLabStore((s) => s.showGrid);
  const lowEffects = useLabStore((s) => s.lowEffects);
  const showNuclearEdges = useLabStore((s) => s.showNuclearEdges);
  const showNuclearForceArrows = useLabStore((s) => s.showNuclearForceArrows);
  const cameraResetNonce = useLabStore((s) => s.cameraResetNonce);

  const preset = getNuclearPresetById(nuclearPresetId);
  const activeFrame =
    nuclearResult && nuclearResult.frames.length > 0
      ? (nuclearResult.frames[nuclearPlaybackFrameIndex] ?? nuclearResult.frames[0])
      : undefined;

  const displayParticles = nuclearParticles.map((p, idx) => ({
    ...p,
    positionFm: activeFrame?.positionsFm[idx] ?? p.positionFm,
    forceMevFm: activeFrame?.forceVectorsMevFm[idx] ?? ([0, 0, 0] as [number, number, number]),
  }));

  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    particleGroup: THREE.Group;
    edgeGroup: THREE.Group;
    arrowGroup: THREE.Group;
    gridHelper: THREE.GridHelper;
    axesHelper: THREE.AxesHelper;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !webgl2Supported) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#090d16');

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 240);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 300);
    camera.position.set(0, 4.2, 9.2);

    const renderer = new THREE.WebGLRenderer({
      antialias: !lowEffects,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowEffects ? 1 : 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2.0;
    controls.maxDistance = 120;

    scene.add(new THREE.HemisphereLight('#fde68a', '#1e293b', 0.9));
    const keyLight = new THREE.DirectionalLight('#ffffff', 1.45);
    keyLight.position.set(8, 10, 8);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight('#38bdf8', 0.65);
    rimLight.position.set(-8, -4, -6);
    scene.add(rimLight);

    const gridHelper = new THREE.GridHelper(20, 20, '#334155', '#172033');
    gridHelper.position.y = -0.02;
    scene.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(1.8);
    scene.add(axesHelper);

    const edgeGroup = new THREE.Group();
    const particleGroup = new THREE.Group();
    const arrowGroup = new THREE.Group();
    scene.add(edgeGroup);
    scene.add(particleGroup);
    scene.add(arrowGroup);

    sceneRef.current = {
      scene,
      camera,
      renderer,
      controls,
      particleGroup,
      edgeGroup,
      arrowGroup,
      gridHelper,
      axesHelper,
    };

    const onResize = () => {
      const host = containerRef.current;
      const ctx = sceneRef.current;
      if (!host || !ctx) return;
      const w = Math.max(host.clientWidth, 1);
      const h = Math.max(host.clientHeight, 1);
      ctx.camera.aspect = w / h;
      ctx.camera.updateProjectionMatrix();
      ctx.renderer.setSize(w, h);
    };

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(container);
    }
    window.addEventListener('resize', onResize);

    let rafId = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);

      const host = containerRef.current;
      if (host) {
        const w = host.clientWidth;
        const h = host.clientHeight;
        const p0 = new THREE.Vector3(0, 0, 0).project(camera);
        const p1 = new THREE.Vector3(1, 0, 0).project(camera);
        const pxDist = Math.hypot(((p1.x - p0.x) * w) / 2, ((p1.y - p0.y) * h) / 2);
        if (Number.isFinite(pxDist) && pxDist > 2 && pxDist < 400) {
          setPixelPerFm(Math.round(pxDist));
        }

        const st = useLabStore.getState();
        if (st.showLabels) {
          const curFrame =
            st.nuclearResult && st.nuclearResult.frames.length > 0
              ? (st.nuclearResult.frames[st.nuclearPlaybackFrameIndex] ??
                st.nuclearResult.frames[0])
              : undefined;
          const nextLabels: ProjectedNuclearLabel[] = st.nuclearParticles.map((pt, i) => {
            const coords = curFrame?.positionsFm[i] ?? pt.positionFm;
            const v = new THREE.Vector3(...coords);
            v.y += particleVisualRadiusFm(pt.kind) + 0.32;
            v.project(camera);
            return {
              id: pt.id,
              text: pt.label,
              x: (v.x * 0.5 + 0.5) * w,
              y: (-v.y * 0.5 + 0.5) * h,
              kind: pt.kind,
            };
          });
          setLabels(nextLabels);
        } else {
          setLabels([]);
        }
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
    };
  }, [webgl2Supported, lowEffects]);

  // Reset camera when requested or preset changes
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.camera.position.set(0, 4.2, 9.2);
    ctx.controls.target.set(0, 0, 0);
    ctx.controls.update();
  }, [cameraResetNonce, nuclearPresetId]);

  // Update Three.js objects for current frame
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;

    ctx.gridHelper.visible = showGrid;
    ctx.axesHelper.visible = showAxes;

    const clearGroup = (group: THREE.Group) => {
      while (group.children.length > 0) {
        const child = group.children[0]!;
        group.remove(child);
        if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    };

    clearGroup(ctx.particleGroup);
    clearGroup(ctx.edgeGroup);
    clearGroup(ctx.arrowGroup);

    const posById = new Map<string, [number, number, number]>();

    for (const pt of displayParticles) {
      posById.set(pt.id, pt.positionFm);
      const isSelected = pt.id === selectedNuclearParticleId;
      const geo = new THREE.SphereGeometry(particleVisualRadiusFm(pt.kind), 28, 20);
      const col = particleColorHex(pt.kind);
      const mat = new THREE.MeshStandardMaterial({
        color: col,
        emissive: isSelected ? '#facc15' : col,
        emissiveIntensity: isSelected ? 0.55 : pt.kind === 'alpha' ? 0.28 : 0.16,
        roughness: 0.28,
        metalness: 0.12,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...pt.positionFm);
      ctx.particleGroup.add(mesh);

      if (showNuclearForceArrows && activeFrame) {
        const fVec = new THREE.Vector3(...pt.forceMevFm);
        const mag = fVec.length();
        if (mag > 0.05) {
          const dir = fVec.clone().normalize();
          const len = Math.min(3.5, 0.55 + Math.log10(1 + mag) * 1.15);
          const arrow = new THREE.ArrowHelper(
            dir,
            new THREE.Vector3(...pt.positionFm),
            len,
            0x38bdf8,
            0.35,
            0.22,
          );
          ctx.arrowGroup.add(arrow);
        }
      }
    }

    if (showNuclearEdges && nuclearEdges.length > 0) {
      const linePositions: number[] = [];
      for (const [aId, bId] of nuclearEdges) {
        const pa = posById.get(aId);
        const pb = posById.get(bId);
        if (!pa || !pb) continue;
        linePositions.push(pa[0], pa[1], pa[2], pb[0], pb[1], pb[2]);
      }
      if (linePositions.length > 0) {
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(linePositions, 3),
        );
        const lineMat = new THREE.LineBasicMaterial({
          color: '#38bdf8',
          transparent: true,
          opacity: 0.55,
        });
        ctx.edgeGroup.add(new THREE.LineSegments(lineGeo, lineMat));
      }
    }
  }, [
    displayParticles,
    nuclearEdges,
    selectedNuclearParticleId,
    showGrid,
    showAxes,
    showNuclearEdges,
    showNuclearForceArrows,
    activeFrame,
  ]);

  if (!webgl2Supported) {
    return (
      <div className="viewport-fallback" role="region" aria-label="Nuclear 3D Viewport">
        <div className="viewport-fallback-card">
          <span className="badge badge-warn">Exploratory Toy Model · Femtometer (fm) Scale</span>
          <h2>WebGL2 3D Viewport Unavailable</h2>
          <p className="muted">
            {preset.name} ({nuclearParticles.length} particles) is loaded. Inspect force
            sliders, run simulations, and view energy plots below.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="viewport-root" aria-label="Interactive 3D Nuclear Sandbox Viewport">
      <div ref={containerRef} className="viewport-canvas-host" />

      {showLabels && (
        <div className="viewport-labels-layer" aria-hidden="true">
          {labels.map((lbl) => (
            <div
              key={lbl.id}
              className="atom-floating-label"
              style={{
                transform: `translate(${lbl.x}px, ${lbl.y}px)`,
              }}
            >
              {lbl.text}
            </div>
          ))}
        </div>
      )}

      <div className="viewport-hud-top">
        <div className="viewport-hud-top-left">
          <span className="hud-pill hud-pill-warning">
            Exploratory Toy Model · Femtometer (fm) Scale — Not Quantum Nuclear Physics
          </span>
          {activeFrame ? (
            <span className="hud-pill hud-pill-tool">
              Toy Trajectory Frame {activeFrame.frameIndex + 1}/{nuclearResult?.frames.length} · t ={' '}
              {activeFrame.timeFc.toFixed(2)} fm/c
            </span>
          ) : (
            <span className="hud-pill hud-pill-mode">
              Initial Geometry · {preset.name} ({nuclearParticles.length} particles)
            </span>
          )}
        </div>

        <div className="viewport-hud-top-right">
          <span className="hud-pill hud-pill-warning">
            Visual representation — particle radii &amp; force arrows are illustrative
          </span>
        </div>
      </div>

      <div className="viewport-hud-bottom-left">
        <div className="scale-bar-box">
          <div className="scale-bar-line" style={{ width: `${Math.max(24, pixelPerFm)}px` }} />
          <span className="scale-bar-label">1 fm (10⁻¹⁵ m)</span>
        </div>
        <span className="camera-hint">
          Drag: Orbit · Right-drag: Pan · Scroll: Zoom · Gold: α (He-4) · Red: Proton · Slate: Neutron
        </span>
      </div>
    </div>
  );
};
