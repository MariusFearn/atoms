/// <reference types="@webgpu/types" />
import {
  MATERIAL_DENSITY_G_CM3,
  type MacroParticleKind,
  type ObstacleBox3D,
  type SandWaterConfig,
  type SandWaterPresetId,
  getObstaclesForPreset,
} from '@matterlab/domain';

export const MAX_GPU_PARTICLES = 65536;
export const MAX_GPU_OBSTACLES = 24;

// Grid covering [-4.6, 4.6] x [-0.1, 7.1] x [-2.3, 2.3] at cell = 0.18
const GRID_NX = 52;
const GRID_NY = 40;
const GRID_NZ = 26;
const GRID_TOTAL_CELLS = GRID_NX * GRID_NY * GRID_NZ; // 54,080 cells
const CELL_SIZE = 0.18;
const GRID_MIN_X = -4.6;
const GRID_MIN_Y = -0.1;
const GRID_MIN_Z = -2.34;

export const GPU_WATER_RADIUS = 0.052;
export const GPU_SAND_RADIUS = 0.048;
export const GPU_OIL_RADIUS = 0.053;
export const GPU_FERRO_RADIUS = 0.048;

export interface GpuContainerMode {
  isGlassMode: boolean;
  glassRBottom: number;
  glassRTop: number;
  tankHalfX: number;
  tankMaxY: number;
  tankHalfZ: number;
}

export const DEFAULT_GLASS_CONTAINER: GpuContainerMode = {
  isGlassMode: true,
  glassRBottom: 2.05,
  glassRTop: 2.75,
  tankHalfX: 4.5,
  tankMaxY: 6.6,
  tankHalfZ: 2.1,
};

function wgslFloat(v: number): string {
  return Number.isInteger(v) ? `${v}.0` : `${v}`;
}

const COMPUTE_WGSL = /* wgsl */ `
struct SimParams {
  uCounts: vec4<u32>,      // x=activeCount, y=maxParticles, z=totalGridCells, w=obstacleCount
  uGridDims: vec4<u32>,    // x=nx, y=ny, z=nz, w=isGlassMode
  uGridMin: vec4<f32>,     // xyz=gridMin, w=cellSize
  uPhysics1: vec4<f32>,    // x=dt, y=gravityX, z=gravityY, w=viscosity
  uPhysics2: vec4<f32>,    // x=sandFriction, y=stiffness, z=h, w=restDensity
  uRadii: vec4<f32>,       // x=waterR, y=sandR, z=glassRBottom, w=glassRTop
  uStirPos: vec4<f32>,     // xyz=stirPos, w=stirRadius
  uStirVel: vec4<f32>,     // xyz=stirVel, w=mode (0=none, 1=stir, 2=shake, 3=magnet)
  uCameraRight: vec4<f32>, // xyz=camRight, w=tankMaxY
  uCameraUp: vec4<f32>,    // xyz=camUp, w=tankHalfX
  uCameraPos: vec4<f32>,   // xyz=camPos, w=tankHalfZ
  uExtra: vec4<f32>,       // x=gravityZ, y=oilR, z=ferroR, w=0
  uViewProj: mat4x4<f32>,
};

struct ObstacleBox {
  centerAndAngle: vec4<f32>, // xyz=center, w=angleZ
  halfSizes: vec4<f32>,      // xyz=halfExtents, w=0
};

@group(0) @binding(0) var<uniform> params: SimParams;
@group(0) @binding(1) var<storage, read> posIn: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> velIn: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> posOut: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> velOut: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> densityBuf: array<vec2<f32>>;
@group(0) @binding(6) var<storage, read_write> cellHead: array<atomic<i32>>;
@group(0) @binding(7) var<storage, read_write> cellNext: array<i32>;
@group(0) @binding(8) var<storage, read> obstacles: array<ObstacleBox>;

fn particleMass(k: f32) -> f32 {
  if (k < 0.5) { return ${wgslFloat(MATERIAL_DENSITY_G_CM3.water)}; } // water
  if (k < 1.5) { return ${wgslFloat(MATERIAL_DENSITY_G_CM3.sand)}; } // quartz sand
  if (k < 2.5) { return ${wgslFloat(MATERIAL_DENSITY_G_CM3.oil)}; } // oil (floats above water)
  return ${wgslFloat(MATERIAL_DENSITY_G_CM3.ferro)}; // magnetite grains
}

fn particleRadius(k: f32) -> f32 {
  if (k < 0.5) { return params.uRadii.x; }
  if (k < 1.5) { return params.uRadii.y; }
  if (k < 2.5) { return params.uExtra.y; }
  return params.uExtra.z;
}

fn isFluidKind(k: f32) -> bool {
  return k < 0.5 || (k > 1.5 && k < 2.5);
}

fn coordToCell(p: vec3<f32>) -> vec3<i32> {
  let invCell = 1.0 / params.uGridMin.w;
  let cx = clamp(i32(floor((p.x - params.uGridMin.x) * invCell)), 0, i32(params.uGridDims.x) - 1);
  let cy = clamp(i32(floor((p.y - params.uGridMin.y) * invCell)), 0, i32(params.uGridDims.y) - 1);
  let cz = clamp(i32(floor((p.z - params.uGridMin.z) * invCell)), 0, i32(params.uGridDims.z) - 1);
  return vec3<i32>(cx, cy, cz);
}

fn cellIndex(c: vec3<i32>) -> u32 {
  return u32((c.y * i32(params.uGridDims.z) + c.z) * i32(params.uGridDims.x) + c.x);
}

@compute @workgroup_size(128)
fn clearGrid(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.uCounts.z) { return; }
  atomicStore(&cellHead[idx], -1);
}

@compute @workgroup_size(128)
fn buildGrid(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.uCounts.x) { return; }
  let c = coordToCell(posIn[i].xyz);
  let cIdx = cellIndex(c);
  let prev = atomicExchange(&cellHead[cIdx], i32(i));
  cellNext[i] = prev;
}

@compute @workgroup_size(128)
fn computeDensity(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.uCounts.x) { return; }
  let pInfo = posIn[i];
  if (!isFluidKind(pInfo.w)) {
    densityBuf[i] = vec2<f32>(params.uPhysics2.w, 0.0);
    return;
  }

  let p = pInfo.xyz;
  let h = params.uPhysics2.z;
  let h2 = h * h;
  let poly6 = 7898114.0;
  let c0 = coordToCell(p);
  let nxMax = i32(params.uGridDims.x) - 1;
  let nyMax = i32(params.uGridDims.y) - 1;
  let nzMax = i32(params.uGridDims.z) - 1;

  var rho: f32 = 0.0;
  for (var cy = max(0, c0.y - 1); cy <= min(nyMax, c0.y + 1); cy = cy + 1) {
    for (var cz = max(0, c0.z - 1); cz <= min(nzMax, c0.z + 1); cz = cz + 1) {
      for (var cx = max(0, c0.x - 1); cx <= min(nxMax, c0.x + 1); cx = cx + 1) {
        var j = atomicLoad(&cellHead[cellIndex(vec3<i32>(cx, cy, cz))]);
        var iter: i32 = 0;
        while (j != -1 && iter < 48) {
          let pj = posIn[u32(j)];
          let d = p - pj.xyz;
          let r2 = dot(d, d);
          if (r2 < h2) {
            let diff = h2 - r2;
            rho = rho + particleMass(pj.w) * poly6 * diff * diff * diff;
          }
          j = cellNext[u32(j)];
          iter = iter + 1;
        }
      }
    }
  }

  let targetScale = select(1.0, ${wgslFloat(MATERIAL_DENSITY_G_CM3.oil)}, pInfo.w > 1.5);
  let restRho = params.uPhysics2.w * targetScale;
  let clampedRho = max(restRho * 0.35, rho);
  let gasK = 0.22 * params.uPhysics2.y;
  let press = gasK * max(0.0, clampedRho - restRho);
  densityBuf[i] = vec2<f32>(clampedRho, press);
}

fn hashFloat(n: u32) -> f32 {
  var x = n;
  x = (x ^ 61u) ^ (x >> 16u);
  x = x + (x << 3u);
  x = x ^ (x >> 4u);
  x = x * 0x27d4eb2du;
  x = x ^ (x >> 15u);
  return f32(x & 0xffffu) / 65535.0 - 0.5;
}

@compute @workgroup_size(128)
fn integrateForces(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.uCounts.x) { return; }

  let pInfo = posIn[i];
  let vInfo = velIn[i];
  let pi = pInfo.xyz;
  var vi = vInfo.xyz;
  let kindI = pInfo.w; // 0=water, 1=sand, 2=oil, 3=ferro
  let fluidI = isFluidKind(kindI);
  let massI = particleMass(kindI);
  let radI = particleRadius(kindI);

  let h = params.uPhysics2.z;
  let h2 = h * h;
  let spikyCoeff = 421072.7;
  let viscCoeff = 421072.7;
  let pressI = densityBuf[i].y;
  let viscMu = 0.008 + params.uPhysics1.w * 0.095;
  let sandKn = 1750.0 * params.uPhysics2.y;
  let sandCn = 24.0;
  let sandMu = params.uPhysics2.x;

  var force = vec3<f32>(
    params.uPhysics1.y * massI,
    params.uPhysics1.z * massI,
    params.uExtra.x * massI,
  );

  let c0 = coordToCell(pi);
  let nxMax = i32(params.uGridDims.x) - 1;
  let nyMax = i32(params.uGridDims.y) - 1;
  let nzMax = i32(params.uGridDims.z) - 1;

  for (var cy = max(0, c0.y - 1); cy <= min(nyMax, c0.y + 1); cy = cy + 1) {
    for (var cz = max(0, c0.z - 1); cz <= min(nzMax, c0.z + 1); cz = cz + 1) {
      for (var cx = max(0, c0.x - 1); cx <= min(nxMax, c0.x + 1); cx = cx + 1) {
        var j = atomicLoad(&cellHead[cellIndex(vec3<i32>(cx, cy, cz))]);
        var iter: i32 = 0;
        while (j != -1 && iter < 48) {
          let uj = u32(j);
          if (uj != i) {
            let pjInfo = posIn[uj];
            let d = pi - pjInfo.xyz;
            let r2 = dot(d, d);
            if (r2 < h2 && r2 > 1e-10) {
              let r = sqrt(r2);
              let n = d / r;
              let kindJ = pjInfo.w;
              let fluidJ = isFluidKind(kindJ);
              let radJ = particleRadius(kindJ);
              let minDist = radI + radJ;
              let vj = velIn[uj].xyz;

              if (fluidI && fluidJ) {
                let hMinusR = h - r;
                let rhoJ = max(180.0, densityBuf[uj].x);
                let pAvg = 0.5 * (pressI + densityBuf[uj].y);
                let fPress = (spikyCoeff * pAvg * hMinusR * hMinusR) / rhoJ;
                let viscBoost = select(1.0, 1.55, kindI > 1.5 || kindJ > 1.5);
                let fViscScale = (viscMu * viscBoost * viscCoeff * hMinusR) / rhoJ;
                let immiscible = select(0.0, 65.0 * hMinusR, abs(kindI - kindJ) > 0.5);

                force = force + (fPress + immiscible) * n + fViscScale * (vj - vi);

                if (r < minDist * 0.88) {
                  let pen = minDist * 0.88 - r;
                  force = force + (180.0 * pen) * n;
                }
              } else if (!fluidI && !fluidJ) {
                if (r < minDist) {
                  let overlap = minDist - r;
                  let rv = vi - vj;
                  let vn = dot(rv, n);
                  let fNorm = max(0.0, sandKn * overlap - sandCn * vn);
                  let tv = rv - vn * n;
                  let tMag = length(tv);
                  var fric = vec3<f32>(0.0);
                  if (tMag > 1e-5) {
                    let maxFric = sandMu * fNorm;
                    fric = (min(maxFric, tMag * 28.0) / tMag) * tv;
                  }
                  force = force + fNorm * n - fric;
                }
              } else {
                if (r < minDist * 1.2) {
                  let overlap = max(0.0, minDist - r);
                  let rv = vi - vj;
                  let vn = dot(rv, n);
                  let fNorm = max(0.0, 260.0 * overlap - 7.5 * vn);
                  let drag = 5.5 + params.uPhysics1.w * 7.5;
                  force = force + fNorm * n - drag * rv;
                }
              }
            }
          }
          j = cellNext[uj];
          iter = iter + 1;
        }
      }
    }
  }

  // Interactive stir, shake, or magnet attraction (ferrofluid only!)
  if (params.uStirVel.w > 2.5) {
    if (kindI > 2.5) {
      let md = params.uStirPos.xyz - pi;
      let mDist = length(md);
      if (mDist < params.uStirPos.w * 4.2 && mDist > 0.05) {
        let pull = 280.0 / (0.12 + mDist * mDist);
        force = force + (md / mDist) * pull - vi * 4.0;
      }
    }
  } else if (params.uStirVel.w > 1.5) {
    vi = vi + vec3<f32>(
      hashFloat(i * 3u + 1u) * 8.0,
      4.5 + abs(hashFloat(i * 7u + 2u)) * 5.0,
      hashFloat(i * 11u + 3u) * 8.0,
    );
  } else if (params.uStirVel.w > 0.5) {
    let sd = pi - params.uStirPos.xyz;
    let sDist = length(sd);
    if (sDist < params.uStirPos.w) {
      let w = 1.0 - sDist / params.uStirPos.w;
      force = force + (params.uStirVel.xyz - vi) * 32.0 * w * massI;
    }
  }

  let dt = params.uPhysics1.x;
  vi = vi + (force / massI) * dt;
  let speed = length(vi);
  if (speed > 18.0) {
    vi = vi * (18.0 / speed);
  }

  var np = pi + vi * dt;
  let bounce = select(0.12, 0.22, fluidI);
  let wallFric = select(max(0.45, 1.0 - sandMu * 0.5), 0.992, fluidI);
  let maxY = params.uCameraRight.w;

  if (np.y < radI) {
    np.y = radI;
    if (vi.y < 0.0) { vi.y = -vi.y * bounce; }
    vi.x = vi.x * wallFric;
    vi.z = vi.z * wallFric;
  } else if (np.y > maxY - radI) {
    np.y = maxY - radI;
    if (vi.y > 0.0) { vi.y = -vi.y * bounce; }
  }

  if (params.uGridDims.w == 1u) {
    let t = clamp(np.y / maxY, 0.0, 1.0);
    let rGlass = mix(params.uRadii.z, params.uRadii.w, t) - radI;
    let radXZ = sqrt(np.x * np.x + np.z * np.z);
    if (radXZ > rGlass && radXZ > 1e-6) {
      let nxz = vec2<f32>(np.x / radXZ, np.z / radXZ);
      np.x = nxz.x * rGlass;
      np.z = nxz.y * rGlass;
      let vr = vi.x * nxz.x + vi.z * nxz.y;
      if (vr > 0.0) {
        vi.x = vi.x - (1.0 + bounce) * vr * nxz.x;
        vi.z = vi.z - (1.0 + bounce) * vr * nxz.y;
      }
      vi.y = vi.y * wallFric;
    }
  } else {
    let hx = params.uCameraUp.w - radI;
    let hz = params.uCameraPos.w - radI;
    if (np.x < -hx) {
      np.x = -hx;
      if (vi.x < 0.0) { vi.x = -vi.x * bounce; }
    } else if (np.x > hx) {
      np.x = hx;
      if (vi.x > 0.0) { vi.x = -vi.x * bounce; }
    }
    if (np.z < -hz) {
      np.z = -hz;
      if (vi.z < 0.0) { vi.z = -vi.z * bounce; }
    } else if (np.z > hz) {
      np.z = hz;
      if (vi.z > 0.0) { vi.z = -vi.z * bounce; }
    }

    // 3D Maze / Funnel / Peg Obstacles (up to 24 tilted boxes)
    let obsCount = min(params.uCounts.w, 24u);
    for (var oi: u32 = 0u; oi < obsCount; oi = oi + 1u) {
      let ob = obstacles[oi];
      let ang = ob.centerAndAngle.w;
      let cosA = cos(ang);
      let sinA = sin(ang);
      let dx = np.x - ob.centerAndAngle.x;
      let dy = np.y - ob.centerAndAngle.y;
      let lx = dx * cosA + dy * sinA;
      let ly = -dx * sinA + dy * cosA;
      let lz = np.z - ob.centerAndAngle.z;
      let ex = ob.halfSizes.x + radI;
      let ey = ob.halfSizes.y + radI;
      let ez = ob.halfSizes.z + radI;
      if (abs(lx) < ex && abs(ly) < ey && abs(lz) < ez) {
        let pX = ex - abs(lx);
        let pY = ey - abs(ly);
        let pZ = ez - abs(lz);
        let lvx = vi.x * cosA + vi.y * sinA;
        let lvy = -vi.x * sinA + vi.y * cosA;
        var nlx = lx;
        var nly = ly;
        var nlvx = lvx;
        var nlvy = lvy;
        if (pY <= pX && pY <= pZ) {
          nly = select(-ey, ey, ly >= 0.0);
          if ((ly >= 0.0 && lvy < 0.0) || (ly < 0.0 && lvy > 0.0)) {
            nlvy = -lvy * bounce;
          }
          nlvx = nlvx * wallFric;
          vi.z = vi.z * wallFric;
        } else if (pX <= pZ) {
          nlx = select(-ex, ex, lx >= 0.0);
          if ((lx >= 0.0 && lvx < 0.0) || (lx < 0.0 && lvx > 0.0)) {
            nlvx = -lvx * bounce;
          }
        } else {
          np.z = ob.centerAndAngle.z + select(-ez, ez, lz >= 0.0);
          if ((lz >= 0.0 && vi.z < 0.0) || (lz < 0.0 && vi.z > 0.0)) {
            vi.z = -vi.z * bounce;
          }
        }
        np.x = ob.centerAndAngle.x + nlx * cosA - nly * sinA;
        np.y = ob.centerAndAngle.y + nlx * sinA + nly * cosA;
        vi.x = nlvx * cosA - nlvy * sinA;
        vi.y = nlvx * sinA + nlvy * cosA;
      }
    }
  }

  posOut[i] = vec4<f32>(np, kindI);
  velOut[i] = vec4<f32>(vi, vInfo.w);
}
`;

const RENDER_PARTICLES_WGSL = /* wgsl */ `
struct SimParams {
  uCounts: vec4<u32>,
  uGridDims: vec4<u32>,
  uGridMin: vec4<f32>,
  uPhysics1: vec4<f32>,
  uPhysics2: vec4<f32>,
  uRadii: vec4<f32>,
  uStirPos: vec4<f32>,
  uStirVel: vec4<f32>,
  uCameraRight: vec4<f32>,
  uCameraUp: vec4<f32>,
  uCameraPos: vec4<f32>,
  uExtra: vec4<f32>,
  uViewProj: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> params: SimParams;
@group(0) @binding(1) var<storage, read> posBuf: array<vec4<f32>>;

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) worldCenter: vec3<f32>,
  @location(2) @interpolate(flat) kind: f32,
  @location(3) @interpolate(flat) pid: u32,
  @location(4) radius: f32,
};

@vertex
fn vsMain(
  @builtin(vertex_index) vIdx: u32,
  @builtin(instance_index) iIdx: u32,
) -> VSOut {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0),
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0,  1.0),
    vec2<f32>(-1.0,  1.0),
  );
  let uv = corners[vIdx];
  let pInfo = posBuf[iIdx];
  var r = params.uRadii.y * 1.05;
  if (pInfo.w < 0.5) {
    r = params.uRadii.x * 1.38;
  } else if (pInfo.w > 1.5 && pInfo.w < 2.5) {
    r = params.uExtra.y * 1.35;
  } else if (pInfo.w >= 2.5) {
    r = params.uExtra.z * 1.1;
  }
  let worldPos = pInfo.xyz + params.uCameraRight.xyz * (uv.x * r) + params.uCameraUp.xyz * (uv.y * r);

  var out: VSOut;
  out.pos = params.uViewProj * vec4<f32>(worldPos, 1.0);
  out.uv = uv;
  out.worldCenter = pInfo.xyz;
  out.kind = pInfo.w;
  out.pid = iIdx;
  out.radius = r;
  return out;
}

struct FSOut {
  @location(0) color: vec4<f32>,
  @builtin(frag_depth) depth: f32,
};

@fragment
fn fsMain(in: VSOut) -> FSOut {
  let r2 = dot(in.uv, in.uv);
  if (r2 > 1.0) { discard; }

  let nz = sqrt(max(0.0, 1.0 - r2));
  let camFwd = normalize(cross(params.uCameraUp.xyz, params.uCameraRight.xyz));
  let normal = normalize(
    params.uCameraRight.xyz * in.uv.x +
    params.uCameraUp.xyz * in.uv.y -
    camFwd * nz
  );

  let surfaceWorld = in.worldCenter + normal * in.radius;
  let clip = params.uViewProj * vec4<f32>(surfaceWorld, 1.0);
  let depth = clamp(clip.z / clip.w, 0.0, 0.9999);

  let lightDir = normalize(vec3<f32>(0.55, 0.82, 0.65));
  let viewDir = normalize(params.uCameraPos.xyz - surfaceWorld);
  let diff = max(0.0, dot(normal, lightDir));
  let halfVec = normalize(lightDir + viewDir);
  let fresnel = pow(1.0 - max(0.0, dot(normal, viewDir)), 2.6);

  var rgb: vec3<f32>;
  if (in.kind < 0.5) {
    let spec = pow(max(0.0, dot(normal, halfVec)), 52.0);
    let deepWater = vec3<f32>(0.03, 0.36, 0.68);
    let brightWater = vec3<f32>(0.24, 0.76, 0.98);
    rgb = mix(deepWater, brightWater, 0.35 + 0.55 * diff + 0.45 * fresnel) + vec3<f32>(0.9, 0.97, 1.0) * spec * 0.85;
  } else if (in.kind < 1.5) {
    let shade = f32((in.pid * 2654435761u) & 255u) / 255.0;
    let sandBase = mix(vec3<f32>(0.78, 0.55, 0.14), vec3<f32>(0.96, 0.78, 0.28), shade);
    let ao = clamp(0.45 + 0.12 * in.worldCenter.y, 0.45, 1.0);
    rgb = sandBase * (0.28 + 0.72 * diff) * ao;
  } else if (in.kind < 2.5) {
    let spec = pow(max(0.0, dot(normal, halfVec)), 40.0);
    let deepOil = vec3<f32>(0.24, 0.48, 0.06);
    let brightOil = vec3<f32>(0.68, 0.92, 0.22);
    rgb = mix(deepOil, brightOil, 0.35 + 0.55 * diff + 0.4 * fresnel) + vec3<f32>(1.0, 0.98, 0.75) * spec * 0.75;
  } else {
    let spec = pow(max(0.0, dot(normal, halfVec)), 64.0);
    // Magnetite: near-black with a steel-grey metallic sheen
    let baseMag = vec3<f32>(0.07, 0.07, 0.08);
    let rimMag = vec3<f32>(0.45, 0.48, 0.55);
    rgb = baseMag * (0.3 + 0.7 * diff) + rimMag * fresnel * 0.6 + vec3<f32>(0.85, 0.88, 0.95) * spec * 1.1;
  }

  var out: FSOut;
  out.color = vec4<f32>(rgb, 1.0);
  out.depth = depth;
  return out;
}
`;

const RENDER_GEOM_WGSL = /* wgsl */ `
struct SimParams {
  uCounts: vec4<u32>,
  uGridDims: vec4<u32>,
  uGridMin: vec4<f32>,
  uPhysics1: vec4<f32>,
  uPhysics2: vec4<f32>,
  uRadii: vec4<f32>,
  uStirPos: vec4<f32>,
  uStirVel: vec4<f32>,
  uCameraRight: vec4<f32>,
  uCameraUp: vec4<f32>,
  uCameraPos: vec4<f32>,
  uExtra: vec4<f32>,
  uViewProj: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> params: SimParams;

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) color: vec4<f32>,
};

@vertex
fn vsGeom(@location(0) pos: vec3<f32>, @location(1) col: vec4<f32>) -> VSOut {
  var out: VSOut;
  out.pos = params.uViewProj * vec4<f32>(pos, 1.0);
  out.color = col;
  return out;
}

@fragment
fn fsGeom(in: VSOut) -> @location(0) vec4<f32> {
  return in.color;
}
`;

function buildContainerAndObstacleGeometry(
  container: GpuContainerMode,
  obstacles: ObstacleBox3D[],
): { lineVerts: Float32Array; triVerts: Float32Array } {
  const lineVerts: number[] = [];
  const triVerts: number[] = [];

  const pushSeg = (
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ) => {
    lineVerts.push(x1, y1, z1, r, g, b, a, x2, y2, z2, r, g, b, a);
  };

  const pushTri = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ) => {
    triVerts.push(
      ax, ay, az, r, g, b, a,
      bx, by, bz, r, g, b, a,
      cx, cy, cz, r, g, b, a,
    );
  };

  for (let gx = -8; gx <= 8; gx += 2) {
    pushSeg(gx, 0, -6, gx, 0, 6, 0.14, 0.2, 0.32, 0.55);
  }
  for (let gz = -6; gz <= 6; gz += 2) {
    pushSeg(-8, 0, gz, 8, 0, gz, 0.14, 0.2, 0.32, 0.55);
  }

  if (container.isGlassMode) {
    const segs = 48;
    const rings = [0.0, container.tankMaxY * 0.35, container.tankMaxY * 0.7, container.tankMaxY];
    for (let ri = 0; ri < rings.length; ri++) {
      const y = rings[ri]!;
      const t = y / container.tankMaxY;
      const rad = container.glassRBottom + (container.glassRTop - container.glassRBottom) * t;
      const alpha = ri === 0 || ri === rings.length - 1 ? 0.85 : 0.28;
      for (let s = 0; s < segs; s++) {
        const a0 = (s / segs) * Math.PI * 2;
        const a1 = ((s + 1) / segs) * Math.PI * 2;
        pushSeg(
          Math.cos(a0) * rad,
          y,
          Math.sin(a0) * rad,
          Math.cos(a1) * rad,
          y,
          Math.sin(a1) * rad,
          0.58,
          0.78,
          0.95,
          alpha,
        );
      }
    }
    for (let s = 0; s < 12; s++) {
      const a = (s / 12) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      pushSeg(
        c * container.glassRBottom,
        0,
        sn * container.glassRBottom,
        c * container.glassRTop,
        container.tankMaxY,
        sn * container.glassRTop,
        0.52,
        0.72,
        0.9,
        0.35,
      );
    }
  } else {
    const hx = container.tankHalfX;
    const hy = container.tankMaxY;
    const hz = container.tankHalfZ;
    const c: [number, number, number, number] = [0.35, 0.48, 0.65, 0.7];
    for (const y of [0, hy]) {
      pushSeg(-hx, y, -hz, hx, y, -hz, ...c);
      pushSeg(hx, y, -hz, hx, y, hz, ...c);
      pushSeg(hx, y, hz, -hx, y, hz, ...c);
      pushSeg(-hx, y, hz, -hx, y, -hz, ...c);
    }
    for (const [x, z] of [
      [-hx, -hz],
      [hx, -hz],
      [hx, hz],
      [-hx, hz],
    ] as const) {
      pushSeg(x, 0, z, x, hy, z, ...c);
    }

    for (const ob of obstacles) {
      const cosA = Math.cos(ob.angleZ);
      const sinA = Math.sin(ob.angleZ);
      const toWorld = (lx: number, ly: number, lz: number): [number, number, number] => [
        ob.cx + lx * cosA - ly * sinA,
        ob.cy + lx * sinA + ly * cosA,
        ob.cz + lz,
      ];
      const p = [
        toWorld(-ob.hx, -ob.hy, -ob.hz),
        toWorld(ob.hx, -ob.hy, -ob.hz),
        toWorld(ob.hx, ob.hy, -ob.hz),
        toWorld(-ob.hx, ob.hy, -ob.hz),
        toWorld(-ob.hx, -ob.hy, ob.hz),
        toWorld(ob.hx, -ob.hy, ob.hz),
        toWorld(ob.hx, ob.hy, ob.hz),
        toWorld(-ob.hx, ob.hy, ob.hz),
      ] as const;

      const ec: [number, number, number, number] = [0.38, 0.8, 0.98, 0.85];
      for (const [i, j] of [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7],
      ] as const) {
        pushSeg(...p[i]!, ...p[j]!, ...ec);
      }

      const quad = (
        a: number,
        b: number,
        cIdx: number,
        d: number,
        r: number,
        g: number,
        bl: number,
      ) => {
        pushTri(...p[a]!, ...p[b]!, ...p[cIdx]!, r, g, bl, 0.85);
        pushTri(...p[a]!, ...p[cIdx]!, ...p[d]!, r, g, bl, 0.85);
      };
      quad(3, 2, 6, 7, 0.16, 0.25, 0.38);
      quad(0, 4, 5, 1, 0.08, 0.12, 0.18);
      quad(4, 5, 6, 7, 0.12, 0.19, 0.29);
      quad(1, 0, 3, 2, 0.10, 0.15, 0.23);
      quad(0, 4, 7, 3, 0.11, 0.16, 0.25);
      quad(5, 1, 2, 6, 0.14, 0.20, 0.31);
    }
  }

  return {
    lineVerts: new Float32Array(lineVerts),
    triVerts: new Float32Array(triVerts),
  };
}

export function generateGpuPresetParticles(
  presetId: SandWaterPresetId,
  isGlassMode: boolean,
  targetTotal: number,
): { pos: Float32Array; vel: Float32Array; count: number; hasObstacle: boolean } {
  const maxCount = Math.min(MAX_GPU_PARTICLES, Math.max(2000, targetTotal));
  const pos = new Float32Array(MAX_GPU_PARTICLES * 4);
  const vel = new Float32Array(MAX_GPU_PARTICLES * 4);
  let count = 0;

  const push = (
    kind: MacroParticleKind,
    x: number,
    y: number,
    z: number,
    vx = 0,
    vy = 0,
    vz = 0,
  ) => {
    if (count >= maxCount) return;
    const base = count * 4;
    pos[base] = x;
    pos[base + 1] = y;
    pos[base + 2] = z;
    pos[base + 3] =
      kind === 'water' ? 0.0 : kind === 'sand' ? 1.0 : kind === 'oil' ? 2.0 : 3.0;
    vel[base] = vx;
    vel[base + 1] = vy;
    vel[base + 2] = vz;
    vel[base + 3] = 0;
    count += 1;
  };

  const spacing = 0.108;
  let seq = 1;
  const jitter = () => {
    seq += 1;
    const s = Math.sin(seq * 12.9898 + 78.233) * 43758.5453;
    return (s - Math.floor(s) - 0.5) * 0.02;
  };

  if (isGlassMode) {
    if (presetId === 'density-tower') {
      const bands: Array<{
        kind: MacroParticleKind;
        y0: number;
        yLayers: number;
        rMax: number;
        share: number;
      }> = [
        { kind: 'ferro', y0: 0.15, yLayers: 6, rMax: 1.75, share: 0.22 },
        { kind: 'sand', y0: 0.85, yLayers: 7, rMax: 1.8, share: 0.24 },
        { kind: 'water', y0: 1.7, yLayers: 11, rMax: 1.9, share: 0.30 },
        { kind: 'oil', y0: 3.0, yLayers: 10, rMax: 2.0, share: 0.24 },
      ];
      let usedCap = 0;
      for (const band of bands) {
        usedCap = Math.min(maxCount, usedCap + Math.floor(maxCount * band.share));
        for (let iy = 0; iy < band.yLayers && count < usedCap; iy++) {
          const y = band.y0 + iy * spacing;
          for (let x = -band.rMax; x <= band.rMax && count < usedCap; x += spacing) {
            for (let z = -band.rMax; z <= band.rMax && count < usedCap; z += spacing) {
              if (x * x + z * z <= band.rMax * band.rMax) {
                push(band.kind, x + jitter(), y, z + jitter());
              }
            }
          }
        }
      }
      return { pos, vel, count, hasObstacle: false };
    }

    if (presetId === 'sand-pile') {
      for (let iy = 0; iy < 34 && count < maxCount; iy++) {
        const y = 1.1 + iy * spacing;
        const rMax = 1.65;
        for (let x = -rMax; x <= rMax && count < maxCount; x += spacing) {
          for (let z = -rMax; z <= rMax && count < maxCount; z += spacing) {
            if (x * x + z * z <= rMax * rMax) {
              push('sand', x + jitter(), y, z + jitter());
            }
          }
        }
      }
      return { pos, vel, count, hasObstacle: false };
    }

    if (presetId === 'dam-break') {
      for (let iy = 0; iy < 38 && count < maxCount; iy++) {
        const y = 0.15 + iy * spacing;
        const rMax = 1.35;
        for (let x = -rMax; x <= rMax && count < maxCount; x += spacing) {
          for (let z = -rMax; z <= rMax && count < maxCount; z += spacing) {
            if (x * x + z * z <= rMax * rMax) {
              push('water', x - 0.45 + jitter(), y, z + jitter(), 1.2, 0, 0.4);
            }
          }
        }
      }
      return { pos, vel, count, hasObstacle: false };
    }

    const waterTarget = Math.floor(maxCount * 0.72);
    for (let iy = 0; iy < 24 && count < waterTarget; iy++) {
      const y = 0.12 + iy * spacing;
      const rMax = 1.88;
      for (let x = -rMax; x <= rMax && count < waterTarget; x += spacing) {
        for (let z = -rMax; z <= rMax && count < waterTarget; z += spacing) {
          if (x * x + z * z <= rMax * rMax) {
            push('water', x + jitter(), y, z + jitter());
          }
        }
      }
    }
    for (let iy = 0; iy < 22 && count < maxCount; iy++) {
      const y = 3.2 + iy * spacing;
      const rMax = 1.15;
      for (let x = -rMax; x <= rMax && count < maxCount; x += spacing) {
        for (let z = -rMax; z <= rMax && count < maxCount; z += spacing) {
          if (x * x + z * z <= rMax * rMax) {
            push('sand', x + jitter(), y, z + jitter(), 0, -1.2, 0);
          }
        }
      }
    }
    return { pos, vel, count, hasObstacle: false };
  }

  if (presetId === 'cascade-maze') {
    const waterCap = Math.floor(maxCount * 0.65);
    for (let iy = 0; iy < 10 && count < waterCap; iy++) {
      for (let ix = 0; ix < 24 && count < waterCap; ix++) {
        for (let iz = 0; iz < 28 && count < waterCap; iz++) {
          push(
            'water',
            -4.1 + ix * spacing + jitter(),
            5.55 + iy * spacing,
            -1.5 + iz * spacing + jitter(),
            1.6,
            0,
            0,
          );
        }
      }
    }
    for (let iy = 0; iy < 6 && count < maxCount; iy++) {
      for (let ix = 0; ix < 16 && count < maxCount; ix++) {
        for (let iz = 0; iz < 24 && count < maxCount; iz++) {
          push(
            'oil',
            -3.9 + ix * spacing + jitter(),
            5.75 + iy * spacing,
            -1.3 + iz * spacing + jitter(),
            1.2,
            0,
            0,
          );
        }
      }
    }
    return { pos, vel, count, hasObstacle: true };
  }

  if (presetId === 'plinko-funnel') {
    for (let iy = 0; iy < 10 && count < maxCount; iy++) {
      for (let ix = 0; ix < 24 && count < maxCount; ix++) {
        for (let iz = 0; iz < 28 && count < maxCount; iz++) {
          const kind: MacroParticleKind =
            (ix + iy) % 4 === 0 ? 'sand' : (ix + iz) % 5 === 0 ? 'oil' : 'water';
          push(
            kind,
            -1.25 + ix * spacing + jitter(),
            5.65 + iy * spacing,
            -1.5 + iz * spacing + jitter(),
          );
        }
      }
    }
    return { pos, vel, count, hasObstacle: true };
  }

  if (presetId === 'density-tower') {
    const bands: Array<{
      kind: MacroParticleKind;
      yStart: number;
      yRows: number;
      share: number;
    }> = [
      { kind: 'ferro', yStart: 0.15, yRows: 6, share: 0.22 },
      { kind: 'sand', yStart: 0.85, yRows: 7, share: 0.24 },
      { kind: 'water', yStart: 1.7, yRows: 12, share: 0.30 },
      { kind: 'oil', yStart: 3.1, yRows: 10, share: 0.24 },
    ];
    let usedCap = 0;
    for (const band of bands) {
      usedCap = Math.min(maxCount, usedCap + Math.floor(maxCount * band.share));
      for (let iy = 0; iy < band.yRows && count < usedCap; iy++) {
        for (let ix = 0; ix < 50 && count < usedCap; ix++) {
          for (let iz = 0; iz < 24 && count < usedCap; iz++) {
            push(
              band.kind,
              -2.9 + ix * 0.118 + jitter(),
              band.yStart + iy * spacing,
              -1.35 + iz * spacing + jitter(),
            );
          }
        }
      }
    }
    return { pos, vel, count, hasObstacle: false };
  }

  // Rectangular Tank Mode presets
  if (presetId === 'dam-break') {
    for (let ix = 0; ix < 24 && count < maxCount; ix++) {
      for (let iy = 0; iy < 44 && count < maxCount; iy++) {
        for (let iz = 0; iz < 30 && count < maxCount; iz++) {
          push(
            'water',
            -4.3 + ix * spacing + jitter(),
            0.12 + iy * spacing,
            -1.6 + iz * spacing + jitter(),
          );
        }
      }
    }
    return { pos, vel, count, hasObstacle: false };
  }

  if (presetId === 'sand-pile') {
    for (let iy = 0; iy < 34 && count < maxCount; iy++) {
      for (let ix = 0; ix < 24 && count < maxCount; ix++) {
        for (let iz = 0; iz < 24 && count < maxCount; iz++) {
          push(
            'sand',
            -1.3 + ix * spacing + jitter(),
            1.2 + iy * spacing,
            -1.3 + iz * spacing + jitter(),
          );
        }
      }
    }
    return { pos, vel, count, hasObstacle: false };
  }

  if (presetId === 'obstacle-splash') {
    const waterTarget = Math.floor(maxCount * 0.72);
    for (let iy = 0; iy < 40 && count < waterTarget; iy++) {
      for (let ix = 0; ix < 24 && count < waterTarget; ix++) {
        for (let iz = 0; iz < 28 && count < waterTarget; iz++) {
          push(
            'water',
            -4.2 + ix * spacing + jitter(),
            0.15 + iy * spacing,
            -1.5 + iz * spacing + jitter(),
            2.6,
            0,
            0,
          );
        }
      }
    }
    for (let iy = 0; iy < 18 && count < maxCount; iy++) {
      for (let ix = 0; ix < 18 && count < maxCount; ix++) {
        for (let iz = 0; iz < 22 && count < maxCount; iz++) {
          push(
            'sand',
            1.6 + ix * spacing + jitter(),
            0.12 + iy * spacing,
            -1.2 + iz * spacing + jitter(),
          );
        }
      }
    }
    return { pos, vel, count, hasObstacle: true };
  }

  // Rectangular 'sand-into-water'
  const waterTarget = Math.floor(maxCount * 0.7);
  for (let iy = 0; iy < 16 && count < waterTarget; iy++) {
    for (let ix = 0; ix < 62 && count < waterTarget; ix++) {
      for (let iz = 0; iz < 28 && count < waterTarget; iz++) {
        push(
          'water',
          -3.6 + ix * 0.115 + jitter(),
          0.12 + iy * spacing,
          -1.55 + iz * spacing + jitter(),
        );
      }
    }
  }
  for (let iy = 0; iy < 22 && count < maxCount; iy++) {
    for (let ix = 0; ix < 20 && count < maxCount; ix++) {
      for (let iz = 0; iz < 20 && count < maxCount; iz++) {
        push(
          'sand',
          -1.1 + ix * spacing + jitter(),
          2.6 + iy * spacing,
          -1.05 + iz * spacing + jitter(),
        );
      }
    }
  }
  return { pos, vel, count, hasObstacle: false };
}

export class WebGpuFluidEngine {
  readonly device: GPUDevice;
  readonly context: GPUCanvasContext;
  readonly format: GPUTextureFormat;
  readonly adapterName: string;

  private uniformBuf: GPUBuffer;
  private uniformBytes = new ArrayBuffer(256);
  private uniformU32 = new Uint32Array(this.uniformBytes);
  private uniformF32 = new Float32Array(this.uniformBytes);

  private posBuffers: [GPUBuffer, GPUBuffer];
  private velBuffers: [GPUBuffer, GPUBuffer];
  private densityBuf: GPUBuffer;
  private cellHeadBuf: GPUBuffer;
  private cellNextBuf: GPUBuffer;
  private obstacleBuf: GPUBuffer;
  private lineVertexBuf: GPUBuffer;
  private lineVertexCount = 0;
  private triVertexBuf: GPUBuffer;
  private triVertexCount = 0;
  private obstacleCount = 0;

  private clearPipeline: GPUComputePipeline;
  private buildPipeline: GPUComputePipeline;
  private densityPipeline: GPUComputePipeline;
  private integratePipeline: GPUComputePipeline;
  private computeBindGroups: [GPUBindGroup, GPUBindGroup];

  private particlePipeline: GPURenderPipeline;
  private particleBindGroups: [GPUBindGroup, GPUBindGroup];
  private linePipeline: GPURenderPipeline;
  private triPipeline: GPURenderPipeline;
  private geomBindGroup: GPUBindGroup;

  private depthTex: GPUTexture | null = null;
  private depthWidth = 0;
  private depthHeight = 0;

  private ping = 0;
  activeCount = 0;
  waterCount = 0;
  sandCount = 0;
  oilCount = 0;
  ferroCount = 0;
  private destroyed = false;

  private constructor(
    device: GPUDevice,
    context: GPUCanvasContext,
    format: GPUTextureFormat,
    adapterName: string,
  ) {
    this.device = device;
    this.context = context;
    this.format = format;
    this.adapterName = adapterName;

    this.uniformBuf = device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const pSize = MAX_GPU_PARTICLES * 16;
    this.posBuffers = [
      device.createBuffer({
        size: pSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
      device.createBuffer({
        size: pSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
    ];
    this.velBuffers = [
      device.createBuffer({
        size: pSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
      device.createBuffer({
        size: pSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
    ];
    this.densityBuf = device.createBuffer({
      size: MAX_GPU_PARTICLES * 8,
      usage: GPUBufferUsage.STORAGE,
    });
    this.cellHeadBuf = device.createBuffer({
      size: GRID_TOTAL_CELLS * 4,
      usage: GPUBufferUsage.STORAGE,
    });
    this.cellNextBuf = device.createBuffer({
      size: MAX_GPU_PARTICLES * 4,
      usage: GPUBufferUsage.STORAGE,
    });
    this.obstacleBuf = device.createBuffer({
      size: MAX_GPU_OBSTACLES * 32,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.lineVertexBuf = device.createBuffer({
      size: 65536 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.triVertexBuf = device.createBuffer({
      size: 65536 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    const computeModule = device.createShaderModule({ code: COMPUTE_WGSL });
    const computeLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      ],
    });
    const computePipeLayout = device.createPipelineLayout({
      bindGroupLayouts: [computeLayout],
    });

    this.clearPipeline = device.createComputePipeline({
      layout: computePipeLayout,
      compute: { module: computeModule, entryPoint: 'clearGrid' },
    });
    this.buildPipeline = device.createComputePipeline({
      layout: computePipeLayout,
      compute: { module: computeModule, entryPoint: 'buildGrid' },
    });
    this.densityPipeline = device.createComputePipeline({
      layout: computePipeLayout,
      compute: { module: computeModule, entryPoint: 'computeDensity' },
    });
    this.integratePipeline = device.createComputePipeline({
      layout: computePipeLayout,
      compute: { module: computeModule, entryPoint: 'integrateForces' },
    });

    const makeComputeBg = (src: 0 | 1, dst: 0 | 1) =>
      device.createBindGroup({
        layout: computeLayout,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuf } },
          { binding: 1, resource: { buffer: this.posBuffers[src] } },
          { binding: 2, resource: { buffer: this.velBuffers[src] } },
          { binding: 3, resource: { buffer: this.posBuffers[dst] } },
          { binding: 4, resource: { buffer: this.velBuffers[dst] } },
          { binding: 5, resource: { buffer: this.densityBuf } },
          { binding: 6, resource: { buffer: this.cellHeadBuf } },
          { binding: 7, resource: { buffer: this.cellNextBuf } },
          { binding: 8, resource: { buffer: this.obstacleBuf } },
        ],
      });

    this.computeBindGroups = [makeComputeBg(0, 1), makeComputeBg(1, 0)];

    const particleModule = device.createShaderModule({ code: RENDER_PARTICLES_WGSL });
    const particleLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });

    this.particlePipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [particleLayout] }),
      vertex: { module: particleModule, entryPoint: 'vsMain' },
      fragment: {
        module: particleModule,
        entryPoint: 'fsMain',
        targets: [{ format }],
      },
      primitive: { topology: 'triangle-list' },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    });

    this.particleBindGroups = [
      device.createBindGroup({
        layout: particleLayout,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuf } },
          { binding: 1, resource: { buffer: this.posBuffers[0] } },
        ],
      }),
      device.createBindGroup({
        layout: particleLayout,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuf } },
          { binding: 1, resource: { buffer: this.posBuffers[1] } },
        ],
      }),
    ];

    const geomModule = device.createShaderModule({ code: RENDER_GEOM_WGSL });
    const geomLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      ],
    });
    const geomBufferLayout: GPUVertexBufferLayout = {
      arrayStride: 28,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x4' },
      ],
    };
    const alphaBlend: GPUBlendState = {
      color: {
        srcFactor: 'src-alpha',
        dstFactor: 'one-minus-src-alpha',
        operation: 'add',
      },
      alpha: {
        srcFactor: 'one',
        dstFactor: 'one-minus-src-alpha',
        operation: 'add',
      },
    };
    this.linePipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [geomLayout] }),
      vertex: { module: geomModule, entryPoint: 'vsGeom', buffers: [geomBufferLayout] },
      fragment: { module: geomModule, entryPoint: 'fsGeom', targets: [{ format, blend: alphaBlend }] },
      primitive: { topology: 'line-list' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less' },
    });
    this.triPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [geomLayout] }),
      vertex: { module: geomModule, entryPoint: 'vsGeom', buffers: [geomBufferLayout] },
      fragment: { module: geomModule, entryPoint: 'fsGeom', targets: [{ format, blend: alphaBlend }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    });
    this.geomBindGroup = device.createBindGroup({
      layout: geomLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuf } }],
    });

    this.updateContainerMesh(DEFAULT_GLASS_CONTAINER, 'sand-into-water', false);
  }

  static async create(
    canvas: HTMLCanvasElement,
  ): Promise<{ engine: WebGpuFluidEngine | null; reason: string }> {
    if (typeof navigator === 'undefined' || !navigator.gpu) {
      return { engine: null, reason: 'navigator.gpu unavailable' };
    }
    try {
      let adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance',
      });
      if (!adapter) {
        adapter = await navigator.gpu.requestAdapter();
      }
      if (!adapter) {
        return { engine: null, reason: 'requestAdapter() returned null' };
      }
      const device = await adapter.requestDevice();
      const context = canvas.getContext('webgpu');
      if (!context) {
        return { engine: null, reason: 'canvas.getContext(webgpu) failed' };
      }
      const format = navigator.gpu.getPreferredCanvasFormat();
      context.configure({ device, format, alphaMode: 'premultiplied' });
      const info = (adapter as unknown as { info?: { device?: string; description?: string } }).info;
      const adapterName = info?.description || info?.device || 'WebGPU GPU';
      return {
        engine: new WebGpuFluidEngine(device, context, format, adapterName),
        reason: 'ok',
      };
    } catch (err) {
      return {
        engine: null,
        reason: err instanceof Error ? err.message : 'WebGPU init error',
      };
    }
  }

  updateContainerMesh(
    container: GpuContainerMode,
    presetId: SandWaterPresetId,
    hasBarrier: boolean,
  ): void {
    const obsList = getObstaclesForPreset(presetId, hasBarrier, container.isGlassMode).slice(
      0,
      MAX_GPU_OBSTACLES,
    );
    this.obstacleCount = obsList.length;

    const obsData = new Float32Array(MAX_GPU_OBSTACLES * 8);
    for (let i = 0; i < obsList.length; i++) {
      const ob = obsList[i]!;
      const base = i * 8;
      obsData[base] = ob.cx;
      obsData[base + 1] = ob.cy;
      obsData[base + 2] = ob.cz;
      obsData[base + 3] = ob.angleZ;
      obsData[base + 4] = ob.hx;
      obsData[base + 5] = ob.hy;
      obsData[base + 6] = ob.hz;
      obsData[base + 7] = 0;
    }
    this.device.queue.writeBuffer(this.obstacleBuf, 0, obsData.buffer as ArrayBuffer);

    const { lineVerts, triVerts } = buildContainerAndObstacleGeometry(container, obsList);
    this.lineVertexCount = Math.floor(lineVerts.length / 7);
    this.triVertexCount = Math.floor(triVerts.length / 7);
    if (lineVerts.byteLength > 0) {
      this.device.queue.writeBuffer(
        this.lineVertexBuf,
        0,
        lineVerts.buffer as ArrayBuffer,
        0,
        lineVerts.byteLength,
      );
    }
    if (triVerts.byteLength > 0) {
      this.device.queue.writeBuffer(
        this.triVertexBuf,
        0,
        triVerts.buffer as ArrayBuffer,
        0,
        triVerts.byteLength,
      );
    }
  }

  uploadParticles(pos: Float32Array, vel: Float32Array, count: number): void {
    this.ping = 0;
    this.activeCount = Math.min(MAX_GPU_PARTICLES, count);
    let w = 0;
    let s = 0;
    let o = 0;
    let f = 0;
    for (let i = 0; i < this.activeCount; i++) {
      const k = pos[i * 4 + 3]!;
      if (k < 0.5) w += 1;
      else if (k < 1.5) s += 1;
      else if (k < 2.5) o += 1;
      else f += 1;
    }
    this.waterCount = w;
    this.sandCount = s;
    this.oilCount = o;
    this.ferroCount = f;
    const byteLen = this.activeCount * 16;
    if (byteLen > 0) {
      this.device.queue.writeBuffer(this.posBuffers[0], 0, pos.buffer as ArrayBuffer, 0, byteLen);
      this.device.queue.writeBuffer(this.velBuffers[0], 0, vel.buffer as ArrayBuffer, 0, byteLen);
    }
  }

  clearParticles(): void {
    this.activeCount = 0;
    this.waterCount = 0;
    this.sandCount = 0;
    this.oilCount = 0;
    this.ferroCount = 0;
  }

  spawnStream(
    kind: MacroParticleKind,
    cx: number,
    cy: number,
    cz: number,
    batchSize = 18,
  ): void {
    const avail = MAX_GPU_PARTICLES - this.activeCount;
    const n = Math.min(batchSize, avail);
    if (n <= 0) return;

    const posChunk = new Float32Array(n * 4);
    const velChunk = new Float32Array(n * 4);
    const kVal = kind === 'water' ? 0.0 : kind === 'sand' ? 1.0 : kind === 'oil' ? 2.0 : 3.0;

    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2 + this.activeCount * 0.37;
      const rad = 0.05 + (k % 4) * 0.06;
      const ox = Math.cos(ang) * rad;
      const oz = Math.sin(ang) * rad;
      const oy = (k % 3) * 0.06;

      posChunk[k * 4] = cx + ox;
      posChunk[k * 4 + 1] = cy + oy;
      posChunk[k * 4 + 2] = cz + oz;
      posChunk[k * 4 + 3] = kVal;

      velChunk[k * 4] = ox * 2.5;
      velChunk[k * 4 + 1] = -2.4;
      velChunk[k * 4 + 2] = oz * 2.5;
      velChunk[k * 4 + 3] = 0;
    }

    const byteOffset = this.activeCount * 16;
    this.device.queue.writeBuffer(this.posBuffers[this.ping]!, byteOffset, posChunk.buffer as ArrayBuffer);
    this.device.queue.writeBuffer(this.velBuffers[this.ping]!, byteOffset, velChunk.buffer as ArrayBuffer);
    this.activeCount += n;
    if (kind === 'water') this.waterCount += n;
    else if (kind === 'sand') this.sandCount += n;
    else if (kind === 'oil') this.oilCount += n;
    else this.ferroCount += n;
  }

  stepAndRender(params: {
    width: number;
    height: number;
    config: SandWaterConfig;
    container: GpuContainerMode;
    camPos: [number, number, number];
    camRight: [number, number, number];
    camUp: [number, number, number];
    viewProj: Float32Array;
    stirMode: 0 | 1 | 2 | 3; // 0=none, 1=stir, 2=shake, 3=magnet
    stirPos: [number, number, number];
    stirVel: [number, number, number];
  }): void {
    if (this.destroyed) return;
    const { width, height, config, container } = params;
    if (width <= 0 || height <= 0) return;

    if (
      !this.depthTex ||
      this.depthWidth !== width ||
      this.depthHeight !== height
    ) {
      this.depthTex?.destroy();
      this.depthTex = this.device.createTexture({
        size: { width, height },
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.depthWidth = width;
      this.depthHeight = height;
    }

    const writeUniforms = (stirModeForStep: number) => {
      const u32 = this.uniformU32;
      const f32 = this.uniformF32;

      u32[0] = this.activeCount;
      u32[1] = MAX_GPU_PARTICLES;
      u32[2] = GRID_TOTAL_CELLS;
      u32[3] = this.obstacleCount;

      u32[4] = GRID_NX;
      u32[5] = GRID_NY;
      u32[6] = GRID_NZ;
      u32[7] = container.isGlassMode ? 1 : 0;

      f32[8] = GRID_MIN_X;
      f32[9] = GRID_MIN_Y;
      f32[10] = GRID_MIN_Z;
      f32[11] = CELL_SIZE;

      f32[12] = 0.0065;
      f32[13] = config.gravityX;
      f32[14] = config.gravityY;
      f32[15] = config.viscosity;

      f32[16] = config.sandFriction;
      f32[17] = config.stiffness;
      f32[18] = CELL_SIZE;
      f32[19] = 820.0;

      f32[20] = GPU_WATER_RADIUS;
      f32[21] = GPU_SAND_RADIUS;
      f32[22] = container.glassRBottom;
      f32[23] = container.glassRTop;

      f32[24] = params.stirPos[0];
      f32[25] = params.stirPos[1];
      f32[26] = params.stirPos[2];
      f32[27] = 1.05;

      f32[28] = params.stirVel[0];
      f32[29] = params.stirVel[1];
      f32[30] = params.stirVel[2];
      f32[31] = stirModeForStep;

      f32[32] = params.camRight[0];
      f32[33] = params.camRight[1];
      f32[34] = params.camRight[2];
      f32[35] = container.tankMaxY;

      f32[36] = params.camUp[0];
      f32[37] = params.camUp[1];
      f32[38] = params.camUp[2];
      f32[39] = container.tankHalfX;

      f32[40] = params.camPos[0];
      f32[41] = params.camPos[1];
      f32[42] = params.camPos[2];
      f32[43] = container.tankHalfZ;

      f32[44] = config.gravityZ ?? 0;
      f32[45] = GPU_OIL_RADIUS;
      f32[46] = GPU_FERRO_RADIUS;
      f32[47] = 0;

      f32.set(params.viewProj, 48);
      this.device.queue.writeBuffer(this.uniformBuf, 0, this.uniformBytes);
    };

    if ((!config.paused || params.stirMode === 2) && this.activeCount > 0) {
      const substeps = config.paused ? 1 : 2;
      const clearWg = Math.ceil(GRID_TOTAL_CELLS / 128);
      const partWg = Math.ceil(this.activeCount / 128);

      for (let s = 0; s < substeps; s++) {
        const stirModeStep = s === 0 ? params.stirMode : params.stirMode === 2 ? 0 : params.stirMode;
        writeUniforms(stirModeStep);

        const cEncoder = this.device.createCommandEncoder();
        const cPass = cEncoder.beginComputePass();
        const bg = this.computeBindGroups[this.ping]!;
        cPass.setBindGroup(0, bg);
        cPass.setPipeline(this.clearPipeline);
        cPass.dispatchWorkgroups(clearWg);
        cPass.setPipeline(this.buildPipeline);
        cPass.dispatchWorkgroups(partWg);
        cPass.setPipeline(this.densityPipeline);
        cPass.dispatchWorkgroups(partWg);
        cPass.setPipeline(this.integratePipeline);
        cPass.dispatchWorkgroups(partWg);
        cPass.end();
        this.device.queue.submit([cEncoder.finish()]);

        this.ping = 1 - this.ping;
      }
    }

    writeUniforms(0);
    const encoder = this.device.createCommandEncoder();

    const textureView = this.context.getCurrentTexture().createView();
    const rPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.035, g: 0.051, b: 0.086, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: this.depthTex.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    if (this.triVertexCount > 0) {
      rPass.setPipeline(this.triPipeline);
      rPass.setBindGroup(0, this.geomBindGroup);
      rPass.setVertexBuffer(0, this.triVertexBuf);
      rPass.draw(this.triVertexCount);
    }

    if (this.activeCount > 0) {
      rPass.setPipeline(this.particlePipeline);
      rPass.setBindGroup(0, this.particleBindGroups[this.ping]!);
      rPass.draw(6, this.activeCount);
    }

    if (this.lineVertexCount > 0) {
      rPass.setPipeline(this.linePipeline);
      rPass.setBindGroup(0, this.geomBindGroup);
      rPass.setVertexBuffer(0, this.lineVertexBuf);
      rPass.draw(this.lineVertexCount);
    }

    rPass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.depthTex?.destroy();
    this.uniformBuf.destroy();
    this.posBuffers[0].destroy();
    this.posBuffers[1].destroy();
    this.velBuffers[0].destroy();
    this.velBuffers[1].destroy();
    this.densityBuf.destroy();
    this.cellHeadBuf.destroy();
    this.cellNextBuf.destroy();
    this.obstacleBuf.destroy();
    this.lineVertexBuf.destroy();
    this.triVertexBuf.destroy();
    this.device.destroy();
  }
}
