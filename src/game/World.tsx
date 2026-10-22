import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Group, Mesh, InstancedMesh } from "three";
import * as THREE from "three";
import { AvatarMesh, type Motion } from "./Avatar";
import { AMBER, CREAM, JADE, LEAF, LEAF_LIT, NIGHT, STONE, WATER, WOOD } from "./palette";
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
      <color attach="background" args={[NIGHT]} />
      <fog attach="fog" args={[NIGHT, 16, 42]} />
      <hemisphereLight args={["#c5d0d8", "#3a2c22", 0.72]} />
      <ambientLight intensity={0.18} />
      <directionalLight position={[8, 14, 6]} intensity={0.42} color="#d5e0e8" />
      <Plaza />
      <Stars />
      <StringLights />
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
    const has = (code: string) => (Array.isArray(source) ? source.includes(code) : source.has(code));
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
    const tx = p.x - fx * dist.current;
    const tz = p.z - fz * dist.current;
    cam.position.x += (tx - cam.position.x) * k;
    cam.position.y += (height.current - cam.position.y) * k;
    cam.position.z += (tz - cam.position.z) * k;
    look.set(p.x, live ? 1.15 : 0.3, p.z);
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
      <Nameplate name={props.profile.name} bubble={props.bubbles.self} selected={props.selected === "self"} />
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
    <group ref={group} onClick={(event) => { event.stopPropagation(); onPick(id); }}>
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
    <group ref={group} onClick={(event) => { event.stopPropagation(); onPick(id); }}>
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
  // Stable portal: stops drei Html re-creating its root after mount (empty own label).
  const gl = useThree((state) => state.gl);
  const portal = useMemo(() => ({ current: gl.domElement.parentElement as HTMLElement }), [gl]);
  return (
    <Html portal={portal} position={[0, 2.05, 0]} center distanceFactor={10} zIndexRange={[8, 0]} wrapperClass="nl-label">
      <div className="pointer-events-none w-max max-w-44 text-center">
        {bubble ? (
          <div className="mb-1 rounded-xl bg-cream px-2.5 py-1 text-xs leading-snug text-ink">{bubble}</div>
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

function Plaza() {
  const ground = useMemo(() => makeGround(), []);
  useEffect(() => () => ground.dispose(), [ground]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[PLAZA_R + 0.2, 64]} />
        <meshStandardMaterial map={ground} roughness={1} metalness={0} emissive="#2a3330" emissiveIntensity={0.28} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[PLAZA_R - 0.35, PLAZA_R, 64]} />
        <meshStandardMaterial color={STONE} roughness={0.9} />
      </mesh>
      <Fountain />
      <MoonGate />
      <Stall position={[-8.3, 0, -0.6]} rotationY={Math.PI / 2} label="茶檔" awning={AMBER} />
      <Stall position={[8.3, 0, -0.6]} rotationY={-Math.PI / 2} label="唱片" awning={JADE} />
      <Stall position={[0, 0, -8.5]} rotationY={0} label="花檔" awning={CREAM} />
      <Lantern position={[-5.6, 0, 5.2]} />
      <Lantern position={[5.6, 0, 5.2]} />
      <Lantern position={[-6.2, 0, -5.4]} />
      <Lantern position={[6.2, 0, -5.4]} />
      <Tree position={[-11.5, 0, 6.5]} />
      <Tree position={[11.6, 0, 6.2]} />
      <Tree position={[-12.2, 0, -6.4]} />
      <Tree position={[12.2, 0, -6.8]} />
      <Tree position={[0, 0, -12.6]} />
      <Bench position={[-3.3, 0, 3.5]} />
      <Bench position={[3.3, 0, 3.5]} flip />
      <mesh position={[-18, 14, -22]}>
        <sphereGeometry args={[1.5, 24, 16]} />
        <meshBasicMaterial color={CREAM} />
      </mesh>
    </group>
  );
}

function makeGround() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const g = canvas.getContext("2d");
  if (!g) return new THREE.CanvasTexture(canvas);
  g.fillStyle = "#1a211e";
  g.fillRect(0, 0, 512, 512);
  const rad = g.createRadialGradient(256, 256, 30, 256, 256, 250);
  rad.addColorStop(0, "#2a3832");
  rad.addColorStop(1, "#1a211e");
  g.fillStyle = rad;
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = "rgba(232,160,74,0.45)";
  g.lineWidth = 4;
  g.beginPath();
  g.arc(256, 256, 148, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = "rgba(243,238,228,0.12)";
  g.lineWidth = 2;
  g.beginPath();
  g.arc(256, 256, 214, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 90; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const r = 20 + Math.random() * 210;
    g.fillStyle = `rgba(243,238,228,${0.02 + Math.random() * 0.05})`;
    g.beginPath();
    g.arc(256 + Math.cos(a) * r, 256 + Math.sin(a) * r, 1 + Math.random() * 2.2, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function Fountain() {
  const koi = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!koi.current) return;
    koi.current.rotation.y = clock.elapsedTime * 0.35;
  });
  return (
    <group>
      <mesh position={[0, 0.28, 0]}>
        <cylinderGeometry args={[1.7, 1.9, 0.5, 28]} />
        <meshStandardMaterial color={STONE} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.58, 0]}>
        <cylinderGeometry args={[1.15, 1.2, 0.12, 28]} />
        <meshStandardMaterial color={WATER} metalness={0.45} roughness={0.18} />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <cylinderGeometry args={[0.16, 0.22, 0.7, 10]} />
        <meshStandardMaterial color={STONE} />
      </mesh>
      <group ref={koi} position={[0, 0.66, 0]}>
        {[0, 1, 2].map((i) => {
          const a = (i / 3) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 0.72, 0, Math.sin(a) * 0.72]}>
              <sphereGeometry args={[0.09, 10, 8]} />
              <meshStandardMaterial color={i === 1 ? CREAM : AMBER} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

function MoonGate() {
  return (
    <group position={[0, 0, 12.2]}>
      <mesh position={[-1.55, 1.15, 0]}>
        <boxGeometry args={[0.4, 2.3, 0.4]} />
        <meshStandardMaterial color={STONE} />
      </mesh>
      <mesh position={[1.55, 1.15, 0]}>
        <boxGeometry args={[0.4, 2.3, 0.4]} />
        <meshStandardMaterial color={STONE} />
      </mesh>
      <mesh position={[0, 2.25, 0]}>
        <torusGeometry args={[1.35, 0.11, 8, 20, Math.PI]} />
        <meshStandardMaterial color={STONE} />
      </mesh>
    </group>
  );
}

function Stall({
  position,
  rotationY,
  label,
  awning,
}: {
  position: [number, number, number];
  rotationY: number;
  label: string;
  awning: string;
}) {
  const tex = useSign(label);
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[2.5, 1.1, 1.25]} />
        <meshStandardMaterial color="#2a3338" roughness={0.86} />
      </mesh>
      <mesh position={[0, 1.22, 0.05]} rotation={[0.2, 0, 0]}>
        <boxGeometry args={[2.8, 0.08, 1.55]} />
        <meshStandardMaterial color={awning} roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.55, 0.7]}>
        <planeGeometry args={[1.35, 0.62]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

function useSign(label: string) {
  const tex = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const g = canvas.getContext("2d");
    if (g) {
      g.fillStyle = "#12161a";
      g.fillRect(0, 0, 256, 128);
      g.fillStyle = "#f3eee4";
      g.font = "700 72px 'Noto Sans TC', sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(label, 128, 68);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [label]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

function Lantern({ position }: { position: [number, number, number] }) {
  const light = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (!light.current) return;
    light.current.intensity = 2.15 + Math.sin(clock.elapsedTime * 2.1 + position[0]) * 0.28;
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.75, 0]}>
        <cylinderGeometry args={[0.05, 0.07, 1.5, 8]} />
        <meshStandardMaterial color={WOOD} />
      </mesh>
      <mesh position={[0, 1.62, 0]}>
        <sphereGeometry args={[0.16, 12, 10]} />
        <meshStandardMaterial color={AMBER} emissive={AMBER} emissiveIntensity={1.5} />
      </mesh>
      <pointLight ref={light} position={[0, 1.62, 0]} color={AMBER} intensity={2.2} distance={8.5} decay={2} />
    </group>
  );
}

function Tree({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.09, 0.14, 1.4, 6]} />
        <meshStandardMaterial color={WOOD} />
      </mesh>
      <mesh position={[0, 1.7, 0]}>
        <sphereGeometry args={[0.55, 12, 10]} />
        <meshStandardMaterial color={LEAF} />
      </mesh>
      <mesh position={[0.22, 2.05, 0.08]}>
        <sphereGeometry args={[0.36, 10, 8]} />
        <meshStandardMaterial color={LEAF_LIT} />
      </mesh>
    </group>
  );
}

function Bench({ position, flip }: { position: [number, number, number]; flip?: boolean }) {
  return (
    <group position={position} rotation={[0, flip ? Math.PI : 0, 0]}>
      <mesh position={[0, 0.38, 0]}>
        <boxGeometry args={[1.2, 0.08, 0.4]} />
        <meshStandardMaterial color={WOOD} />
      </mesh>
      <mesh position={[0, 0.7, -0.16]}>
        <boxGeometry args={[1.2, 0.4, 0.08]} />
        <meshStandardMaterial color={WOOD} />
      </mesh>
    </group>
  );
}

function Stars() {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(160 * 3);
    for (let i = 0; i < 160; i += 1) {
      const r = 28 + Math.random() * 16;
      const a = Math.random() * Math.PI * 2;
      arr[i * 3] = Math.cos(a) * r;
      arr[i * 3 + 1] = 6 + Math.random() * 16;
      arr[i * 3 + 2] = Math.sin(a) * r;
    }
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, []);
  return (
    <points geometry={geo}>
      <pointsMaterial color={CREAM} size={0.07} sizeAttenuation />
    </points>
  );
}

function StringLights() {
  const ref = useRef<InstancedMesh>(null);
  const count = 11;
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i += 1) {
      const t = i / (count - 1);
      dummy.position.set(-7 + t * 14, 3.15 + Math.sin(t * Math.PI) * 0.7, -3.4);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <sphereGeometry args={[0.07, 8, 8]} />
      <meshStandardMaterial color={AMBER} emissive={AMBER} emissiveIntensity={1.6} />
    </instancedMesh>
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
  const emote = msg.emote === "wave" || msg.emote === "bow" || msg.emote === "dance" ? msg.emote : "";
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
