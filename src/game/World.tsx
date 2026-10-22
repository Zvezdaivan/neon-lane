import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Group, Mesh } from "three";
import * as THREE from "three";
import { AvatarMesh, type Motion } from "./Avatar";
import { MarketSquare } from "./Market";
import { JADE } from "./palette";
import { PLAZA_R, stepWalker, wrapAngle, type Obstacle } from "./sim";
import type { Pose, WorldProps } from "./types";
import { HEAR_MAX } from "./voice";
import { NPCS, npcAt, STATIC_OBSTACLES } from "./world-data";

export function WorldCanvas(props: WorldProps) {
  if (typeof document === "undefined") return null;
  return <WorldInner {...props} />;
}

function WorldInner(props: WorldProps) {
  return (
    <Canvas
      className="h-full w-full touch-none"
      dpr={[1, 1.5]}
      camera={{ fov: 42, near: 0.1, far: 90, position: [0, 8, 17] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onPointerMissed={() => props.onPick(null)}
    >
      <MarketSquare />
      <Driver {...props} />
      <ChaseCam player={props.player} camYaw={props.camYaw} live={props.live} />
      <OrbitDrag camYaw={props.camYaw} />
      <NetPump {...props} />
      <HearRing player={props.player} micOn={props.micOn} />
      <LocalAvatar {...props} />
      {props.remoteIds.map((id) => (
        <RemoteAvatar
          key={id}
          id={id}
          store={props.remotes}
          friendIds={props.friendIds}
          bubble={props.bubbles[id]}
          selected={props.selected === id}
          onPick={props.onPick}
        />
      ))}
      {NPCS.map((npc) => (
        <NpcAvatar
          key={npc.id}
          id={npc.id}
          bubble={props.bubbles[npc.id]}
          selected={props.selected === npc.id}
          onPick={props.onPick}
        />
      ))}
    </Canvas>
  );
}

function Driver(props: WorldProps) {
  const bag = useRef<Obstacle[]>(STATIC_OBSTACLES.map((o) => ({ ...o })));
  useFrame((_, dt) => {
    const body = props.player.current;
    if (body.emote && performance.now() > body.emoteUntil) body.emote = "";
    if (!props.live) {
      body.speed = 0;
      return;
    }
    const probe = props.probe.current;
    const source = probe ?? props.held.current;
    const has = (code: string) =>
      Array.isArray(source) ? source.includes(code) : source.has(code);
    let f = 0;
    let s = 0;
    if (has("KeyW") || has("ArrowUp")) f += 1;
    if (has("KeyS") || has("ArrowDown")) f -= 1;
    if (has("KeyA") || has("ArrowLeft")) s -= 1;
    if (has("KeyD") || has("ArrowRight")) s += 1;
    if (!probe) {
      f += props.joy.current.f;
      s += props.joy.current.s;
    }
    const auto = props.auto.current;
    if (Math.hypot(f, s) > 0.12) props.auto.current = null;
    else if (auto) {
      if (performance.now() > auto.until) {
        props.auto.current = null;
      } else {
        if (auto.npcId) {
          const npc = NPCS.find((n) => n.id === auto.npcId);
          if (npc) {
            const at = npcAt(npc, Date.now() / 1000);
            auto.x = at.x;
            auto.z = at.z;
          }
        }
        const dx = auto.x - body.x;
        const dz = auto.z - body.z;
        if (Math.hypot(dx, dz) < 1.6) props.auto.current = null;
        else {
          const cam = props.camYaw.current;
          const fx = -Math.sin(cam);
          const fz = -Math.cos(cam);
          const rx = Math.cos(cam);
          const rz = -Math.sin(cam);
          const inv = 1 / Math.hypot(dx, dz);
          const wx = dx * inv;
          const wz = dz * inv;
          f = wx * fx + wz * fz;
          s = wx * rx + wz * rz;
        }
      }
    }
    const obs = bag.current;
    obs.length = 0;
    for (const o of STATIC_OBSTACLES) obs.push(o);
    const t = Date.now() / 1000;
    for (const npc of NPCS) {
      const at = npcAt(npc, t);
      obs.push({ x: at.x, z: at.z, r: 0.55 });
    }
    for (const pose of props.remotes.current.values()) obs.push({ x: pose.x, z: pose.z, r: 0.5 });
    const next = stepWalker(body, props.camYaw.current, f, s, dt, obs, PLAZA_R);
    body.x = next.x;
    body.z = next.z;
    body.yaw = next.yaw;
    body.speed = next.speed;
  });
  return null;
}

const CAMERA_BLOCKERS = [
  { x: -1.55, z: 12.2, r: 0.95 },
  { x: 1.55, z: 12.2, r: 0.95 },
  { x: 0, z: 0, r: 1.7 },
];

function ChaseCam({
  player,
  camYaw,
  live,
}: {
  player: WorldProps["player"];
  camYaw: WorldProps["camYaw"];
  live: boolean;
}) {
  const dist = useRef(11);
  const height = useRef(7.6);
  const look = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, dt) => {
    const d = Math.min(dt, 0.1);
    const wantDist = live ? 6.4 : 11;
    const wantH = live ? 3.15 : 7.6;
    const k = 1 - Math.exp(-d * 3.2);
    dist.current += (wantDist - dist.current) * k;
    height.current += (wantH - height.current) * k;
    const yaw = camYaw.current;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const p = player.current;
    const cam = state.camera;
    let tx = p.x - fx * dist.current;
    let tz = p.z - fz * dist.current;
    // Keep the camera out of tall scenery (gate towers, well roof).
    for (const o of CAMERA_BLOCKERS) {
      const dx = tx - o.x;
      const dz = tz - o.z;
      const dd = Math.hypot(dx, dz);
      if (dd < o.r) {
        const k2 = dd > 1e-4 ? o.r / dd : 0;
        tx = o.x + (dd > 1e-4 ? dx * k2 : o.r);
        tz = o.z + dz * k2;
      }
    }
    cam.position.x += (tx - cam.position.x) * k;
    cam.position.y += (height.current - cam.position.y) * k;
    cam.position.z += (tz - cam.position.z) * k;
    look.set(p.x, live ? 1.45 : 0.3, p.z);
    cam.lookAt(look);
  });
  return null;
}

function OrbitDrag({ camYaw }: { camYaw: WorldProps["camYaw"] }) {
  const { gl } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    let dragging = false;
    let lastX = 0;
    const down = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 2) return;
      dragging = true;
      lastX = event.clientX;
    };
    const move = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      lastX = event.clientX;
      if (Math.abs(dx) < 0.01) return;
      camYaw.current = wrapAngle(camYaw.current - dx * 0.005);
    };
    const up = () => {
      dragging = false;
    };
    const menu = (event: Event) => event.preventDefault();
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    el.addEventListener("contextmenu", menu);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      el.removeEventListener("contextmenu", menu);
    };
  }, [gl, camYaw]);
  return null;
}

function NetPump(props: WorldProps) {
  const acc = useRef(0);
  useFrame((_, dt) => {
    if (!props.live) return;
    acc.current += dt;
    if (acc.current < 1 / 15) return;
    acc.current = 0;
    const net = props.net.current;
    if (!net) return;
    const p = props.player.current;
    net.broadcast({
      k: "p",
      x: round(p.x),
      z: round(p.z),
      yaw: round(p.yaw),
      speed: round(p.speed),
      name: props.profile.name,
      dye: props.profile.dye,
      hair: props.profile.hair,
      emote: p.emote,
      talk: props.talking.current,
      profileId: props.profile.id,
    });
  });
  return null;
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

function HearRing({ player, micOn }: { player: WorldProps["player"]; micOn: boolean }) {
  const ref = useRef<Mesh>(null);
  const on = useRef(micOn);
  on.current = micOn;
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.visible = on.current;
    mesh.position.set(player.current.x, 0.04, player.current.z);
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[HEAR_MAX - 0.12, HEAR_MAX, 56]} />
      <meshBasicMaterial color={JADE} transparent opacity={0.35} />
    </mesh>
  );
}

function LocalAvatar(props: WorldProps) {
  const group = useRef<Group>(null);
  const motion = useRef<Motion>({ walking: false, emote: "", talk: false });
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const p = props.player.current;
    g.position.set(p.x, 0, p.z);
    g.rotation.y = p.yaw + Math.PI;
    motion.current.walking = p.speed > 0.25;
    motion.current.emote = p.emote;
    motion.current.talk = props.talking.current;
  });
  return (
    <group ref={group} onClick={(event) => event.stopPropagation()}>
      <AvatarMesh dye={props.profile.dye} hair={props.profile.hair} motion={motion} />
      <Nameplate
        name={props.profile.name}
        bubble={props.bubbles.self}
        selected={props.selected === "self"}
      />
    </group>
  );
}

function RemoteAvatar({
  id,
  store,
  friendIds,
  bubble,
  selected,
  onPick,
}: {
  id: string;
  store: WorldProps["remotes"];
  friendIds: string[];
  bubble?: string;
  selected: boolean;
  onPick: (id: string) => void;
}) {
  const group = useRef<Group>(null);
  const yaw = useRef(0);
  const snapped = useRef(false);
  const motion = useRef<Motion>({ walking: false, emote: "", talk: false });
  const look = useRef({ name: "…", dye: 0, hair: 0, friend: false });
  const [, setRev] = useState(0);
  useFrame((_, dt) => {
    const pose = store.current.get(id);
    const g = group.current;
    if (!pose || !g) return;
    const d = Math.min(dt, 0.1);
    if (!snapped.current || Math.hypot(pose.x - g.position.x, pose.z - g.position.z) > 6) {
      g.position.set(pose.x, 0, pose.z);
      yaw.current = pose.yaw + Math.PI;
      snapped.current = true;
    } else {
      const k = 1 - Math.exp(-d * 10);
      g.position.x += (pose.x - g.position.x) * k;
      g.position.z += (pose.z - g.position.z) * k;
      const diff = wrapAngle(pose.yaw + Math.PI - yaw.current);
      yaw.current = wrapAngle(yaw.current + diff * k);
    }
    g.rotation.y = yaw.current;
    motion.current.walking = pose.speed > 0.25;
    motion.current.emote = pose.emote;
    motion.current.talk = pose.talk;
    const friend = friendIds.includes(pose.profileId);
    if (
      look.current.name !== pose.name ||
      look.current.dye !== pose.dye ||
      look.current.hair !== pose.hair ||
      look.current.friend !== friend
    ) {
      look.current = { name: pose.name, dye: pose.dye, hair: pose.hair, friend };
      setRev((n) => n + 1);
    }
  });
  const shown = look.current;
  return (
    <group
      ref={group}
      onClick={(event) => {
        event.stopPropagation();
        onPick(id);
      }}
    >
      <AvatarMesh dye={shown.dye} hair={shown.hair} motion={motion} />
      <Nameplate
        name={shown.name}
        sub={shown.friend ? "好友" : undefined}
        bubble={bubble}
        selected={selected}
      />
    </group>
  );
}

function NpcAvatar({
  id,
  bubble,
  selected,
  onPick,
}: {
  id: string;
  bubble?: string;
  selected: boolean;
  onPick: (id: string) => void;
}) {
  const npc = NPCS.find((n) => n.id === id)!;
  const group = useRef<Group>(null);
  const motion = useRef<Motion>({ walking: true, emote: "", talk: false });
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const at = npcAt(npc, Date.now() / 1000);
    g.position.set(at.x, 0, at.z);
    g.rotation.y = at.yaw + Math.PI;
    motion.current.walking = true;
  });
  return (
    <group
      ref={group}
      onClick={(event) => {
        event.stopPropagation();
        onPick(id);
      }}
    >
      <AvatarMesh dye={npc.dye} hair={npc.hair} motion={motion} />
      <Nameplate name={npc.name} sub="常客" bubble={bubble} selected={selected} />
    </group>
  );
}

function Nameplate({
  name,
  sub,
  bubble,
  selected,
}: {
  name: string;
  sub?: string;
  bubble?: string;
  selected?: boolean;
}) {
  return (
    <Html
      position={[0, 2.05, 0]}
      center
      distanceFactor={10}
      zIndexRange={[8, 0]}
      wrapperClass="nl-label"
    >
      <div className="pointer-events-none w-max max-w-44 text-center">
        {bubble ? (
          <div className="mb-1 rounded-xl bg-cream px-2.5 py-1 text-xs leading-snug text-ink">
            {bubble}
          </div>
        ) : null}
        <div
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${selected ? "bg-amber text-ink" : "bg-ink/80 text-cream"}`}
        >
          <span>{name}</span>
          {sub ? <span className={selected ? "text-ink/80" : "text-amber"}>{sub}</span> : null}
        </div>
      </div>
    </Html>
  );
}

export function readPose(data: unknown): Pose | null {
  if (!data || typeof data !== "object") return null;
  const msg = data as Record<string, unknown>;
  if (msg.k !== "p") return null;
  const x = num(msg.x);
  const z = num(msg.z);
  const yaw = num(msg.yaw);
  if (x === null || z === null || yaw === null) return null;
  if (Math.abs(x) > 30 || Math.abs(z) > 30) return null;
  const emote =
    msg.emote === "wave" || msg.emote === "bow" || msg.emote === "dance" ? msg.emote : "";
  return {
    x,
    z,
    yaw,
    speed: num(msg.speed) ?? 0,
    name: typeof msg.name === "string" ? msg.name.slice(0, 12) : "街坊",
    dye: clampInt(msg.dye, 0, 4),
    hair: clampInt(msg.hair, 0, 3),
    emote,
    talk: msg.talk === true,
    profileId: typeof msg.profileId === "string" ? msg.profileId.slice(0, 64) : "",
  };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function clampInt(v: unknown, min: number, max: number) {
  const n = typeof v === "number" ? v : 0;
  return Math.max(min, Math.min(max, Math.round(n)));
}
