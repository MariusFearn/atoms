import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  BOHR_RADIUS_ANGSTROM,
  HYDROGENIC_ORBITALS,
  type HydrogenicOrbitalId,
  evaluateHydrogenicPsi,
} from '@matterlab/domain';
import { useLabStore } from '../../state/useLabStore';

function isWebGL2Available(): boolean {
  try {
    const testCanvas = document.createElement('canvas');
    return Boolean(testCanvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SampledPointCloud {
  positions: Float32Array;
  psiValues: Float32Array;
  maxAbsPsi: number;
  count: number;
}

function sampleOrbitalCloud(
  orbitalId: HydrogenicOrbitalId,
  maxRadiusA0: number,
  sliceZHalf: boolean,
  targetCount = 4800,
): SampledPointCloud {
  const rng = mulberry32(1337 + orbitalId.length * 97);

  // Estimate peak |psi|^2 across a quick coarse grid
  let maxPsi2 = 1e-12;
  const probeSteps = 22;
  for (let ix = 0; ix <= probeSteps; ix++) {
    const x = -maxRadiusA0 + (2 * maxRadiusA0 * ix) / probeSteps;
    for (let iy = 0; iy <= probeSteps; iy++) {
      const y = -maxRadiusA0 + (2 * maxRadiusA0 * iy) / probeSteps;
      for (let iz = 0; iz <= probeSteps; iz++) {
        const z = -maxRadiusA0 + (2 * maxRadiusA0 * iz) / probeSteps;
        const p = evaluateHydrogenicPsi(orbitalId, x, y, z);
        const p2 = p * p;
        if (p2 > maxPsi2) maxPsi2 = p2;
      }
    }
  }

  const positions = new Float32Array(targetCount * 3);
  const psiValues = new Float32Array(targetCount);
  let accepted = 0;
  let maxAbsPsi = 1e-9;
  const maxAttempts = targetCount * 90;

  for (let attempt = 0; attempt < maxAttempts && accepted < targetCount; attempt++) {
    const x = (rng() * 2 - 1) * maxRadiusA0;
    const y = (rng() * 2 - 1) * maxRadiusA0;
    const zRaw = (rng() * 2 - 1) * maxRadiusA0;
    const z = sliceZHalf ? -Math.abs(zRaw) : zRaw;
    if (x * x + y * y + z * z > maxRadiusA0 * maxRadiusA0) continue;

    const psi = evaluateHydrogenicPsi(orbitalId, x, y, z);
    const probRatio = (psi * psi) / maxPsi2;
    // Slight power lift (0.72) keeps outer nodal lobes clearly visible
    if (rng() <= Math.pow(probRatio, 0.72)) {
      const base = accepted * 3;
      positions[base] = x;
      positions[base + 1] = y;
      positions[base + 2] = z;
      psiValues[accepted] = psi;
      if (Math.abs(psi) > maxAbsPsi) maxAbsPsi = Math.abs(psi);
      accepted += 1;
    }
  }

  return {
    positions: positions.subarray(0, accepted * 3),
    psiValues: psiValues.subarray(0, accepted),
    maxAbsPsi,
    count: accepted,
  };
}

export const AtomWaveViewport: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [webgl2Supported] = useState<boolean>(() => isWebGL2Available());
  const [pixelPerA0, setPixelPerA0] = useState<number>(32);

  const atomOrbitalId = useLabStore((s) => s.atomOrbitalId);
  const atomFieldMode = useLabStore((s) => s.atomFieldMode);
  const atomSlicePlane = useLabStore((s) => s.atomSlicePlane);
  const atomShowDipoleLines = useLabStore((s) => s.atomShowDipoleLines);
  const showAxes = useLabStore((s) => s.showAxes);
  const showGrid = useLabStore((s) => s.showGrid);
  const lowEffects = useLabStore((s) => s.lowEffects);
  const cameraResetNonce = useLabStore((s) => s.cameraResetNonce);

  const orbitalSpec =
    HYDROGENIC_ORBITALS.find((o) => o.id === atomOrbitalId) ?? HYDROGENIC_ORBITALS[0]!;

  const cloud = useMemo(
    () =>
      sampleOrbitalCloud(
        orbitalSpec.id,
        orbitalSpec.maxRadiusA0,
        atomSlicePlane,
        lowEffects ? 2400 : 4800,
      ),
    [orbitalSpec.id, orbitalSpec.maxRadiusA0, atomSlicePlane, lowEffects],
  );

  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    cloudPoints: THREE.Points | null;
    dipoleGroup: THREE.Group;
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

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 400);
    camera.position.set(14, 9, 17);

    const renderer = new THREE.WebGLRenderer({
      antialias: !lowEffects,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowEffects ? 1 : 2));
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 4;
    controls.maxDistance = 120;

    scene.add(new THREE.AmbientLight('#ffffff', 0.8));

    const gridHelper = new THREE.GridHelper(24, 24, '#334155', '#172033');
    gridHelper.position.y = -0.02;
    scene.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(3.0);
    scene.add(axesHelper);

    // Exaggerated nucleus marker at origin
    const nucGeo = new THREE.SphereGeometry(0.26, 20, 16);
    const nucMat = new THREE.MeshBasicMaterial({ color: '#f8fafc' });
    scene.add(new THREE.Mesh(nucGeo, nucMat));

    const dipoleGroup = new THREE.Group();
    scene.add(dipoleGroup);

    // Build 3D dipole field loops: r = R_max * sin^2(theta)
    const radii = [5.5, 9.5, 14.0];
    const phiSteps = 8;
    for (const rMax of radii) {
      for (let p = 0; p < phiSteps; p++) {
        const phi = (p / phiSteps) * Math.PI * 2;
        const pts: THREE.Vector3[] = [];
        for (let s = 0; s <= 48; s++) {
          const theta = (s / 48) * Math.PI;
          const sinT = Math.sin(theta);
          const cosT = Math.cos(theta);
          const r = rMax * sinT * sinT;
          pts.push(
            new THREE.Vector3(
              r * sinT * Math.cos(phi),
              r * sinT * Math.sin(phi),
              r * cosT,
            ),
          );
        }
        const loopGeo = new THREE.BufferGeometry().setFromPoints(pts);
        const loopMat = new THREE.LineBasicMaterial({
          color: '#a78bfa',
          transparent: true,
          opacity: 0.28,
        });
        dipoleGroup.add(new THREE.Line(loopGeo, loopMat));
      }
    }

    sceneRef.current = {
      scene,
      camera,
      renderer,
      controls,
      cloudPoints: null,
      dipoleGroup,
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

    const startTime = performance.now();
    let rafId = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      controls.update();

      const st = useLabStore.getState();
      const ctx = sceneRef.current;
      if (ctx?.cloudPoints) {
        const mat = ctx.cloudPoints.material as THREE.PointsMaterial;
        if (st.atomFieldMode === 'amplitude-phase' && st.atomAnimateWave) {
          const elapsed = (performance.now() - startTime) * 0.001;
          const phaseFactor = Math.abs(Math.cos(elapsed * 2.2));
          mat.opacity = 0.25 + 0.68 * phaseFactor;
        } else {
          mat.opacity = 0.85;
        }
      }

      renderer.render(scene, camera);

      const host = containerRef.current;
      if (host) {
        const w = host.clientWidth;
        const h = host.clientHeight;
        const p0 = new THREE.Vector3(0, 0, 0).project(camera);
        const p1 = new THREE.Vector3(1, 0, 0).project(camera);
        const pxDist = Math.hypot(((p1.x - p0.x) * w) / 2, ((p1.y - p0.y) * h) / 2);
        if (Number.isFinite(pxDist) && pxDist > 2 && pxDist < 400) {
          setPixelPerA0(Math.round(pxDist));
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

  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    const dist = orbitalSpec.maxRadiusA0 * 1.85;
    ctx.camera.position.set(dist * 0.85, dist * 0.55, dist);
    ctx.controls.target.set(0, 0, 0);
    ctx.controls.update();
  }, [cameraResetNonce, orbitalSpec.maxRadiusA0]);

  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;

    ctx.gridHelper.visible = showGrid;
    ctx.axesHelper.visible = showAxes;
    ctx.dipoleGroup.visible = atomShowDipoleLines;

    if (ctx.cloudPoints) {
      ctx.scene.remove(ctx.cloudPoints);
      ctx.cloudPoints.geometry.dispose();
      (ctx.cloudPoints.material as THREE.Material).dispose();
      ctx.cloudPoints = null;
    }

    const colors = new Float32Array(cloud.count * 3);
    const posCol = new THREE.Color('#38bdf8');
    const negCol = new THREE.Color('#f59e0b');
    const densCol = new THREE.Color('#34d399');

    for (let i = 0; i < cloud.count; i++) {
      const psi = cloud.psiValues[i] ?? 0;
      const norm = Math.min(1, Math.abs(psi) / cloud.maxAbsPsi);
      if (atomFieldMode === 'amplitude-phase') {
        const base = psi >= 0 ? posCol : negCol;
        const boost = 0.45 + 0.55 * norm;
        colors[i * 3] = base.r * boost;
        colors[i * 3 + 1] = base.g * boost;
        colors[i * 3 + 2] = base.b * boost;
      } else {
        const boost = 0.35 + 0.65 * Math.sqrt(norm);
        colors[i * 3] = densCol.r * boost;
        colors[i * 3 + 1] = densCol.g * boost;
        colors[i * 3 + 2] = densCol.b * boost;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(cloud.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: orbitalSpec.maxRadiusA0 * 0.032,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geo, mat);
    ctx.scene.add(points);
    ctx.cloudPoints = points;
  }, [
    cloud,
    atomFieldMode,
    atomShowDipoleLines,
    showGrid,
    showAxes,
    orbitalSpec.maxRadiusA0,
  ]);

  if (!webgl2Supported) {
    return (
      <div className="viewport-fallback" role="region" aria-label="Atom Standing-Wave Viewport">
        <div className="viewport-fallback-card">
          <span className="badge badge-muted">Curated Hydrogenic Wave Model · Atomic Units (a₀)</span>
          <h2>WebGL2 3D Viewport Unavailable</h2>
          <p className="muted">
            Orbital <strong>{orbitalSpec.label}</strong> ({cloud.count} sampled wave points) is
            active in {atomFieldMode === 'amplitude-phase' ? 'Amplitude & Phase (ψ)' : 'Probability Density (|ψ|²)'} mode.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="viewport-root" aria-label="3D Atom Standing-Wave Viewport">
      <div ref={containerRef} className="viewport-canvas-host" />

      <div className="viewport-hud-top">
        <div className="viewport-hud-top-left">
          <span className="hud-pill hud-pill-mode">
            {atomFieldMode === 'amplitude-phase'
              ? `Orbital Amplitude & Phase ψ(r) · ${orbitalSpec.label}`
              : `Probability Density |ψ(r)|² · ${orbitalSpec.label}`}
          </span>
          <span className="hud-pill hud-pill-tool">
            {atomFieldMode === 'amplitude-phase'
              ? 'Cyan (+ phase) / Amber (− phase) · 3D standing wave (not a solid shell)'
              : 'Emerald intensity = |ψ|² detection probability density (not a solid shell)'}
          </span>
        </div>

        <div className="viewport-hud-top-right">
          <span className="hud-pill hud-pill-warning">
            Nucleus marker NOT to scale (~100,000× smaller than electron cloud)
          </span>
        </div>
      </div>

      <div className="viewport-hud-bottom-left">
        <div className="scale-bar-box">
          <div className="scale-bar-line" style={{ width: `${Math.max(20, pixelPerA0)}px` }} />
          <span className="scale-bar-label">
            1 a₀ ({BOHR_RADIUS_ANGSTROM.toFixed(3)} Å)
          </span>
        </div>
        <span className="camera-hint">
          Drag: Orbit · Right-drag: Pan · Scroll: Zoom · {atomSlicePlane ? 'Cross-section sliced at z=0' : 'Full 3D volume'}
        </span>
      </div>
    </div>
  );
};
