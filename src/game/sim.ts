export const WALK_SPEED = 3.4;
export const PLAYER_R = 0.42;
export const PLAZA_R = 14.4;
export const SPAWN = { x: 0, z: 6.5, yaw: 0 };

/**
 * Church on the north edge of the plaza (-z). Walkable space is the plaza disk
 * ∪ the doorway corridor ∪ the nave box; walls are the gaps between them.
 */
export const CHURCH = {
  halfW: 5.7, // outer half-width (walls are 0.3 thick)
  front: -14.6, // façade centre line
  back: -31.1, // back wall centre line (keep within REMOTE_POS_LIMIT)
  wall: 0.3,
  doorHalfW: 1.6,
  doorH: 3.6,
  wallH: 6.6,
} as const;

/** Max |x|/|z| accepted from remote pose packets (covers plaza + church). */
export const REMOTE_POS_LIMIT = 40;

/** Interactive spots inside the church. */
export const ALTAR_Z = CHURCH.back + 2.3;
export const LECTERN = { x: 2.9, z: ALTAR_Z + 2.2, r: 0.45 };
/** Confessional booth against the west (left) wall; door faces +x. */
export const BOOTH = { x: -CHURCH.halfW + 1.05, z: ALTAR_Z + 2.4, w: 1.7, d: 2.3, h: 2.9 };
export const BOOTH_EXIT = { x: BOOTH.x + BOOTH.w / 2 + 0.75, z: BOOTH.z };

/** Player-centre is inside the nave (used for camera + roof fade). */
export function insideChurch(x: number, z: number): boolean {
  return Math.abs(x) < CHURCH.halfW && z < CHURCH.front - 0.1 && z > CHURCH.back;
}

type Rect = { x0: number; x1: number; z0: number; z1: number };
const NAVE_IN = CHURCH.halfW - CHURCH.wall / 2;
const NAVE: Rect = {
  x0: -NAVE_IN + PLAYER_R,
  x1: NAVE_IN - PLAYER_R,
  z0: CHURCH.back + CHURCH.wall / 2 + PLAYER_R,
  z1: CHURCH.front - CHURCH.wall / 2 - PLAYER_R,
};
const DOOR: Rect = {
  x0: -CHURCH.doorHalfW + PLAYER_R,
  x1: CHURCH.doorHalfW - PLAYER_R,
  z0: NAVE.z1 - 0.2,
  z1: -13,
};

function inRect(r: Rect, x: number, z: number) {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}

/** Clamp a player centre to plaza ∪ doorway ∪ nave (nearest allowed point). */
export function clampToWalkable(x: number, z: number, boundsR: number): { x: number; z: number } {
  const br = boundsR - PLAYER_R;
  const bd = Math.hypot(x, z);
  if (bd <= br || inRect(DOOR, x, z) || inRect(NAVE, x, z)) return { x, z };
  const cands = [
    bd > 0 ? { x: (x / bd) * br, z: (z / bd) * br } : { x: 0, z: 0 },
    ...[DOOR, NAVE].map((r) => ({
      x: Math.min(r.x1, Math.max(r.x0, x)),
      z: Math.min(r.z1, Math.max(r.z0, z)),
    })),
  ];
  let best = cands[0];
  let bestD = Infinity;
  for (const c of cands) {
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

export type Obstacle = { x: number; z: number; r: number };

export type Walker = { x: number; z: number; yaw: number; speed: number };

export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * Camera-relative walk. +f is forward, +s is strafe right.
 * A (s < 0) while moving turns yaw up — nose left under a chase cam.
 */
export function stepWalker(
  w: Walker,
  camYaw: number,
  wishF: number,
  wishS: number,
  dt: number,
  obstacles: Obstacle[],
  boundsR: number,
): Walker {
  const dtC = Math.min(Math.max(dt, 0), 0.1);
  let f = wishF;
  let s = wishS;
  const mag = Math.hypot(f, s);
  if (mag > 1) {
    f /= mag;
    s /= mag;
  }
  const fx = -Math.sin(camYaw);
  const fz = -Math.cos(camYaw);
  const rx = Math.cos(camYaw);
  const rz = -Math.sin(camYaw);
  let mx = fx * f + rx * s;
  let mz = fz * f + rz * s;
  const mlen = Math.hypot(mx, mz);
  let { x, z, yaw } = w;
  if (mlen > 0.001 && dtC > 0) {
    mx /= mlen;
    mz /= mlen;
    const target = Math.atan2(-mx, -mz);
    const diff = wrapAngle(target - yaw);
    const maxTurn = 12 * dtC;
    yaw = wrapAngle(yaw + Math.max(-maxTurn, Math.min(maxTurn, diff)));
    x += mx * WALK_SPEED * dtC;
    z += mz * WALK_SPEED * dtC;
  }
  for (let pass = 0; pass < 2; pass += 1) {
    for (const o of obstacles) {
      const dx = x - o.x;
      const dz = z - o.z;
      const min = o.r + PLAYER_R;
      const d = Math.hypot(dx, dz);
      if (d < min) {
        if (d > 0.0001) {
          const push = (min - d) / d;
          x += dx * push;
          z += dz * push;
        } else {
          x += min;
        }
      }
    }
  }
  ({ x, z } = clampToWalkable(x, z, boundsR));
  const moved = Math.hypot(x - w.x, z - w.z);
  const speed = dtC > 0 ? moved / dtC : 0;
  return { x, z, yaw, speed };
}
