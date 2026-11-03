/**
 * A small, friendly village church on the north edge of the market plaza.
 * Rounded toy-like shapes and bright colours to match the chibi avatars;
 * stained glass is built from tiny unlit tiles (one instanced draw call) that
 * read as glowing mosaic both outside and inside. Walls are collision via
 * sim.ts (plaza ∪ doorway ∪ nave); the roof/façade fade out while the player
 * is inside so the chase cam always sees them.
 */
import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { ALTAR_Z, BOOTH, CHURCH, insideChurch, LECTERN } from "./sim";
import { PEW_ROWS } from "./world-data";
import { OPEN_BIBLE_EVENT } from "./sanctuary-state";
import type { LocalBody } from "./types";

const { halfW: HW, front: FZ, back: BZ, wall: WT, doorHalfW: DW, doorH: DH, wallH: WH } = CHURCH;
const LEN = FZ - BZ;
const MIDZ = (FZ + BZ) / 2;
const GH = 3.1; // gable height
const WIN_Z = [-18.2, -21.4, -24.6];
const STONE = "#fff1dc";
const TRIM = "#f2b8c6";
const ROOF = "#4a7bea";
const WOOD = "#b8743f";
const GOLD = "#ffc83d";
const GLASS = ["#ff4d6d", "#ffb703", "#3a86ff", "#2ec4b6", "#8338ec", "#ff7bd5", "#7bd389", "#ffd6a5"];

type Tile = { p: [number, number, number]; s: [number, number]; ry: number; c: string };

/** Pointed-arch lancet window: a grid of tiles clipped to the lancet outline. */
function lancet(cx: number, cy: number, cz: number, ry: number, w: number, h: number, seed: number): Tile[] {
  const out: Tile[] = [];
  const t = 0.17;
  const cols = Math.round(w / t);
  const rows = Math.round(h / t);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const u = (i + 0.5) / cols - 0.5; // -0.5..0.5
      const v = (j + 0.5) / rows; // 0..1
      // Rectangle below 70%, pointed arch above.
      if (v > 0.7 && Math.abs(u) > 0.5 * (1 - (v - 0.7) / 0.3) ** 0.7) continue;
      const lx = u * w;
      const ly = cy - h / 2 + v * h;
      const ci = (i * 3 + j * 5 + seed + (Math.abs(u) < 0.12 ? 2 : 0)) % GLASS.length;
      out.push({
        p: [cx + Math.cos(ry) * lx, ly, cz - Math.sin(ry) * lx],
        s: [t * 0.88, t * 0.88],
        ry,
        c: GLASS[ci],
      });
    }
  }
  return out;
}

/** Rose window: concentric rings of tiles, petals alternating colours. */
function rose(cx: number, cy: number, cz: number, r: number): Tile[] {
  const out: Tile[] = [{ p: [cx, cy, cz], s: [r * 0.28, r * 0.28], ry: 0, c: GOLD }];
  const rings = [
    { rr: 0.34, n: 8 },
    { rr: 0.6, n: 14 },
    { rr: 0.86, n: 20 },
  ];
  rings.forEach(({ rr, n }, k) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + k * 0.2;
      const sz = r * (0.2 + k * 0.02);
      out.push({
        p: [cx + Math.cos(a) * rr * r, cy + Math.sin(a) * rr * r, cz],
        s: [sz, sz],
        ry: 0,
        c: GLASS[(i + k * 3) % GLASS.length],
      });
    }
  });
  return out;
}

function Mosaic() {
  const tiles = useMemo(() => {
    const t: Tile[] = [];
    // Three lancets on each side wall.
    for (const z of WIN_Z) {
      t.push(...lancet(-HW, 3.5, z, Math.PI / 2, 1.3, 3.4, Math.round(-z)));
      t.push(...lancet(HW, 3.5, z, -Math.PI / 2, 1.3, 3.4, Math.round(-z) + 3));
    }
    // Extra lancet on the east wall by the lectern.
    t.push(...lancet(HW, 3.5, -27.6, -Math.PI / 2, 1.3, 3.4, 5));
    // Rose window in the front gable, a small one above the altar cross.
    t.push(...rose(0, WH + 1.05, FZ, 1.15));
    t.push(...rose(0, WH - 0.65, BZ, 0.6));
    return t;
  }, []);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    tiles.forEach((tile, i) => {
      o.position.set(...tile.p);
      o.rotation.set(0, tile.ry, 0);
      o.scale.set(tile.s[0], tile.s[1], 1);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.set(tile.c));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [tiles]);
  // Depth slightly thicker than the wall so the glass shows on both faces.
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, tiles.length]} frustumCulled={false}>
      <boxGeometry args={[1, 1, WT + 0.06]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

function Block({
  p,
  s,
  color,
  r = 0.06,
}: {
  p: [number, number, number];
  s: [number, number, number];
  color: string;
  r?: number;
}) {
  return (
    <RoundedBox position={p} args={s} radius={r} smoothness={2}>
      <meshToonMaterial color={color} />
    </RoundedBox>
  );
}

function Cross({ p, size, color = GOLD, glow = false }: { p: [number, number, number]; size: number; color?: string; glow?: boolean }) {
  const mat = glow ? (
    <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.45} metalness={0.3} roughness={0.4} />
  ) : (
    <meshToonMaterial color={color} />
  );
  return (
    <group position={p}>
      <RoundedBox args={[size * 0.16, size, size * 0.16]} radius={size * 0.05} smoothness={2}>
        {mat}
      </RoundedBox>
      <RoundedBox position={[0, size * 0.2, 0]} args={[size * 0.62, size * 0.16, size * 0.16]} radius={size * 0.05} smoothness={2}>
        {mat}
      </RoundedBox>
    </group>
  );
}

function Pew({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <Block p={[0, 0.42, 0]} s={[2.2, 0.12, 0.5]} color={WOOD} />
      <Block p={[0, 0.78, 0.24]} s={[2.2, 0.6, 0.1]} color={WOOD} />
      <Block p={[-1.02, 0.4, 0]} s={[0.14, 0.8, 0.55]} color="#9a5c2e" />
      <Block p={[1.02, 0.4, 0]} s={[0.14, 0.8, 0.55]} color="#9a5c2e" />
    </group>
  );
}

function Candle({ p, h = 0.32 }: { p: [number, number, number]; h?: number }) {
  return (
    <group position={p}>
      <mesh position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.05, 0.05, h, 10]} />
        <meshToonMaterial color="#fffaf0" />
      </mesh>
      <mesh position={[0, h + 0.06, 0]} scale={[1, 1.6, 1]}>
        <sphereGeometry args={[0.04, 10, 8]} />
        <meshBasicMaterial color="#ffb02e" toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Façade + roof + tower: faded while the player is inside. */
function Shell({ fadeRef }: { fadeRef: MutableRefObject<THREE.Group | null> }) {
  const gable = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-HW - 0.15, 0);
    s.lineTo(HW + 0.15, 0);
    s.lineTo(0, GH);
    s.closePath();
    return s;
  }, []);
  const roofLen = LEN + 0.6;
  const slope = Math.atan2(GH, HW);
  const slab = Math.hypot(GH, HW) + 0.4;
  const sideW = HW - DW;
  return (
    <group ref={fadeRef}>
      {/* Façade with doorway */}
      <Block p={[-(DW + sideW / 2), WH / 2, FZ]} s={[sideW + WT, WH, WT]} color={STONE} />
      <Block p={[DW + sideW / 2, WH / 2, FZ]} s={[sideW + WT, WH, WT]} color={STONE} />
      <Block p={[0, DH + (WH - DH) / 2, FZ]} s={[DW * 2 + 0.02, WH - DH, WT]} color={STONE} />
      {/* Rounded arch trim around the door */}
      <mesh position={[0, DH, FZ + WT / 2 + 0.03]} rotation={[0, 0, 0]}>
        <torusGeometry args={[DW, 0.14, 8, 24, Math.PI]} />
        <meshToonMaterial color={TRIM} />
      </mesh>
      <Block p={[-DW, DH / 2, FZ + WT / 2 + 0.03]} s={[0.24, DH, 0.12]} color={TRIM} />
      <Block p={[DW, DH / 2, FZ + WT / 2 + 0.03]} s={[0.24, DH, 0.12]} color={TRIM} />
      {/* Gables */}
      <mesh position={[0, WH, FZ - WT / 2]}>
        <extrudeGeometry args={[gable, { depth: WT, bevelEnabled: false }]} />
        <meshToonMaterial color={STONE} />
      </mesh>
      <mesh position={[0, WH, BZ - WT / 2]}>
        <extrudeGeometry args={[gable, { depth: WT, bevelEnabled: false }]} />
        <meshToonMaterial color={STONE} />
      </mesh>
      {/* Roof */}
      <group position={[0, WH, MIDZ]}>
        <group position={[-HW / 2, GH / 2 + 0.12, 0]} rotation={[0, 0, slope]}>
          <Block p={[0, 0, 0]} s={[slab, 0.22, roofLen]} color={ROOF} r={0.09} />
        </group>
        <group position={[HW / 2, GH / 2 + 0.12, 0]} rotation={[0, 0, -slope]}>
          <Block p={[0, 0, 0]} s={[slab, 0.22, roofLen]} color={ROOF} r={0.09} />
        </group>
      </group>
      {/* Bell tower over the entrance, spire and cross */}
      <group position={[0, 0, FZ - 1.4]}>
        <Block p={[0, WH + 3.4, 0]} s={[2.4, 2.2, 2.4]} color={STONE} />
        <mesh position={[0, WH + 3.4, 1.21]}>
          <circleGeometry args={[0.6, 24]} />
          <meshToonMaterial color="#4a3a5a" />
        </mesh>
        <mesh position={[0, WH + 3.25, 1.12]}>
          <sphereGeometry args={[0.42, 16, 12]} />
          <meshToonMaterial color={GOLD} />
        </mesh>
        <mesh position={[0, WH + 5.8, 0]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[1.8, 2.8, 4]} />
          <meshToonMaterial color={ROOF} />
        </mesh>
        <Cross p={[0, WH + 7.8, 0]} size={1.2} />
      </group>
    </group>
  );
}

export function Church({ player }: { player: MutableRefObject<LocalBody> }) {
  const fadeRef = useRef<THREE.Group | null>(null);
  const fade = useRef(1);
  useFrame((_, dt) => {
    const p = player.current;
    const want = insideChurch(p.x, p.z) ? 0.12 : 1;
    const next = fade.current + (want - fade.current) * (1 - Math.exp(-Math.min(dt, 0.1) * 8));
    if (Math.abs(next - fade.current) < 1e-3 && fade.current === want) return;
    fade.current = Math.abs(next - want) < 0.005 ? want : next;
    fadeRef.current?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const m = mesh.material as THREE.Material;
      const clear = fade.current < 0.999;
      if (m.transparent !== clear) {
        m.transparent = clear;
        m.needsUpdate = true;
      }
      m.depthWrite = !clear;
      m.opacity = fade.current;
    });
  });
  return (
    <group>
      {/* Floor, aisle carpet, chancel step */}
      <Block p={[0, 0.03, MIDZ]} s={[HW * 2, 0.06, LEN]} color="#f6dcb5" r={0.02} />
      <Block p={[0, 0.07, (FZ + ALTAR_Z + 1.4) / 2]} s={[1.5, 0.03, FZ - ALTAR_Z - 1.6]} color="#e8453c" r={0.01} />
      <Block p={[0, 0.1, BZ + 2.0]} s={[HW * 2 - 0.4, 0.2, 3.6]} color="#f0c9a0" r={0.05} />
      {/* Side + back walls (stay solid; camera is clamped inside) */}
      <Block p={[-HW, WH / 2, MIDZ]} s={[WT, WH, LEN + WT]} color={STONE} />
      <Block p={[HW, WH / 2, MIDZ]} s={[WT, WH, LEN + WT]} color={STONE} />
      <Block p={[0, WH / 2, BZ]} s={[HW * 2 + WT, WH, WT]} color={STONE} />
      {/* Buttress bumps outside for a cute toy silhouette */}
      {WIN_Z.flatMap((z) => [-1, 1].map((sx) => (
        <Block key={`${z}${sx}`} p={[sx * (HW + 0.28), 2, z - 1.6]} s={[0.4, 4, 0.6]} color={TRIM} r={0.14} />
      )))}
      <Shell fadeRef={fadeRef} />
      <Mosaic />
      {/* Pews either side of the centre aisle */}
      {PEW_ROWS.flatMap((z) => [-2.65, 2.65].map((x) => <Pew key={`${x}${z}`} x={x} z={z} />))}
      {/* Altar with candles and the cross centred on the apse wall */}
      <Block p={[0, 0.65, ALTAR_Z]} s={[2.2, 0.9, 0.9]} color="#fff8ee" r={0.1} />
      <Block p={[0, 1.13, ALTAR_Z]} s={[2.35, 0.06, 1.0]} color={GOLD} r={0.02} />
      <Block p={[0, 0.65, ALTAR_Z + 0.46]} s={[0.8, 0.5, 0.02]} color="#e8453c" r={0.01} />
      {[-0.85, -0.45, 0.45, 0.85].map((x) => (
        <Candle key={x} p={[x, 1.16, ALTAR_Z]} />
      ))}
      <Cross p={[0, 3.3, BZ + WT / 2 + 0.14]} size={2.8} glow />
      {/* Candle stands either side of the chancel */}
      {[-2.4, 2.4].map((x) => (
        <group key={x}>
          <Block p={[x, 0.55, ALTAR_Z + 0.6]} s={[0.5, 0.9, 0.5]} color={WOOD} r={0.08} />
          <Candle p={[x - 0.12, 1.0, ALTAR_Z + 0.6]} h={0.22} />
          <Candle p={[x + 0.12, 1.0, ALTAR_Z + 0.6]} h={0.3} />
        </group>
      ))}
      {/* One warm interior light; the glass itself is unlit/emissive. */}
      <pointLight position={[0, 4.6, MIDZ + 1.5]} color="#ffcf8a" intensity={7} distance={18} decay={1.5} />
      <pointLight position={[0, 3.6, ALTAR_Z + 1]} color="#ffe2a8" intensity={5} distance={11} decay={1.6} />
      <Lectern />
      <Confessional />
    </group>
  );
}

/** Lectern with an open, softly glowing Bible; click it (when near) to read. */
function Lectern() {
  const glow = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (glow.current) glow.current.opacity = 0.35 + 0.2 * Math.sin(clock.elapsedTime * 2);
  });
  const open = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    window.dispatchEvent(new Event(OPEN_BIBLE_EVENT));
  };
  return (
    <group position={[LECTERN.x, 0, LECTERN.z]} rotation={[0, Math.PI / 2 + 0.5, 0]}>
      <Block p={[0, 0.08, 0]} s={[0.8, 0.16, 0.6]} color="#9a5c2e" r={0.06} />
      <Block p={[0, 0.6, 0]} s={[0.22, 1.0, 0.22]} color={WOOD} r={0.08} />
      <group position={[0, 1.15, 0]} rotation={[-0.45, 0, 0]}>
        <Block p={[0, 0, 0]} s={[0.95, 0.08, 0.7]} color={WOOD} r={0.03} />
        <group onClick={open} onPointerOver={() => (document.body.style.cursor = "pointer")} onPointerOut={() => (document.body.style.cursor = "")}>
          {/* Open book: red cover + two cream pages with a gold ribbon */}
          <Block p={[0, 0.07, 0]} s={[0.86, 0.05, 0.6]} color="#c62f3a" r={0.02} />
          {[-0.2, 0.2].map((x) => (
            <mesh key={x} position={[x, 0.11, 0]} rotation={[-Math.PI / 2, x < 0 ? 0.12 : -0.12, 0]}>
              <planeGeometry args={[0.38, 0.54]} />
              <meshBasicMaterial color="#fff6dc" toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
          ))}
          <Block p={[0.02, 0.12, 0.1]} s={[0.04, 0.02, 0.5]} color={GOLD} r={0.005} />
          <mesh position={[0, 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1.25, 0.9]} />
            <meshBasicMaterial ref={glow} color="#ffe58a" transparent opacity={0.4} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      </group>
      <pointLight position={[0, 1.6, 0]} color="#fff0b0" intensity={1.6} distance={3.2} decay={1.5} />
    </group>
  );
}

/** Rounded wooden confessional booth with a striped curtain doorway (+x). */
function Confessional() {
  const { w, d, h } = BOOTH;
  return (
    <group position={[BOOTH.x, 0, BOOTH.z]}>
      <Block p={[0, h / 2, -d / 2 + 0.08]} s={[w, h, 0.16]} color="#a0602f" r={0.07} />
      <Block p={[0, h / 2, d / 2 - 0.08]} s={[w, h, 0.16]} color="#a0602f" r={0.07} />
      <Block p={[-w / 2 + 0.08, h / 2, 0]} s={[0.16, h, d]} color="#8a4f26" r={0.07} />
      {/* Front frame posts */}
      <Block p={[w / 2 - 0.08, h / 2, -d / 2 + 0.25]} s={[0.2, h, 0.5]} color={WOOD} r={0.07} />
      <Block p={[w / 2 - 0.08, h / 2, d / 2 - 0.25]} s={[0.2, h, 0.5]} color={WOOD} r={0.07} />
      {/* Rounded roof cap + little cross */}
      <Block p={[0, h + 0.12, 0]} s={[w + 0.25, 0.26, d + 0.25]} color="#7a3f1d" r={0.12} />
      <Cross p={[w / 2 - 0.1, h + 0.75, 0]} size={0.6} />
      {/* Purple curtain in gentle folds */}
      {[-0.5, -0.25, 0, 0.25, 0.5].map((z, i) => (
        <mesh key={z} position={[w / 2 - 0.02, (h - 0.3) / 2 + 0.05, z]}>
          <cylinderGeometry args={[0.13, 0.13, h - 0.3, 10]} />
          <meshToonMaterial color={i % 2 ? "#8338ec" : "#a465ff"} />
        </mesh>
      ))}
      {/* Sign + warm decorative lamp (no occupancy: every visitor gets a private booth) */}
      <Block p={[w / 2 + 0.02, h - 0.12, 0]} s={[0.06, 0.32, 1.2]} color="#fff1dc" r={0.04} />
      <mesh position={[w / 2 + 0.06, h - 0.12, 0.72]}>
        <sphereGeometry args={[0.09, 12, 10]} />
        <meshBasicMaterial color="#ffd27a" toneMapped={false} />
      </mesh>
    </group>
  );
}
