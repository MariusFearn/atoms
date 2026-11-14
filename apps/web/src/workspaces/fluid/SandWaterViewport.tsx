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
  stepSandWaterSimulation,
} from '@matterlab/domain';
import { useLabStore } from '../../state/useLabStore';
import {
  DEFAULT_GLASS_CONTAINER,
  type GpuContainerMode,
  WebGpuFluidEngine,
  generateGpuPresetParticles,
} from './webgpuFluidEngine';

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
  const [backendMode, setBackendMode] = useState<'checking' | 'webgpu' | 'webgl2' | 'none'>('checking');

  const fluidPresetId = useLabStore((s) => s.fluidPresetId);
  const fluidTool = useLabStore((s) => s.fluidTool);
  const fluidContainerMode = useLabStore((s) => s.fluidContainerMode);
  const fluidTargetParticleCount = useLabStore((s) => s.fluidTargetParticleCount);
  const fluidBackendLabel = useLabStore((s) => s.fluidBackendLabel);
  const fluidConfig = useLabStore((s) => s.fluidConfig);
  const fluidResetNonce = useLabStore((s) => s.fluidResetNonce);
  const fluidClearNonce = useLabStore((s) => s.fluidClearNonce);
  const fluidShakeNonce = useLabStore((s) => s.fluidShakeNonce);
  const lowEffects = useLabStore((s) => s.lowEffects);
  const cameraResetNonce = useLabStore((s) => s.cameraResetNonce);

  const gpuEngineRef = useRef<WebGpuFluidEngine | null>(null);
  const gpuShakePendingRef = useRef(false);
  const cpuSimRef = useRef<SandWaterSimulationState>(createSandWaterState());

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    let disposed = false;

    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    host.appendChild(canvas);

    let rafId = 0;
    let resizeObserver: ResizeObserver | null = null;
    let cleanupListeners: (() => void) | null = null;

    const boot = async () => {
      const dpr = Math.min(window.devicePixelRatio || 1, lowEffects ? 1 : 2);
      const initW = Math.max(host.clientWidth, 320);
      const initH = Math.max(host.clientHeight, 240);
      canvas.width = Math.floor(initW * dpr);
      canvas.height = Math.floor(initH * dpr);

      const gpuEngine = await WebGpuFluidEngine.create(canvas);
      if (disposed) {
        gpuEngine?.destroy();
        return;
      }

      if (gpuEngine) {
        gpuEngineRef.current = gpuEngine;
        setBackendMode('webgpu');
        useLabStore
          .getState()
          .setFluidBackendLabel(`WebGPU Compute + Render (${gpuEngine.adapterName})`);

        const stInit = useLabStore.getState();
        const isGlass = stInit.fluidContainerMode === 'glass';
        const gpuContainer: GpuContainerMode = {
          ...DEFAULT_GLASS_CONTAINER,
          isGlassMode: isGlass,
        };
        const presetData = generateGpuPresetParticles(
          stInit.fluidPresetId,
          isGlass,
          stInit.fluidTargetParticleCount,
        );
        gpuEngine.updateContainerMesh(gpuContainer, stInit.fluidConfig.hasObstacle);
        gpuEngine.uploadParticles(presetData.pos, presetData.vel, presetData.count);
        stInit.setFluidStats({
          waterCount: gpuEngine.waterCount,
          sandCount: gpuEngine.sandCount,
          avgSandY: 0,
          avgWaterY: 0,
          kineticEnergy: 0,
        });

        const camera = new THREE.PerspectiveCamera(45, initW / initH, 0.1, 150);
        camera.position.set(0, 5.2, 11.4);
        const controls = new OrbitControls(camera, canvas);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.target.set(0, 2.7, 0);
        controls.minDistance = 4;
        controls.maxDistance = 36;
        controls.mouseButtons = {
          LEFT: stInit.fluidTool === 'orbit' ? THREE.MOUSE.ROTATE : null,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE,
        };
        controls.update();

        const ndcFix = new THREE.Matrix4().set(
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 0.5, 0.5,
          0, 0, 0, 1,
        );
        const viewProj = new THREE.Matrix4();
        const viewProjArr = new Float32Array(16);
        const camRight = new THREE.Vector3();
        const camUp = new THREE.Vector3();
        const camFwd = new THREE.Vector3();

        const raycaster = new THREE.Raycaster();
        const pointerNdc = new THREE.Vector2();
        const interactionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        const hitPoint = new THREE.Vector3();
        let pointerActive = false;
        const currentHit = new THREE.Vector3(0, 3.0, 0);
        const stirVel = new THREE.Vector3(0, 0, 0);

        const updateHit = (ev: PointerEvent): boolean => {
          const rect = canvas.getBoundingClientRect();
          pointerNdc.set(
            ((ev.clientX - rect.left) / rect.width) * 2 - 1,
            -((ev.clientY - rect.top) / rect.height) * 2 + 1,
          );
          camera.getWorldDirection(camFwd);
          const planeNorm = new THREE.Vector3(camFwd.x, 0, camFwd.z);
          if (planeNorm.lengthSq() < 0.05) planeNorm.set(0, 0, 1);
          planeNorm.normalize();
          interactionPlane.setFromNormalAndCoplanarPoint(
            planeNorm,
            new THREE.Vector3(0, 2.4, 0),
          );
          raycaster.setFromCamera(pointerNdc, camera);
          return raycaster.ray.intersectPlane(interactionPlane, hitPoint) !== null;
        };

        const onPointerDown = (ev: PointerEvent) => {
          if (ev.button !== 0) return;
          if (useLabStore.getState().fluidTool === 'orbit') return;
          if (!updateHit(ev)) return;
          pointerActive = true;
          controls.enabled = false;
          currentHit.copy(hitPoint);
          stirVel.set(0, 0, 0);
        };

        const onPointerMove = (ev: PointerEvent) => {
          if (!pointerActive) return;
          if (!updateHit(ev)) return;
          stirVel
            .subVectors(hitPoint, currentHit)
            .multiplyScalar(42.0)
            .clampLength(0, 16.0);
          currentHit.copy(hitPoint);
        };

        const onPointerUp = () => {
          if (!pointerActive) return;
          pointerActive = false;
          controls.enabled = true;
          stirVel.set(0, 0, 0);
        };

        canvas.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);

        const onResize = () => {
          const w = Math.max(host.clientWidth, 1);
          const h = Math.max(host.clientHeight, 1);
          const curDpr = Math.min(window.devicePixelRatio || 1, lowEffects ? 1 : 2);
          canvas.width = Math.floor(w * curDpr);
          canvas.height = Math.floor(h * curDpr);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        };

        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(onResize);
          resizeObserver.observe(host);
        }
        window.addEventListener('resize', onResize);

        let lastCamReset = useLabStore.getState().cameraResetNonce;
        let frameTicker = 0;

        const loop = () => {
          if (disposed) return;
          rafId = requestAnimationFrame(loop);

          const st = useLabStore.getState();
          if (st.cameraResetNonce !== lastCamReset) {
            lastCamReset = st.cameraResetNonce;
            camera.position.set(0, 5.2, 11.4);
            controls.target.set(0, 2.7, 0);
          }

          controls.mouseButtons.LEFT =
            st.fluidTool === 'orbit' ? THREE.MOUSE.ROTATE : null;
          controls.enableRotate = st.fluidTool === 'orbit' || !pointerActive;
          controls.update();
          camera.updateMatrixWorld();

          camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
          camUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
          viewProj
            .multiplyMatrices(ndcFix, camera.projectionMatrix)
            .multiply(camera.matrixWorldInverse);
          viewProjArr.set(viewProj.elements);

          if (pointerActive) {
            if (st.fluidTool === 'pour-water' || st.fluidTool === 'pour-sand') {
              const kind = st.fluidTool === 'pour-water' ? 'water' : 'sand';
              const clampedY = Math.max(0.5, Math.min(6.1, currentHit.y));
              gpuEngine.spawnStream(kind, currentHit.x, clampedY, currentHit.z, 22);
            }
          }

          let stirMode: 0 | 1 | 2 = 0;
          if (gpuShakePendingRef.current) {
            stirMode = 2;
            gpuShakePendingRef.current = false;
          } else if (pointerActive && st.fluidTool === 'stir') {
            stirMode = 1;
          }
          stirVel.multiplyScalar(0.72);

          const curContainer: GpuContainerMode = {
            ...DEFAULT_GLASS_CONTAINER,
            isGlassMode: st.fluidContainerMode === 'glass',
          };

          gpuEngine.stepAndRender({
            width: canvas.width,
            height: canvas.height,
            config: st.fluidConfig,
            container: curContainer,
            camPos: [camera.position.x, camera.position.y, camera.position.z],
            camRight: [camRight.x, camRight.y, camRight.z],
            camUp: [camUp.x, camUp.y, camUp.z],
            viewProj: viewProjArr,
            stirMode,
            stirPos: [currentHit.x, currentHit.y, currentHit.z],
            stirVel: [stirVel.x, stirVel.y, stirVel.z],
          });

          frameTicker += 1;
          if (frameTicker % 10 === 0) {
            st.setFluidStats({
              waterCount: gpuEngine.waterCount,
              sandCount: gpuEngine.sandCount,
              avgSandY: 0,
              avgWaterY: 0,
              kineticEnergy: 0,
            });
          }
        };
        loop();

        cleanupListeners = () => {
          canvas.removeEventListener('pointerdown', onPointerDown);
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', onPointerUp);
          window.removeEventListener('resize', onResize);
          resizeObserver?.disconnect();
          controls.dispose();
          gpuEngine.destroy();
          gpuEngineRef.current = null;
        };
        return;
      }

      if (!isWebGL2Available()) {
        if (canvas.parentElement === host) host.removeChild(canvas);
        setBackendMode('none');
        useLabStore.getState().setFluidBackendLabel('WebGL2 / WebGPU Unavailable');
        return;
      }

      setBackendMode('webgl2');
      useLabStore.getState().setFluidBackendLabel('CPU + WebGL2 Fallback (max 6,000)');

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#090d16');
      const camera = new THREE.PerspectiveCamera(45, initW / initH, 0.1, 200);
      camera.position.set(0, 5.6, 13.8);

      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: !lowEffects,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(dpr);
      renderer.setSize(initW, initH);

      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.target.set(0, 2.4, 0);
      controls.update();

      scene.add(new THREE.HemisphereLight('#bae6fd', '#1e293b', 0.9));
      const keyLight = new THREE.DirectionalLight('#ffffff', 1.4);
      keyLight.position.set(6, 12, 8);
      scene.add(keyLight);

      const boxW = TANK_BOUNDS.maxX - TANK_BOUNDS.minX;
      const boxH = TANK_BOUNDS.maxY - TANK_BOUNDS.minY;
      const boxD = TANK_BOUNDS.maxZ - TANK_BOUNDS.minZ;
      const tankGeo = new THREE.BoxGeometry(boxW, boxH, boxD);
      const tankLine = new THREE.LineSegments(
        new THREE.EdgesGeometry(tankGeo),
        new THREE.LineBasicMaterial({ color: '#475569', transparent: true, opacity: 0.7 }),
      );
      tankLine.position.set(0, boxH / 2, 0);
      scene.add(tankLine);
      tankGeo.dispose();

      const obstacleMesh = new THREE.Mesh(
        new THREE.BoxGeometry(
          OBSTACLE_BOX.maxX - OBSTACLE_BOX.minX,
          OBSTACLE_BOX.maxY - OBSTACLE_BOX.minY,
          OBSTACLE_BOX.maxZ - OBSTACLE_BOX.minZ,
        ),
        new THREE.MeshStandardMaterial({ color: '#334155', transparent: true, opacity: 0.85 }),
      );
      obstacleMesh.position.set(0, (OBSTACLE_BOX.maxY - OBSTACLE_BOX.minY) / 2, 0);
      scene.add(obstacleMesh);

      const sphereGeo = new THREE.SphereGeometry(1, 10, 8);
      const sphereMat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.05 });
      const particleMesh = new THREE.InstancedMesh(sphereGeo, sphereMat, MAX_MACRO_PARTICLES);
      particleMesh.count = 0;
      particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(particleMesh);

      loadSandWaterPreset(cpuSimRef.current, useLabStore.getState().fluidPresetId);

      const dummy = new THREE.Object3D();
      const waterColor = new THREE.Color('#38bdf8');
      const sandColor = new THREE.Color('#eab308');
      const stirZero: StirImpulse = {
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        radius: 0.9,
      };
      let frameTicker = 0;

      const cpuLoop = () => {
        if (disposed) return;
        rafId = requestAnimationFrame(cpuLoop);
        const st = useLabStore.getState();
        const sim = cpuSimRef.current;
        stepSandWaterSimulation(sim, st.fluidConfig, 1 / 60, stirZero);
        obstacleMesh.visible = st.fluidConfig.hasObstacle;
        particleMesh.count = sim.count;
        for (let i = 0; i < sim.count; i++) {
          const isWater = sim.kinds[i] === 0;
          dummy.position.set(sim.px[i]!, sim.py[i]!, sim.pz[i]!);
          dummy.scale.setScalar(isWater ? WATER_RADIUS * 1.28 : SAND_RADIUS * 1.02);
          dummy.updateMatrix();
          particleMesh.setMatrixAt(i, dummy.matrix);
          particleMesh.setColorAt(i, isWater ? waterColor : sandColor);
        }
        particleMesh.instanceMatrix.needsUpdate = true;
        if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;
        controls.update();
        renderer.render(scene, camera);

        frameTicker += 1;
        if (frameTicker % 10 === 0) {
          st.setFluidStats(computeSandWaterStats(sim));
        }
      };
      cpuLoop();

      cleanupListeners = () => {
        controls.dispose();
        sphereGeo.dispose();
        sphereMat.dispose();
        renderer.dispose();
      };
    };

    void boot();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      cleanupListeners?.();
      if (canvas.parentElement === host) {
        host.removeChild(canvas);
      }
    };
  }, [lowEffects]);

  useEffect(() => {
    const gpu = gpuEngineRef.current;
    if (gpu) {
      const isGlass = fluidContainerMode === 'glass';
      const gpuContainer: GpuContainerMode = {
        ...DEFAULT_GLASS_CONTAINER,
        isGlassMode: isGlass,
      };
      gpu.updateContainerMesh(gpuContainer, fluidConfig.hasObstacle);
      const data = generateGpuPresetParticles(
        fluidPresetId,
        isGlass,
        fluidTargetParticleCount,
      );
      gpu.uploadParticles(data.pos, data.vel, data.count);
      useLabStore.getState().setFluidStats({
        waterCount: gpu.waterCount,
        sandCount: gpu.sandCount,
        avgSandY: 0,
        avgWaterY: 0,
        kineticEnergy: 0,
      });
    } else if (backendMode === 'webgl2') {
      loadSandWaterPreset(cpuSimRef.current, fluidPresetId);
      useLabStore.getState().setFluidStats(computeSandWaterStats(cpuSimRef.current));
    }
  }, [fluidPresetId, fluidContainerMode, fluidTargetParticleCount, fluidResetNonce, backendMode]);

  useEffect(() => {
    if (fluidClearNonce === 0) return;
    const gpu = gpuEngineRef.current;
    if (gpu) {
      gpu.clearParticles();
      useLabStore.getState().setFluidStats({
        waterCount: 0,
        sandCount: 0,
        avgSandY: 0,
        avgWaterY: 0,
        kineticEnergy: 0,
      });
    } else {
      cpuSimRef.current.count = 0;
      useLabStore.getState().setFluidStats(computeSandWaterStats(cpuSimRef.current));
    }
  }, [fluidClearNonce]);

  useEffect(() => {
    if (fluidShakeNonce === 0) return;
    if (gpuEngineRef.current) {
      gpuShakePendingRef.current = true;
    } else {
      applyShakeImpulse(cpuSimRef.current);
    }
  }, [fluidShakeNonce]);

  useEffect(() => {
    void cameraResetNonce;
  }, [cameraResetNonce]);

  if (backendMode === 'none') {
    return (
      <div className="viewport-fallback" role="region" aria-label="Sand and Water 3D Viewport">
        <div className="viewport-fallback-card">
          <span className="badge badge-warn">
            Macroscopic Particle Sandbox · DEM Sand + SPH Fluid
          </span>
          <h2>WebGL2 / WebGPU Viewport Unavailable</h2>
          <p className="muted">
            Interactive GPU fluid rendering requires a WebGPU or WebGL2-capable browser.
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
            {fluidBackendLabel} · Tool:{' '}
            {fluidTool === 'pour-water'
              ? 'Pour Water (click/drag)'
              : fluidTool === 'pour-sand'
                ? 'Pour Sand (click/drag)'
                : fluidTool === 'stir'
                  ? 'Stir / Push (drag)'
                  : 'Orbit Camera'}
            {fluidConfig.paused ? ' · PAUSED' : ''}
          </span>
        </div>

        <div className="viewport-hud-top-right">
          <span className="hud-pill hud-pill-mode">
            {fluidContainerMode === 'glass' ? '3D Glass' : 'Lab Tank'} · Cyan: Water (ρ=1.0) ·
            Gold: Sand (ρ=2.4)
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
