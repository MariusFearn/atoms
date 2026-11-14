import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getElementBySymbol } from '@matterlab/domain';
import { useLabStore } from '../state/useLabStore';

const MAX_ATOM_INSTANCES = 4096;
const MAX_BOND_INSTANCES = 8192;

interface ProjectedLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  selected: boolean;
}

interface BondRenderSegment {
  bondId: string;
  start: THREE.Vector3;
  end: THREE.Vector3;
  radius: number;
  colorHex: string;
}

function isWebGL2Available(): boolean {
  try {
    const testCanvas = document.createElement('canvas');
    return Boolean(testCanvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

function buildBondSegments(
  atoms: ReturnType<typeof useLabStore.getState>['molecule']['atoms'],
  bonds: ReturnType<typeof useLabStore.getState>['molecule']['bonds'],
  selectedBondId: string | null,
): BondRenderSegment[] {
  const byId = new Map(atoms.map((a) => [a.id, a]));
  const segments: BondRenderSegment[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const alt = new THREE.Vector3(0, 0, 1);

  for (const bond of bonds) {
    const a = byId.get(bond.atomA);
    const b = byId.get(bond.atomB);
    if (!a || !b) continue;

    const pA = new THREE.Vector3(...a.positionAngstrom);
    const pB = new THREE.Vector3(...b.positionAngstrom);
    const dir = new THREE.Vector3().subVectors(pB, pA);
    if (dir.lengthSq() < 1e-8) continue;
    dir.normalize();

    const refAxis = Math.abs(dir.dot(up)) > 0.9 ? alt : up;
    const perp = new THREE.Vector3().crossVectors(dir, refAxis).normalize();
    const isSelected = bond.id === selectedBondId;
    const baseColor = isSelected ? '#38bdf8' : '#94a3b8';

    if (bond.order === 1) {
      segments.push({
        bondId: bond.id,
        start: pA,
        end: pB,
        radius: isSelected ? 0.095 : 0.075,
        colorHex: baseColor,
      });
    } else if (bond.order === 2) {
      const offset = perp.clone().multiplyScalar(0.085);
      segments.push(
        {
          bondId: bond.id,
          start: pA.clone().add(offset),
          end: pB.clone().add(offset),
          radius: isSelected ? 0.068 : 0.052,
          colorHex: baseColor,
        },
        {
          bondId: bond.id,
          start: pA.clone().sub(offset),
          end: pB.clone().sub(offset),
          radius: isSelected ? 0.068 : 0.052,
          colorHex: baseColor,
        },
      );
    } else if (bond.order === 3) {
      const offset = perp.clone().multiplyScalar(0.11);
      segments.push(
        {
          bondId: bond.id,
          start: pA,
          end: pB,
          radius: isSelected ? 0.06 : 0.046,
          colorHex: baseColor,
        },
        {
          bondId: bond.id,
          start: pA.clone().add(offset),
          end: pB.clone().add(offset),
          radius: isSelected ? 0.06 : 0.046,
          colorHex: baseColor,
        },
        {
          bondId: bond.id,
          start: pA.clone().sub(offset),
          end: pB.clone().sub(offset),
          radius: isSelected ? 0.06 : 0.046,
          colorHex: baseColor,
        },
      );
    } else {
      // Aromatic: solid outer cylinder + segmented inner dashed-style indicator
      const offset = perp.clone().multiplyScalar(0.085);
      segments.push({
        bondId: bond.id,
        start: pA.clone().add(offset),
        end: pB.clone().add(offset),
        radius: isSelected ? 0.068 : 0.052,
        colorHex: baseColor,
      });
      const totalVec = new THREE.Vector3().subVectors(pB, pA);
      for (const [t0, t1] of [
        [0.1, 0.32],
        [0.39, 0.61],
        [0.68, 0.9],
      ] as const) {
        segments.push({
          bondId: bond.id,
          start: pA.clone().addScaledVector(totalVec, t0).sub(offset),
          end: pA.clone().addScaledVector(totalVec, t1).sub(offset),
          radius: isSelected ? 0.058 : 0.044,
          colorHex: isSelected ? '#38bdf8' : '#a78bfa',
        });
      }
    }
  }
  return segments;
}

export const LabSceneViewport: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [webgl2Supported] = useState<boolean>(() => isWebGL2Available());
  const [labels, setLabels] = useState<ProjectedLabel[]>([]);
  const [pixelPerAngstrom, setPixelPerAngstrom] = useState<number>(64);

  const molecule = useLabStore((s) => s.molecule);
  const workspaceTab = useLabStore((s) => s.workspaceTab);
  const activeResults = useLabStore((s) => s.activeResults);
  const activeJob = useLabStore((s) => s.activeJob);
  const experimentStartingMolecule = useLabStore((s) => s.experimentStartingMolecule);
  const playbackFrameIndex = useLabStore((s) => s.playbackFrameIndex);
  const activeTool = useLabStore((s) => s.activeTool);
  const activeElement = useLabStore((s) => s.activeElement);
  const selectedAtomIds = useLabStore((s) => s.selectedAtomIds);
  const selectedBondId = useLabStore((s) => s.selectedBondId);
  const pendingBondSourceAtomId = useLabStore((s) => s.pendingBondSourceAtomId);
  const hoveredAtomId = useLabStore((s) => s.hoveredAtomId);
  const representation = useLabStore((s) => s.representation);
  const colorPalette = useLabStore((s) => s.colorPalette);
  const showLabels = useLabStore((s) => s.showLabels);
  const showBonds = useLabStore((s) => s.showBonds);
  const showAxes = useLabStore((s) => s.showAxes);
  const showGrid = useLabStore((s) => s.showGrid);
  const lowEffects = useLabStore((s) => s.lowEffects);
  const cameraResetNonce = useLabStore((s) => s.cameraResetNonce);
  const cameraFitNonce = useLabStore((s) => s.cameraFitNonce);

  const isTrajectoryMode =
    workspaceTab === 'experiment' &&
    activeResults !== null &&
    activeResults.frames.length > 0;
  const activeFrame = isTrajectoryMode
    ? (activeResults.frames[playbackFrameIndex] ?? activeResults.frames[0])
    : undefined;

  const displayMolecule = (() => {
    if (!isTrajectoryMode || !activeFrame) {
      return molecule;
    }
    const baseMol = experimentStartingMolecule ?? molecule;
    const posById = new Map<string, [number, number, number]>();
    activeResults.atomIds.forEach((aid, idx) => {
      const coords = activeFrame.positionsAngstrom[idx];
      if (coords) {
        posById.set(aid, coords);
      }
    });
    return {
      ...baseMol,
      atoms: baseMol.atoms.map((a) => ({
        ...a,
        positionAngstrom: posById.get(a.id) ?? a.positionAngstrom,
      })),
    };
  })();

  const sceneDataRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    atomMesh: THREE.InstancedMesh;
    bondMesh: THREE.InstancedMesh;
    selectionGroup: THREE.Group;
    gridHelper: THREE.GridHelper;
    axesHelper: THREE.AxesHelper;
    atomIds: string[];
    bondSegmentIds: string[];
  } | null>(null);

  // Initialize Three.js WebGL2 scene once
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !webgl2Supported) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#090d16');

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 240);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200);
    camera.position.set(3.2, 2.4, 4.8);

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
    controls.minDistance = 1.2;
    controls.maxDistance = 60;

    // Three-point scientific laboratory lighting
    const hemiLight = new THREE.HemisphereLight('#dbeafe', '#1e293b', 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight('#ffffff', 1.45);
    keyLight.position.set(6, 9, 7);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#60a5fa', 0.55);
    rimLight.position.set(-7, -3, -6);
    scene.add(rimLight);

    // Subtle 1-Angstrom laboratory grid & axes
    const gridHelper = new THREE.GridHelper(20, 20, '#334155', '#172033');
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(1.5);
    scene.add(axesHelper);

    // Instanced atoms
    const sphereGeo = new THREE.SphereGeometry(1, 32, 24);
    const atomMat = new THREE.MeshStandardMaterial({
      roughness: 0.34,
      metalness: 0.08,
    });
    const atomMesh = new THREE.InstancedMesh(sphereGeo, atomMat, MAX_ATOM_INSTANCES);
    atomMesh.count = 0;
    atomMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(atomMesh);

    // Instanced bonds
    const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 16, 1);
    const bondMat = new THREE.MeshStandardMaterial({
      roughness: 0.45,
      metalness: 0.12,
    });
    const bondMesh = new THREE.InstancedMesh(cylGeo, bondMat, MAX_BOND_INSTANCES);
    bondMesh.count = 0;
    bondMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(bondMesh);

    const selectionGroup = new THREE.Group();
    scene.add(selectionGroup);

    sceneDataRef.current = {
      scene,
      camera,
      renderer,
      controls,
      atomMesh,
      bondMesh,
      selectionGroup,
      gridHelper,
      axesHelper,
      atomIds: [],
      bondSegmentIds: [],
    };

    // Raycasting & pointer interaction
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const dragPlane = new THREE.Plane();
    const dragIntersect = new THREE.Vector3();
    const dragOffset = new THREE.Vector3();
    let draggingAtomId: string | null = null;
    let pointerDownPos: { x: number; y: number } | null = null;
    let didMoveAtom = false;

    const toNdc = (clientX: number, clientY: number): THREE.Vector2 => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      return pointerNdc;
    };

    const onPointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      const ctx = sceneDataRef.current;
      if (!ctx) return;

      pointerDownPos = { x: ev.clientX, y: ev.clientY };
      didMoveAtom = false;
      raycaster.setFromCamera(toNdc(ev.clientX, ev.clientY), ctx.camera);

      const store = useLabStore.getState();
      if (store.workspaceTab === 'molecule' && store.activeTool === 'select') {
        const hits = raycaster.intersectObject(ctx.atomMesh, false);
        const firstHit = hits[0];
        if (firstHit && firstHit.instanceId !== undefined) {
          const hitAtomId = ctx.atomIds[firstHit.instanceId];
          const hitAtom = store.molecule.atoms.find((a) => a.id === hitAtomId);
          if (hitAtomId && hitAtom && !ev.shiftKey) {
            draggingAtomId = hitAtomId;
            controls.enabled = false;
            const camDir = new THREE.Vector3();
            ctx.camera.getWorldDirection(camDir);
            const atomPos = new THREE.Vector3(...hitAtom.positionAngstrom);
            dragPlane.setFromNormalAndCoplanarPoint(camDir, atomPos);
            if (raycaster.ray.intersectPlane(dragPlane, dragIntersect)) {
              dragOffset.subVectors(atomPos, dragIntersect);
            } else {
              dragOffset.set(0, 0, 0);
            }
          }
        }
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      const ctx = sceneDataRef.current;
      if (!ctx) return;
      raycaster.setFromCamera(toNdc(ev.clientX, ev.clientY), ctx.camera);
      const store = useLabStore.getState();

      if (draggingAtomId) {
        if (raycaster.ray.intersectPlane(dragPlane, dragIntersect)) {
          if (!didMoveAtom) {
            store.beginAtomMoveGesture();
            didMoveAtom = true;
          }
          const nextPos = dragIntersect.clone().add(dragOffset);
          store.moveAtom(
            draggingAtomId,
            [
              Number(nextPos.x.toFixed(4)),
              Number(nextPos.y.toFixed(4)),
              Number(nextPos.z.toFixed(4)),
            ],
            false,
          );
        }
        return;
      }

      const atomHits = raycaster.intersectObject(ctx.atomMesh, false);
      const hitAtomId =
        atomHits[0]?.instanceId !== undefined
          ? (ctx.atomIds[atomHits[0].instanceId] ?? null)
          : null;
      if (store.hoveredAtomId !== hitAtomId) {
        store.setHoveredAtomId(hitAtomId);
      }
      renderer.domElement.style.cursor = hitAtomId
        ? store.activeTool === 'select'
          ? 'grab'
          : 'pointer'
        : store.activeTool === 'place-atom'
          ? 'crosshair'
          : 'default';
    };

    const onPointerUp = (ev: PointerEvent) => {
      const ctx = sceneDataRef.current;
      if (!ctx) return;

      if (draggingAtomId) {
        draggingAtomId = null;
        controls.enabled = true;
      }

      if (!pointerDownPos) return;
      const distMoved = Math.hypot(
        ev.clientX - pointerDownPos.x,
        ev.clientY - pointerDownPos.y,
      );
      pointerDownPos = null;
      if (distMoved > 5 || didMoveAtom) {
        return;
      }

      const store = useLabStore.getState();
      raycaster.setFromCamera(toNdc(ev.clientX, ev.clientY), ctx.camera);

      const atomHits = raycaster.intersectObject(ctx.atomMesh, false);
      const hitAtomId =
        atomHits[0]?.instanceId !== undefined
          ? ctx.atomIds[atomHits[0].instanceId]
          : undefined;

      if (hitAtomId && store.workspaceTab === 'molecule') {
        store.handleAtomClickForTool(hitAtomId, ev.shiftKey);
        return;
      }

      if (store.workspaceTab === 'molecule' && store.activeTool === 'place-atom') {
        const xzPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const target = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(xzPlane, target)) {
          store.addAtom(store.activeElement, [
            Number(target.x.toFixed(3)),
            0,
            Number(target.z.toFixed(3)),
          ]);
        }
        return;
      }

      if (store.showBonds) {
        const bondHits = raycaster.intersectObject(ctx.bondMesh, false);
        const hitBondId =
          bondHits[0]?.instanceId !== undefined
            ? ctx.bondSegmentIds[bondHits[0].instanceId]
            : undefined;
        if (hitBondId) {
          store.selectBond(hitBondId);
          return;
        }
      }

      store.selectAtom(null);
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(entry.contentRect.width, 320);
        const h = Math.max(entry.contentRect.height, 240);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    resizeObserver.observe(container);

    let rafId = 0;
    let frameCounter = 0;
    const tempVec = new THREE.Vector3();
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);

      frameCounter += 1;
      if (frameCounter % 2 === 0) {
        const state = useLabStore.getState();
        const rect = renderer.domElement.getBoundingClientRect();

        // Update 1-Angstrom scale bar pixel width at OrbitControls target
        p0.copy(controls.target);
        p1.copy(controls.target).add(
          new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion),
        );
        p0.project(camera);
        p1.project(camera);
        const pxPerA = Math.abs(((p1.x - p0.x) * rect.width) / 2);
        setPixelPerAngstrom(Math.max(16, Math.min(240, Math.round(pxPerA))));

        if (state.showLabels) {
          const nextLabels: ProjectedLabel[] = [];
          const selectedSet = new Set(state.selectedAtomIds);
          const lblResults =
            state.workspaceTab === 'experiment' ? state.activeResults : null;
          const lblFrame = lblResults?.frames[state.playbackFrameIndex];
          const lblBaseMol =
            lblResults && lblFrame
              ? (state.experimentStartingMolecule ?? state.molecule)
              : state.molecule;
          const lblPosById = new Map<string, [number, number, number]>();
          if (lblResults && lblFrame) {
            lblResults.atomIds.forEach((aid, idx) => {
              const p = lblFrame.positionsAngstrom[idx];
              if (p) lblPosById.set(aid, p);
            });
          }

          for (const atom of lblBaseMol.atoms) {
            const pos = lblPosById.get(atom.id) ?? atom.positionAngstrom;
            tempVec.set(...pos);
            tempVec.project(camera);
            if (tempVec.z >= -1 && tempVec.z <= 1) {
              const x = (tempVec.x * 0.5 + 0.5) * rect.width;
              const y = (-tempVec.y * 0.5 + 0.5) * rect.height;
              if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
                nextLabels.push({
                  id: atom.id,
                  text: `${atom.id}`,
                  x,
                  y,
                  selected: selectedSet.has(atom.id),
                });
              }
            }
          }
          setLabels(nextLabels);
        } else {
          setLabels((prev) => (prev.length > 0 ? [] : prev));
        }
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      sphereGeo.dispose();
      atomMat.dispose();
      cylGeo.dispose();
      bondMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      sceneDataRef.current = null;
    };
  }, [webgl2Supported]);

  // Update pixel ratio / antialias quality setting when lowEffects toggles
  useEffect(() => {
    const ctx = sceneDataRef.current;
    if (!ctx) return;
    ctx.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, lowEffects ? 1 : 2),
    );
  }, [lowEffects]);

  // Synchronize grid & axes visibility
  useEffect(() => {
    const ctx = sceneDataRef.current;
    if (!ctx) return;
    ctx.gridHelper.visible = showGrid;
    ctx.axesHelper.visible = showAxes;
  }, [showGrid, showAxes]);

  // Synchronize InstancedMesh atoms, bonds, and non-color selection brackets
  useEffect(() => {
    const ctx = sceneDataRef.current;
    if (!ctx) return;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const atoms = displayMolecule.atoms.slice(0, MAX_ATOM_INSTANCES);
    ctx.atomIds = atoms.map((a) => a.id);
    ctx.atomMesh.count = atoms.length;

    const selectedSet = new Set(selectedAtomIds);

    atoms.forEach((atom, index) => {
      const el = getElementBySymbol(atom.element);
      const radius =
        representation === 'space-filling'
          ? (el?.vdwRadiusAngstrom ?? 1.4)
          : Math.max(0.22, (el?.covalentRadiusAngstrom ?? 0.7) * 0.55);

      dummy.position.set(...atom.positionAngstrom);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(radius);
      dummy.updateMatrix();
      ctx.atomMesh.setMatrixAt(index, dummy.matrix);

      const hex =
        colorPalette === 'colorblind'
          ? (el?.colorblindColorHex ?? '#94a3b8')
          : (el?.cpkColorHex ?? '#94a3b8');
      color.set(hex);
      if (hoveredAtomId === atom.id && !selectedSet.has(atom.id)) {
        color.offsetHSL(0, 0, 0.12);
      }
      ctx.atomMesh.setColorAt(index, color);
    });

    ctx.atomMesh.instanceMatrix.needsUpdate = true;
    if (ctx.atomMesh.instanceColor) {
      ctx.atomMesh.instanceColor.needsUpdate = true;
    }
    ctx.atomMesh.computeBoundingSphere();

    // Update bonds
    if (!showBonds || representation === 'space-filling') {
      ctx.bondMesh.count = 0;
      ctx.bondSegmentIds = [];
    } else {
      const segments = buildBondSegments(displayMolecule.atoms, displayMolecule.bonds, selectedBondId)
        .slice(0, MAX_BOND_INSTANCES);
      ctx.bondSegmentIds = segments.map((s) => s.bondId);
      ctx.bondMesh.count = segments.length;

      const upVec = new THREE.Vector3(0, 1, 0);
      const dirVec = new THREE.Vector3();
      const midVec = new THREE.Vector3();
      const quat = new THREE.Quaternion();

      segments.forEach((seg, idx) => {
        dirVec.subVectors(seg.end, seg.start);
        const length = dirVec.length();
        midVec.addVectors(seg.start, seg.end).multiplyScalar(0.5);
        quat.setFromUnitVectors(upVec, dirVec.normalize());

        dummy.position.copy(midVec);
        dummy.quaternion.copy(quat);
        dummy.scale.set(seg.radius, length, seg.radius);
        dummy.updateMatrix();
        ctx.bondMesh.setMatrixAt(idx, dummy.matrix);
        ctx.bondMesh.setColorAt(idx, color.set(seg.colorHex));
      });

      ctx.bondMesh.instanceMatrix.needsUpdate = true;
      if (ctx.bondMesh.instanceColor) {
        ctx.bondMesh.instanceColor.needsUpdate = true;
      }
      ctx.bondMesh.computeBoundingSphere();
    }

    // Clear and rebuild selection halos (geometric non-color cues)
    while (ctx.selectionGroup.children.length > 0) {
      const child = ctx.selectionGroup.children.pop()!;
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }

    for (const atom of atoms) {
      const isSelected = selectedSet.has(atom.id);
      const isBondSource = pendingBondSourceAtomId === atom.id;
      if (!isSelected && !isBondSource) continue;

      const el = getElementBySymbol(atom.element);
      const baseRadius =
        representation === 'space-filling'
          ? (el?.vdwRadiusAngstrom ?? 1.4)
          : Math.max(0.22, (el?.covalentRadiusAngstrom ?? 0.7) * 0.55);

      const ringGeo = new THREE.RingGeometry(baseRadius + 0.08, baseRadius + 0.14, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: isBondSource ? '#22d3ee' : '#facc15',
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(...atom.positionAngstrom);
      ring.lookAt(ctx.camera.position);
      ctx.selectionGroup.add(ring);

      const cageGeo = new THREE.OctahedronGeometry(baseRadius + 0.14, 0);
      const cageMat = new THREE.MeshBasicMaterial({
        color: isBondSource ? '#22d3ee' : '#facc15',
        wireframe: true,
        transparent: true,
        opacity: 0.55,
      });
      const cage = new THREE.Mesh(cageGeo, cageMat);
      cage.position.set(...atom.positionAngstrom);
      ctx.selectionGroup.add(cage);
    }
  }, [
    displayMolecule,
    selectedAtomIds,
    selectedBondId,
    pendingBondSourceAtomId,
    hoveredAtomId,
    representation,
    colorPalette,
    showBonds,
  ]);

  // Camera reset
  useEffect(() => {
    const ctx = sceneDataRef.current;
    if (!ctx || cameraResetNonce === 0) return;
    ctx.camera.position.set(3.2, 2.4, 4.8);
    ctx.controls.target.set(0, 0, 0);
    ctx.controls.update();
  }, [cameraResetNonce]);

  // Camera fit-to-molecule
  useEffect(() => {
    const ctx = sceneDataRef.current;
    if (!ctx || cameraFitNonce === 0) return;
    if (molecule.atoms.length === 0) {
      ctx.camera.position.set(3.2, 2.4, 4.8);
      ctx.controls.target.set(0, 0, 0);
      ctx.controls.update();
      return;
    }

    const box = new THREE.Box3();
    for (const atom of molecule.atoms) {
      box.expandByPoint(new THREE.Vector3(...atom.positionAngstrom));
    }
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1.8);
    const dist = maxDim * 2.1 + 1.5;

    ctx.controls.target.copy(center);
    ctx.camera.position.set(center.x + dist * 0.55, center.y + dist * 0.4, center.z + dist * 0.8);
    ctx.controls.update();
  }, [cameraFitNonce, molecule.atoms]);

  if (!webgl2Supported) {
    return (
      <div className="viewport-fallback" role="region" aria-label="3D Viewport Unavailable">
        <div className="viewport-fallback-card">
          <h2>WebGL2 3D Viewport Unavailable</h2>
          <p>
            MatterLab requires a browser and graphics environment with WebGL2 enabled to render
            the interactive 3D laboratory scene.
          </p>
          <p className="muted">
            Keyboard editing, object tree selection, numeric coordinates, and JSON project
            save/open remain fully operational in the side panels.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="viewport-root" role="region" aria-label="3D Molecular Laboratory Viewport">
      <div ref={containerRef} className="viewport-canvas-host" />

      {showLabels && labels.length > 0 && (
        <div className="viewport-labels-layer" aria-hidden="true">
          {labels.map((lbl) => (
            <span
              key={lbl.id}
              className={`atom-floating-label ${lbl.selected ? 'is-selected' : ''}`}
              style={{ transform: `translate(${lbl.x}px, ${lbl.y - 18}px)` }}
            >
              {lbl.text}
            </span>
          ))}
        </div>
      )}

      <div className="viewport-hud-top">
        <div className="viewport-hud-top-left">
          <span className="hud-pill hud-pill-mode">
            {isTrajectoryMode && activeFrame
              ? `Trajectory Playback · Frame ${playbackFrameIndex + 1}/${activeResults.frames.length} · t = ${activeFrame.simulationTimePs.toFixed(3)} ps`
              : workspaceTab === 'experiment' && activeJob && (activeJob.status === 'running' || activeJob.status === 'queued')
                ? `OpenMM Simulation ${activeJob.status} (${Math.round(activeJob.progressFraction * 100)}%)`
                : 'Static Structure Mode · No Active Simulation'}
          </span>
          {workspaceTab === 'molecule' && activeTool === 'place-atom' && (
            <span className="hud-pill hud-pill-tool">
              Click grid plane (Y = 0 Å) to place {activeElement}
            </span>
          )}
          {workspaceTab === 'molecule' && activeTool === 'bond' && (
            <span className="hud-pill hud-pill-tool">
              {pendingBondSourceAtomId
                ? `Select second atom to bond with ${pendingBondSourceAtomId}`
                : 'Select first atom to create bond'}
            </span>
          )}
        </div>

        <div className="viewport-hud-top-right">
          <span
            className="hud-pill hud-pill-warning"
            title="Atom spheres and bond cylinders are scaled for visual clarity"
          >
            Visual representation — not to scale (
            {representation === 'ball-and-stick'
              ? 'Ball-and-stick'
              : 'Space-filling / Bondi–Mantina vdW'}
            )
          </span>
        </div>
      </div>

      {/* Bottom-left Scale Bar & Camera Hint */}
      <div className="viewport-hud-bottom-left">
        <div className="scale-bar-box" aria-label="1 Angstrom coordinate reference scale">
          <div className="scale-bar-line" style={{ width: `${pixelPerAngstrom}px` }} />
          <span className="scale-bar-label">1.0 Å (coordinate grid)</span>
        </div>
        <div className="camera-hint">
          Drag: Orbit · Right-drag: Pan · Scroll: Zoom · Drag atom in Select mode to move
        </div>
      </div>
    </div>
  );
};
