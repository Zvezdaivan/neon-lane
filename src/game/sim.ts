export const WALK_SPEED = 3.4;
export const PLAYER_R = 0.42;
export const PLAZA_R = 14.4;
export const SPAWN = { x: 0, z: 6.5, yaw: 0 };

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
  const br = boundsR - PLAYER_R;
  const bd = Math.hypot(x, z);
  if (bd > br && bd > 0) {
    x = (x / bd) * br;
    z = (z / bd) * br;
  }
  const moved = Math.hypot(x - w.x, z - w.z);
  const speed = dtC > 0 ? moved / dtC : 0;
  return { x, z, yaw, speed };
}
