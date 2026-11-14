import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  MAX_MACRO_PARTICLES,
  OBSTACLE_BOX,
  SAND_RADIUS,
  type SandWaterSimulationState,
  type StirImpulse,
  TANK_BOUNDS,
  WATER_RADIUS,
  applyShakeImpulse,
  computeSandWaterStats,
  createSandWaterState,
  loadSandWaterPreset,
  spawnMacroParticle,
  stepSandWaterSimulation,
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

export const SandWaterViewport: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [webgl2Supported] = useState<boolean>(() => isWebGL2Available());

  const fluidPresetId = useLabStore((s) => s.fluidPresetId);
  const fluidTool = useLabStore((s) => s.fluidTool);
  const fluidConfig = useLabStore((s) => s.fluidConfig);
  const fluidResetNonce = useLabStore((s) => s.fluidResetNonce);
  const fluidClearNonce = useLabStore((s) => s.fluidClearNonce);
  const fluidShakeNonce = useLabStore((s) => s.fluidShakeNonce);
  const lowEffects = useLabStore((s) => s.lowEffects);
  const cameraResetNonce = useLabStore((s) => s.cameraResetNonce);

  const simRef = useRef<SandWaterSimulationState>(createSandWaterState());
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    particleMesh: THREE.InstancedMesh;
    obstacleMesh: THREE.Mesh;
    stirCursor: THREE.Mesh;
  } | null>(null);

  // Initialize preset once on mount and whenever reset/preset changes
  useEffect(() => {
    loadSandWaterPreset(simRef.current, fluidPresetId);
    useLabStore.getState().setFluidStats(computeSandWaterStats(simRef.current));
  }, [fluidPresetId, fluidResetNonce]);

  useEffect(() => {
    if (fluidClearNonce === 0) return;
    simRef.current.count = 0;
    simRef.current.stepCount = 0;
    useLabStore.getState().setFluidStats(computeSandWaterStats(simRef.current));
  }, [fluidClearNonce]);

  useEffect(() => {
    if (fluidShakeNonce === 0) return;
    applyShakeImpulse(simRef.current);
  }, [fluidShakeNonce]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !webgl2Supported) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#090d16');

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 240);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200);
    camera.position.set(0, 5.6, 13.8);

    const renderer = new THREE.WebGLRenderer({
      antialias: !lowEffects,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowEffects ? 1 : 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 2.4, 0);
    controls.minDistance = 5;
    controls.maxDistance = 42;
    controls.update();

    scene.add(new THREE.HemisphereLight('#bae6fd', '#1e293b', 0.9));
    const keyLight = new THREE.DirectionalLight('#ffffff', 1.4);
    keyLight.position.set(6, 12, 8);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight('#38bdf8', 0.55);
    rimLight.position.set(-7, 3, -6);
    scene.add(rimLight);

    // Subtle lab floor grid
    const gridHelper = new THREE.GridHelper(22, 22, '#334155', '#172033');
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);

    // Tank wireframe box
    const boxW = TANK_BOUNDS.maxX - TANK_BOUNDS.minX;
    const boxH = TANK_BOUNDS.maxY - TANK_BOUNDS.minY;
    const boxD = TANK_BOUNDS.maxZ - TANK_BOUNDS.minZ;
    const tankGeo = new THREE.BoxGeometry(boxW, boxH, boxD);
    const tankEdges = new THREE.EdgesGeometry(tankGeo);
    const tankLine = new THREE.LineSegments(
      tankEdges,
      new THREE.LineBasicMaterial({ color: '#475569', transparent: true, opacity: 0.7 }),
    );
    tankLine.position.set(0, boxH / 2, 0);
    scene.add(tankLine);
    tankGeo.dispose();

    // Optional center barrier obstacle
    const obsW = OBSTACLE_BOX.maxX - OBSTACLE_BOX.minX;
    const obsH = OBSTACLE_BOX.maxY - OBSTACLE_BOX.minY;
    const obsD = OBSTACLE_BOX.maxZ - OBSTACLE_BOX.minZ;
    const obstacleMesh = new THREE.Mesh(
      new THREE.BoxGeometry(obsW, obsH, obsD),
      new THREE.MeshStandardMaterial({
        color: '#334155',
        roughness: 0.6,
        metalness: 0.2,
        transparent: true,
        opacity: 0.85,
      }),
    );
    obstacleMesh.position.set(0, obsH / 2, 0);
    scene.add(obstacleMesh);

    // Stir interaction cursor sphere
    const stirCursor = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 20, 14),
      new THREE.MeshBasicMaterial({
        color: '#38bdf8',
        wireframe: true,
        transparent: true,
        opacity: 0.45,
      }),
    );
    stirCursor.visible = false;
    scene.add(stirCursor);

    // Instanced fine water & sand particles
    const sphereGeo = new THREE.SphereGeometry(1, 10, 8);
    const sphereMat = new THREE.MeshStandardMaterial({
      roughness: 0.3,
      metalness: 0.05,
    });
    const particleMesh = new THREE.InstancedMesh(sphereGeo, sphereMat, MAX_MACRO_PARTICLES);
    particleMesh.count = 0;
    particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(particleMesh);

    sceneRef.current = {
      scene,
      camera,
      renderer,
      controls,
      particleMesh,
      obstacleMesh,
      stirCursor,
    };

    // Pointer interaction against mid-tank plane facing camera (passing through origin z=0)
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const interactionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hitPoint = new THREE.Vector3();
    let pointerActive = false;
    const lastHit = new THREE.Vector3(0, 2.5, 0);
    const currentHit = new THREE.Vector3(0, 2.5, 0);
    const stirVel = new THREE.Vector3(0, 0, 0);
    let spawnCounter = 0;

    const updateHit = (ev: PointerEvent): boolean => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.set(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      interactionPlane.setFromNormalAndCoplanarPoint(
        new THREE.Vector3(camDir.x, 0, camDir.z).normalize().lengthSq() > 0.1
          ? new THREE.Vector3(camDir.x, 0, camDir.z).normalize()
          : new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, 2.0, 0),
      );
      raycaster.setFromCamera(pointerNdc, camera);
      return raycaster.ray.intersectPlane(interactionPlane, hitPoint) !== null;
    };

    const onPointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      const tool = useLabStore.getState().fluidTool;
      if (tool === 'orbit') return;
      if (!updateHit(ev)) return;
      pointerActive = true;
      controls.enabled = false;
      currentHit.copy(hitPoint);
      lastHit.copy(hitPoint);
      stirVel.set(0, 0, 0);
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (!pointerActive) return;
      if (!updateHit(ev)) return;
      stirVel
        .subVectors(hitPoint, currentHit)
        .multiplyScalar(42.0)
        .clampLength(0, 14.0);
      lastHit.copy(currentHit);
      currentHit.copy(hitPoint);
    };

    const onPointerUp = () => {
      if (!pointerActive) return;
      pointerActive = false;
      controls.enabled = true;
      stirCursor.visible = false;
      stirVel.set(0, 0, 0);
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

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

    const dummy = new THREE.Object3D();
    const waterColors = [
      new THREE.Color('#38bdf8'),
      new THREE.Color('#0ea5e9'),
    ];
    const sandColors = [
      new THREE.Color('#eab308'),
      new THREE.Color('#f59e0b'),
      new THREE.Color('#d97706'),
      new THREE.Color('#ca8a04'),
    ];
    let frameTicker = 0;
    let rafId = 0;

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const st = useLabStore.getState();
      const sim = simRef.current;

      controls.enableRotate = st.fluidTool === 'orbit' || !pointerActive;

      // Handle live pour or stir interaction
      const stirImpulse: StirImpulse = {
        active: false,
        x: currentHit.x,
        y: currentHit.y,
        z: currentHit.z,
        vx: stirVel.x,
        vy: stirVel.y,
        vz: stirVel.z,
        radius: 0.95,
      };

      if (pointerActive) {
        if (st.fluidTool === 'pour-water' || st.fluidTool === 'pour-sand') {
          const kind = st.fluidTool === 'pour-water' ? 'water' : 'sand';
          for (let k = 0; k < 7; k++) {
            spawnCounter += 1;
            const jx = Math.sin(spawnCounter * 3.1) * 0.22;
            const jz = Math.cos(spawnCounter * 5.7) * 0.22;
            spawnMacroParticle(
              sim,
              kind,
              currentHit.x + jx,
              currentHit.y + (k % 2) * 0.1,
              currentHit.z + jz,
              jx * 1.8,
              -2.2,
              jz * 1.8,
            );
          }
          stirCursor.visible = false;
        } else if (st.fluidTool === 'stir') {
          stirImpulse.active = true;
          stirCursor.position.set(
            Math.max(TANK_BOUNDS.minX + 0.5, Math.min(TANK_BOUNDS.maxX - 0.5, currentHit.x)),
            Math.max(TANK_BOUNDS.minY + 0.5, Math.min(TANK_BOUNDS.maxY - 0.5, currentHit.y)),
            Math.max(TANK_BOUNDS.minZ + 0.5, Math.min(TANK_BOUNDS.maxZ - 0.5, currentHit.z)),
          );
          stirCursor.visible = true;
        }
      } else {
        stirCursor.visible = false;
      }

      // Decay stir velocity smoothly when pointer stops moving
      stirVel.multiplyScalar(0.7);

      stepSandWaterSimulation(sim, st.fluidConfig, 1 / 60, stirImpulse);
      obstacleMesh.visible = st.fluidConfig.hasObstacle;

      // Sync instanced spheres directly on GPU buffer
      const n = sim.count;
      particleMesh.count = n;
      for (let i = 0; i < n; i++) {
        const isWater = sim.kinds[i] === 0;
        const rad = isWater ? WATER_RADIUS * 1.28 : SAND_RADIUS * 1.02;
        dummy.position.set(sim.px[i]!, sim.py[i]!, sim.pz[i]!);
        dummy.scale.setScalar(rad);
        dummy.updateMatrix();
        particleMesh.setMatrixAt(i, dummy.matrix);
        particleMesh.setColorAt(
          i,
          isWater ? waterColors[i & 1]! : sandColors[i & 3]!,
        );
      }
      particleMesh.instanceMatrix.needsUpdate = true;
      if (particleMesh.instanceColor) {
        particleMesh.instanceColor.needsUpdate = true;
      }

      controls.update();
      renderer.render(scene, camera);

      frameTicker += 1;
      if (frameTicker % 10 === 0) {
        st.setFluidStats(computeSandWaterStats(sim));
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      sphereGeo.dispose();
      sphereMat.dispose();
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
    ctx.camera.position.set(0, 5.6, 13.8);
    ctx.controls.target.set(0, 2.4, 0);
    ctx.controls.update();
  }, [cameraResetNonce]);

  if (!webgl2Supported) {
    return (
      <div className="viewport-fallback" role="region" aria-label="Sand and Water 3D Viewport">
        <div className="viewport-fallback-card">
          <span className="badge badge-warn">
            Macroscopic Particle Sandbox · DEM Sand + SPH Fluid
          </span>
          <h2>WebGL2 3D Viewport Unavailable</h2>
          <p className="muted">
            Interactive 60 FPS rendering requires WebGL2. You can still switch presets and inspect
            parameters.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="viewport-root" aria-label="Interactive 3D Sand and Water Tank">
      <div ref={containerRef} className="viewport-canvas-host" />

      <div className="viewport-hud-top">
        <div className="viewport-hud-top-left">
          <span className="hud-pill hud-pill-warning">
            Macroscopic Particle Sandbox · DEM Sand + SPH Fluid (Not Molecular OpenMM)
          </span>
          <span className="hud-pill hud-pill-tool">
            Tool:{' '}
            {fluidTool === 'pour-water'
              ? 'Pour Water (click/drag in tank)'
              : fluidTool === 'pour-sand'
                ? 'Pour Sand (click/drag in tank)'
                : fluidTool === 'stir'
                  ? 'Stir / Push (drag in tank)'
                  : 'Orbit Camera'}
            {fluidConfig.paused ? ' · PAUSED' : ''}
          </span>
        </div>

        <div className="viewport-hud-top-right">
          <span className="hud-pill hud-pill-mode">
            Cyan: Water (ρ=1.0) · Gold: Sand (ρ=2.4)
          </span>
        </div>
      </div>

      <div className="viewport-hud-bottom-left">
        <span className="camera-hint">
          Left-drag: {fluidTool === 'orbit' ? 'Orbit' : 'Use Active Tool'} · Right-drag: Orbit ·
          Scroll: Zoom
        </span>
      </div>
    </div>
  );
};
