import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  FERRO_RADIUS,
  MATERIAL_DENSITY_G_CM3,
  MAX_MACRO_PARTICLES,
  type MacroParticleKind,
  OIL_RADIUS,
  SAND_RADIUS,
  type SandWaterSimulationState,
  type StirImpulse,
  TANK_BOUNDS,
  WATER_RADIUS,
  applyShakeImpulse,
  computeSandWaterStats,
  createSandWaterState,
  getObstaclesForPreset,
  loadSandWaterPreset,
  spawnMacroParticle,
  stepSandWaterSimulation,
} from '@matterlab/domain';
import { type SandWaterTool, useLabStore } from '../../state/useLabStore';
import {
  DEFAULT_GLASS_CONTAINER,
  type GpuContainerMode,
  WebGpuFluidEngine,
  generateGpuPresetParticles,
} from './webgpuFluidEngine';

function toolToPourKind(tool: SandWaterTool): MacroParticleKind | null {
  switch (tool) {
    case 'pour-water':
      return 'water';
    case 'pour-sand':
      return 'sand';
    case 'pour-oil':
      return 'oil';
    case 'pour-ferro':
      return 'ferro';
    default:
      return null;
  }
}

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

      const { engine: gpuEngine, reason: gpuSkipReason } =
        await WebGpuFluidEngine.create(canvas);
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
        gpuEngine.updateContainerMesh(
          gpuContainer,
          stInit.fluidPresetId,
          stInit.fluidConfig.hasObstacle,
        );
        gpuEngine.uploadParticles(presetData.pos, presetData.vel, presetData.count);
        stInit.setFluidStats({
          waterCount: gpuEngine.waterCount,
          sandCount: gpuEngine.sandCount,
          oilCount: gpuEngine.oilCount,
          ferroCount: gpuEngine.ferroCount,
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
          ev.stopImmediatePropagation();
          if (!updateHit(ev)) return;
          pointerActive = true;
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

        const onPointerUp = (ev: PointerEvent) => {
          if (ev.button !== 0 || !pointerActive) return;
          pointerActive = false;
          stirVel.set(0, 0, 0);
        };

        canvas.addEventListener('pointerdown', onPointerDown, { capture: true });
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

          const pourKind = pointerActive ? toolToPourKind(st.fluidTool) : null;
          if (pourKind) {
            let sx = currentHit.x;
            let sz = currentHit.z;
            const sy = Math.max(0.8, Math.min(6.1, currentHit.y));
            if (st.fluidContainerMode === 'glass') {
              const rMax = DEFAULT_GLASS_CONTAINER.glassRTop * 0.78;
              const rCur = Math.hypot(sx, sz);
              if (rCur > rMax && rCur > 1e-6) {
                sx = (sx / rCur) * rMax;
                sz = (sz / rCur) * rMax;
              }
            } else {
              sx = Math.max(-4.1, Math.min(4.1, sx));
              sz = Math.max(-1.8, Math.min(1.8, sz));
            }
            gpuEngine.spawnStream(pourKind, sx, sy, sz, 22);
          } else if (!st.fluidConfig.paused && st.fluidAutoPourKind !== 'none') {
            const faucetX =
              st.fluidContainerMode === 'tank' && st.fluidPresetId === 'cascade-maze'
                ? -3.5
                : 0;
            gpuEngine.spawnStream(st.fluidAutoPourKind, faucetX, 5.95, 0, 16);
          }

          let stirMode: 0 | 1 | 2 | 3 = 0;
          if (gpuShakePendingRef.current) {
            stirMode = 2;
            gpuShakePendingRef.current = false;
          } else if (pointerActive && st.fluidTool === 'magnet') {
            stirMode = 3;
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
              oilCount: gpuEngine.oilCount,
              ferroCount: gpuEngine.ferroCount,
              avgSandY: 0,
              avgWaterY: 0,
              kineticEnergy: 0,
            });
          }
        };
        loop();

        cleanupListeners = () => {
          canvas.removeEventListener('pointerdown', onPointerDown, { capture: true });
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
      useLabStore
        .getState()
        .setFluidBackendLabel(`CPU + WebGL2 (${gpuSkipReason}; max 6,000)`);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#090d16');
      const camera = new THREE.PerspectiveCamera(45, initW / initH, 0.1, 200);
      camera.position.set(0, 5.2, 12.2);

      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: !lowEffects,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(dpr);
      renderer.setSize(initW, initH);

      const stCpuInit = useLabStore.getState();
      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.target.set(0, 2.5, 0);
      controls.mouseButtons = {
        LEFT: stCpuInit.fluidTool === 'orbit' ? THREE.MOUSE.ROTATE : null,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
      };
      controls.update();

      scene.add(new THREE.HemisphereLight('#bae6fd', '#1e293b', 0.9));
      const keyLight = new THREE.DirectionalLight('#ffffff', 1.4);
      keyLight.position.set(6, 12, 8);
      scene.add(keyLight);

      const gridHelper = new THREE.GridHelper(20, 20, '#334155', '#172033');
      gridHelper.position.y = -0.01;
      scene.add(gridHelper);

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

      // Tapered 3D Glass wireframe for CPU+WebGL2 mode
      const glassGeo = new THREE.CylinderGeometry(2.75, 2.05, 6.6, 28, 3, true);
      const glassLine = new THREE.LineSegments(
        new THREE.EdgesGeometry(glassGeo),
        new THREE.LineBasicMaterial({ color: '#7dd3fc', transparent: true, opacity: 0.45 }),
      );
      glassLine.position.set(0, 3.3, 0);
      scene.add(glassLine);
      glassGeo.dispose();

      const obstacleGroup = new THREE.Group();
      const obstacleMat = new THREE.MeshStandardMaterial({
        color: '#253952',
        roughness: 0.45,
        metalness: 0.25,
        transparent: true,
        opacity: 0.9,
      });
      const obstacleEdgeMat = new THREE.LineBasicMaterial({
        color: '#60ccfa',
        transparent: true,
        opacity: 0.85,
      });
      scene.add(obstacleGroup);
      let obstacleKey = '';
      const syncCpuObstacles = (
        presetId: typeof stCpuInit.fluidPresetId,
        hasBarrier: boolean,
        isGlass: boolean,
      ) => {
        const key = `${presetId}|${hasBarrier}|${isGlass}`;
        if (key === obstacleKey) return;
        obstacleKey = key;
        while (obstacleGroup.children.length > 0) {
          const child = obstacleGroup.children.pop()!;
          if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
            child.geometry.dispose();
          }
        }
        const obs = getObstaclesForPreset(presetId, hasBarrier, isGlass);
        for (const ob of obs) {
          const geo = new THREE.BoxGeometry(ob.hx * 2, ob.hy * 2, ob.hz * 2);
          const mesh = new THREE.Mesh(geo, obstacleMat);
          mesh.position.set(ob.cx, ob.cy, ob.cz);
          mesh.rotation.z = ob.angleZ;
          obstacleGroup.add(mesh);

          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), obstacleEdgeMat);
          edges.position.copy(mesh.position);
          edges.rotation.z = ob.angleZ;
          obstacleGroup.add(edges);
        }
      };

      const sphereGeo = new THREE.SphereGeometry(1, 10, 8);
      const sphereMat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.05 });
      const particleMesh = new THREE.InstancedMesh(sphereGeo, sphereMat, MAX_MACRO_PARTICLES);
      particleMesh.count = 0;
      particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(particleMesh);

      loadSandWaterPreset(
        cpuSimRef.current,
        stCpuInit.fluidPresetId,
        stCpuInit.fluidContainerMode === 'glass',
      );

      const cpuRaycaster = new THREE.Raycaster();
      const cpuNdc = new THREE.Vector2();
      const cpuPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const cpuHit = new THREE.Vector3();
      const cpuCamFwd = new THREE.Vector3();
      let cpuPointerActive = false;
      const cpuCurHit = new THREE.Vector3(0, 3.0, 0);
      const cpuStirVel = new THREE.Vector3(0, 0, 0);
      let cpuSpawnSeq = 0;

      const updateCpuHit = (ev: PointerEvent): boolean => {
        const rect = canvas.getBoundingClientRect();
        cpuNdc.set(
          ((ev.clientX - rect.left) / rect.width) * 2 - 1,
          -((ev.clientY - rect.top) / rect.height) * 2 + 1,
        );
        camera.getWorldDirection(cpuCamFwd);
        const norm = new THREE.Vector3(cpuCamFwd.x, 0, cpuCamFwd.z);
        if (norm.lengthSq() < 0.05) norm.set(0, 0, 1);
        norm.normalize();
        cpuPlane.setFromNormalAndCoplanarPoint(norm, new THREE.Vector3(0, 2.4, 0));
        cpuRaycaster.setFromCamera(cpuNdc, camera);
        return cpuRaycaster.ray.intersectPlane(cpuPlane, cpuHit) !== null;
      };

      const onCpuDown = (ev: PointerEvent) => {
        if (ev.button !== 0) return;
        if (useLabStore.getState().fluidTool === 'orbit') return;
        ev.stopImmediatePropagation();
        if (!updateCpuHit(ev)) return;
        cpuPointerActive = true;
        cpuCurHit.copy(cpuHit);
        cpuStirVel.set(0, 0, 0);
      };

      const onCpuMove = (ev: PointerEvent) => {
        if (!cpuPointerActive) return;
        if (!updateCpuHit(ev)) return;
        cpuStirVel
          .subVectors(cpuHit, cpuCurHit)
          .multiplyScalar(40.0)
          .clampLength(0, 15.0);
        cpuCurHit.copy(cpuHit);
      };

      const onCpuUp = (ev: PointerEvent) => {
        if (ev.button !== 0 || !cpuPointerActive) return;
        cpuPointerActive = false;
        cpuStirVel.set(0, 0, 0);
      };

      canvas.addEventListener('pointerdown', onCpuDown, { capture: true });
      window.addEventListener('pointermove', onCpuMove);
      window.addEventListener('pointerup', onCpuUp);

      const onCpuResize = () => {
        const w = Math.max(host.clientWidth, 1);
        const h = Math.max(host.clientHeight, 1);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(onCpuResize);
        resizeObserver.observe(host);
      }
      window.addEventListener('resize', onCpuResize);

      const dummy = new THREE.Object3D();
      const waterColor = new THREE.Color('#38bdf8');
      const sandColors = [
        new THREE.Color('#eab308'),
        new THREE.Color('#f59e0b'),
        new THREE.Color('#d97706'),
        new THREE.Color('#ca8a04'),
      ];
      const oilColor = new THREE.Color('#a3e635');
      const ferroColor = new THREE.Color('#25282e');
      let lastCpuCamReset = stCpuInit.cameraResetNonce;
      let frameTicker = 0;

      const cpuLoop = () => {
        if (disposed) return;
        rafId = requestAnimationFrame(cpuLoop);
        const st = useLabStore.getState();
        const sim = cpuSimRef.current;
        const isGlass = st.fluidContainerMode === 'glass';

        if (st.cameraResetNonce !== lastCpuCamReset) {
          lastCpuCamReset = st.cameraResetNonce;
          camera.position.set(0, 5.2, 12.2);
          controls.target.set(0, 2.5, 0);
        }

        controls.mouseButtons.LEFT =
          st.fluidTool === 'orbit' ? THREE.MOUSE.ROTATE : null;
        controls.enableRotate = st.fluidTool === 'orbit' || !cpuPointerActive;

        const cpuPourKind = cpuPointerActive ? toolToPourKind(st.fluidTool) : null;
        if (cpuPourKind) {
          let sx = cpuCurHit.x;
          let sz = cpuCurHit.z;
          const sy = Math.max(0.6, Math.min(6.0, cpuCurHit.y));
          if (isGlass) {
            const rMax = 2.0;
            const rCur = Math.hypot(sx, sz);
            if (rCur > rMax && rCur > 1e-6) {
              sx = (sx / rCur) * rMax;
              sz = (sz / rCur) * rMax;
            }
          } else {
            sx = Math.max(-4.1, Math.min(4.1, sx));
            sz = Math.max(-1.8, Math.min(1.8, sz));
          }
          for (let k = 0; k < 6; k++) {
            cpuSpawnSeq += 1;
            const jx = Math.sin(cpuSpawnSeq * 3.1) * 0.2;
            const jz = Math.cos(cpuSpawnSeq * 5.7) * 0.2;
            spawnMacroParticle(
              sim,
              cpuPourKind,
              sx + jx,
              sy + (k % 2) * 0.08,
              sz + jz,
              jx * 1.5,
              -2.0,
              jz * 1.5,
            );
          }
        } else if (!st.fluidConfig.paused && st.fluidAutoPourKind !== 'none') {
          const faucetX =
            !isGlass && st.fluidPresetId === 'cascade-maze' ? -3.5 : 0;
          for (let k = 0; k < 5; k++) {
            cpuSpawnSeq += 1;
            const jx = Math.sin(cpuSpawnSeq * 2.9) * 0.18;
            const jz = Math.cos(cpuSpawnSeq * 4.3) * 0.18;
            spawnMacroParticle(
              sim,
              st.fluidAutoPourKind,
              faucetX + jx,
              5.8,
              jz,
              jx * 1.4,
              -2.2,
              jz * 1.4,
            );
          }
        }

        const stirImpulse: StirImpulse = {
          active: cpuPointerActive && (st.fluidTool === 'stir' || st.fluidTool === 'magnet'),
          mode: st.fluidTool === 'magnet' ? 'magnet' : 'stir',
          x: cpuCurHit.x,
          y: cpuCurHit.y,
          z: cpuCurHit.z,
          vx: cpuStirVel.x,
          vy: cpuStirVel.y,
          vz: cpuStirVel.z,
          radius: 1.0,
        };
        cpuStirVel.multiplyScalar(0.72);

        const activeObs = getObstaclesForPreset(
          st.fluidPresetId,
          st.fluidConfig.hasObstacle,
          isGlass,
        );
        syncCpuObstacles(st.fluidPresetId, st.fluidConfig.hasObstacle, isGlass);
        stepSandWaterSimulation(
          sim,
          { ...st.fluidConfig, isGlassMode: isGlass },
          1 / 60,
          stirImpulse,
          activeObs,
        );
        tankLine.visible = !isGlass;
        glassLine.visible = isGlass;

        particleMesh.count = sim.count;
        for (let i = 0; i < sim.count; i++) {
          const kind = sim.kinds[i]!;
          dummy.position.set(sim.px[i]!, sim.py[i]!, sim.pz[i]!);
          const rScale =
            kind === 0
              ? WATER_RADIUS * 1.28
              : kind === 1
                ? SAND_RADIUS * 1.02
                : kind === 2
                  ? OIL_RADIUS * 1.22
                  : FERRO_RADIUS * 1.08;
          dummy.scale.setScalar(rScale);
          dummy.updateMatrix();
          particleMesh.setMatrixAt(i, dummy.matrix);
          const col =
            kind === 0
              ? waterColor
              : kind === 1
                ? sandColors[i & 3]!
                : kind === 2
                  ? oilColor
                  : ferroColor;
          particleMesh.setColorAt(i, col);
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
        canvas.removeEventListener('pointerdown', onCpuDown, { capture: true });
        window.removeEventListener('pointermove', onCpuMove);
        window.removeEventListener('pointerup', onCpuUp);
        window.removeEventListener('resize', onCpuResize);
        resizeObserver?.disconnect();
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
      gpu.updateContainerMesh(gpuContainer, fluidPresetId, fluidConfig.hasObstacle);
      const data = generateGpuPresetParticles(
        fluidPresetId,
        isGlass,
        fluidTargetParticleCount,
      );
      gpu.uploadParticles(data.pos, data.vel, data.count);
      useLabStore.getState().setFluidStats({
        waterCount: gpu.waterCount,
        sandCount: gpu.sandCount,
        oilCount: gpu.oilCount,
        ferroCount: gpu.ferroCount,
        avgSandY: 0,
        avgWaterY: 0,
        kineticEnergy: 0,
      });
    } else if (backendMode === 'webgl2') {
      loadSandWaterPreset(
        cpuSimRef.current,
        fluidPresetId,
        fluidContainerMode === 'glass',
      );
      useLabStore.getState().setFluidStats(computeSandWaterStats(cpuSimRef.current));
    }
  }, [fluidPresetId, fluidContainerMode, fluidTargetParticleCount, fluidResetNonce, backendMode]);

  useEffect(() => {
    const gpu = gpuEngineRef.current;
    if (!gpu) return;
    const isGlass = fluidContainerMode === 'glass';
    gpu.updateContainerMesh(
      { ...DEFAULT_GLASS_CONTAINER, isGlassMode: isGlass },
      fluidPresetId,
      fluidConfig.hasObstacle,
    );
  }, [fluidConfig.hasObstacle, fluidPresetId, fluidContainerMode]);

  useEffect(() => {
    if (fluidClearNonce === 0) return;
    const gpu = gpuEngineRef.current;
    if (gpu) {
      gpu.clearParticles();
      useLabStore.getState().setFluidStats({
        waterCount: 0,
        sandCount: 0,
        oilCount: 0,
        ferroCount: 0,
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
                : fluidTool === 'pour-oil'
                  ? 'Pour Oil (click/drag)'
                  : fluidTool === 'pour-ferro'
                    ? 'Pour Magnetite (click/drag)'
                    : fluidTool === 'magnet'
                      ? 'Magnet (drag to pull Magnetite)'
                      : fluidTool === 'stir'
                        ? 'Stir / Push (drag)'
                        : 'Orbit Camera'}
            {fluidConfig.paused ? ' · PAUSED' : ''}
          </span>
        </div>

        <div className="viewport-hud-top-right">
          <span className="hud-pill hud-pill-mode">
            {fluidContainerMode === 'glass' ? '3D Glass' : 'Lab Tank'} · Density g/cm³: Oil{' '}
            {MATERIAL_DENSITY_G_CM3.oil} · Water {MATERIAL_DENSITY_G_CM3.water.toFixed(1)} · Sand{' '}
            {MATERIAL_DENSITY_G_CM3.sand} · Magnetite {MATERIAL_DENSITY_G_CM3.ferro}
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
