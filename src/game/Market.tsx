import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PLAZA_R } from "./sim";

/**
 * Cute, colourful medieval market square. Purely decorative: every solid prop
 * sits on the footprint of an existing STATIC_OBSTACLES entry or outside the
 * walkable plaza radius, so collision and walkable space are unchanged.
 */

const SKY_TOP = "#6fb7ff";
const SKY_HORIZON = "#ffd6a0";
const STONE = "#c9b8a3";
const STONE_DARK = "#9c8a76";
const TIMBER = "#6b3f22";
const PLASTER = ["#fff3d6", "#ffe1e8", "#e3f4ff", "#fff0b8", "#e6ffd9"] as const;
const ROOFS = ["#e8453c", "#3a6ee8", "#ff8a2b", "#8a4fd6", "#2fa36b"] as const;
const WATER = "#4fc3f7";
const GOLD = "#ffc23d";

export function MarketSquare() {
  return (
    <group>
      <Sky />
      <hemisphereLight args={["#fff1d6", "#8a6a4a", 0.95]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[10, 16, 8]} intensity={1.15} color="#fff2d9" />
      <Ground />
      <Well />
      <Gatehouse />
      <Stall
        position={[-8.3, 0, -0.6]}
        rotationY={Math.PI / 2}
        label="茶檔"
        stripes={["#ff5a5a", "#fff6e6"]}
        goods="tea"
      />
      <Stall
        position={[8.3, 0, -0.6]}
        rotationY={-Math.PI / 2}
        label="唱片"
        stripes={["#3a8bff", "#fff6e6"]}
        goods="records"
      />
      <Stall
        position={[0, 0, -8.5]}
        rotationY={0}
        label="花檔"
        stripes={["#2fbf71", "#fff6e6"]}
        goods="flowers"
      />
      <LampPost position={[-5.6, 0, 5.2]} />
      <LampPost position={[5.6, 0, 5.2]} />
      <LampPost position={[-6.2, 0, -5.4]} lit />
      <LampPost position={[6.2, 0, -5.4]} lit />
      <Houses />
      <Bunting from={[-6.2, -5.4]} to={[6.2, -5.4]} />
      <Clouds />
    </group>
  );
}

function Sky() {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 256;
    const g = c.getContext("2d");
    if (g) {
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, SKY_TOP);
      grad.addColorStop(0.62, "#bfe2ff");
      grad.addColorStop(1, SKY_HORIZON);
      g.fillStyle = grad;
      g.fillRect(0, 0, 4, 256);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <>
      <color attach="background" args={["#9fd3ff"]} />
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[60, 32, 16]} />
        <meshBasicMaterial map={tex} side={THREE.BackSide} fog={false} depthWrite={false} />
      </mesh>
      <fog attach="fog" args={["#ffe2bd", 30, 75]} />
      <mesh position={[-24, 22, -40]}>
        <sphereGeometry args={[3, 24, 16]} />
        <meshBasicMaterial color="#fff2a8" fog={false} />
      </mesh>
    </>
  );
}

function Clouds() {
  const spots: [number, number, number, number][] = [
    [-20, 18, -35, 1.2],
    [8, 21, -42, 1.5],
    [28, 17, -20, 1],
    [-34, 16, 6, 1.3],
    [30, 19, 18, 1.1],
  ];
  return (
    <group>
      {spots.map(([x, y, z, s], i) => (
        <group key={i} position={[x, y, z]} scale={s}>
          {[
            [0, 0, 0, 2],
            [1.8, -0.3, 0.2, 1.4],
            [-1.8, -0.4, 0, 1.3],
            [0.6, 0.9, 0, 1.3],
          ].map(([cx, cy, cz, r], j) => (
            <mesh key={j} position={[cx!, cy!, cz!]}>
              <sphereGeometry args={[r!, 16, 12]} />
              <meshBasicMaterial color="#ffffff" fog={false} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Ground() {
  const tex = useMemo(() => makeCobbles(), []);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <circleGeometry args={[40, 48]} />
        <meshToonMaterial color="#8fd16a" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[PLAZA_R + 2.6, 64]} />
        <meshStandardMaterial map={tex} roughness={0.95} />
      </mesh>
      {/* Low kerb marking the edge of the square */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[PLAZA_R - 0.3, PLAZA_R + 0.05, 72]} />
        <meshToonMaterial color={STONE_DARK} />
      </mesh>
    </group>
  );
}

function makeCobbles() {
  const size = 1024;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  if (!g) return new THREE.CanvasTexture(c);
  g.fillStyle = "#8a7864";
  g.fillRect(0, 0, size, size);
  const tones = ["#d9c7ae", "#cdb89c", "#e3d3bb", "#c4ad91", "#d6bfa3", "#e0c9a6"];
  const cell = 16;
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let y = 0; y < size; y += cell * 0.8) {
    const off = Math.round(y / (cell * 0.8)) % 2 ? cell / 2 : 0;
    for (let x = -cell; x < size + cell; x += cell) {
      const cx = x + off + (rnd() - 0.5) * 5;
      const cy = y + (rnd() - 0.5) * 5;
      g.fillStyle = tones[Math.floor(rnd() * tones.length)]!;
      g.beginPath();
      g.ellipse(cx, cy, cell * 0.44, cell * 0.36, rnd() * 0.6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.22)";
      g.beginPath();
      g.ellipse(cx - 3, cy - 3, cell * 0.18, cell * 0.12, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Decorative rings around the well
  const mid = size / 2;
  g.strokeStyle = "#b5523a";
  g.lineWidth = 10;
  g.beginPath();
  g.arc(mid, mid, 150, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = "#f0c64a";
  g.lineWidth = 6;
  g.beginPath();
  g.arc(mid, mid, 168, 0, Math.PI * 2);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function Well() {
  const fish = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (fish.current) fish.current.rotation.y = clock.elapsedTime * 0.35;
  });
  return (
    <group>
      {/* Stone basin built from chunky blocks (same 1.9 footprint as before) */}
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * 1.6, 0.32, Math.sin(a) * 1.6]}
            rotation={[0, -a, 0]}
          >
            <boxGeometry args={[0.55, 0.64, 0.66]} />
            <meshToonMaterial color={i % 2 ? STONE : "#d8c9b4"} />
          </mesh>
        );
      })}
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[1.35, 1.35, 0.1, 28]} />
        <meshStandardMaterial color={WATER} roughness={0.15} metalness={0.2} />
      </mesh>
      <group ref={fish} position={[0, 0.58, 0]}>
        {[0, 1, 2].map((i) => {
          const a = (i / 3) * Math.PI * 2;
          return (
            <mesh
              key={i}
              position={[Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8]}
              scale={[1, 0.6, 1.6]}
            >
              <sphereGeometry args={[0.1, 10, 8]} />
              <meshToonMaterial color={i === 1 ? "#ffffff" : "#ff8a2b"} />
            </mesh>
          );
        })}
      </group>
      {/* Timber posts + little pointed roof */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 1.25, 1.35, 0]}>
          <boxGeometry args={[0.16, 1.5, 0.16]} />
          <meshToonMaterial color={TIMBER} />
        </mesh>
      ))}
      <mesh position={[0, 2.05, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.07, 0.07, 2.6, 10]} />
        <meshToonMaterial color={TIMBER} />
      </mesh>
      <mesh position={[0, 1.75, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.6, 4]} />
        <meshBasicMaterial color="#3b2a1a" />
      </mesh>
      <mesh position={[0, 1.42, 0]}>
        <cylinderGeometry args={[0.13, 0.11, 0.2, 10]} />
        <meshToonMaterial color="#a8693a" />
      </mesh>
      <mesh position={[0, 2.6, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[1.25, 0.9, 4]} />
        <meshToonMaterial color="#e8453c" />
      </mesh>
      <mesh position={[0, 3.12, 0]}>
        <sphereGeometry args={[0.11, 12, 10]} />
        <meshToonMaterial color={GOLD} />
      </mesh>
    </group>
  );
}

function Gatehouse() {
  // Posts stay at the old gate obstacle positions (x = ±1.55, z = 12.15).
  return (
    <group position={[0, 0, 12.2]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 1.55, 0, 0]}>
          <mesh position={[0, 0.95, 0]}>
            <cylinderGeometry args={[0.3, 0.36, 1.9, 12]} />
            <meshToonMaterial color={STONE} />
          </mesh>
          <mesh position={[0, 2.15, 0]}>
            <coneGeometry args={[0.44, 0.6, 12]} />
            <meshToonMaterial color="#3a6ee8" />
          </mesh>
          <mesh position={[0, 2.5, 0]}>
            <sphereGeometry args={[0.07, 10, 8]} />
            <meshToonMaterial color={s < 0 ? "#ff5a5a" : GOLD} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

type Goods = "tea" | "records" | "flowers";

function Stall({
  position,
  rotationY,
  label,
  stripes,
  goods,
}: {
  position: [number, number, number];
  rotationY: number;
  label: string;
  stripes: [string, string];
  goods: Goods;
}) {
  const sign = useSign(label);
  const awning = useStripes(stripes);
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Wooden counter */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[2.5, 1, 1.15]} />
        <meshToonMaterial color="#b9763f" />
      </mesh>
      <mesh position={[0, 1.03, 0.05]}>
        <boxGeometry args={[2.65, 0.08, 1.3]} />
        <meshToonMaterial color="#8a5128" />
      </mesh>
      {[-1.2, 1.2].map((x) =>
        [-0.5, 0.5].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 1.25, z]}>
            <cylinderGeometry args={[0.06, 0.06, 2.5, 8]} />
            <meshToonMaterial color={TIMBER} />
          </mesh>
        )),
      )}
      {/* Striped sloped awning with scalloped front */}
      <mesh position={[0, 2.45, 0.1]} rotation={[0.28, 0, 0]}>
        <boxGeometry args={[2.9, 0.06, 1.7]} />
        <meshToonMaterial map={awning} />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} position={[-1.27 + i * 0.363, 2.18, 0.94]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.18, 12, 0, Math.PI]} />
          <meshToonMaterial color={stripes[i % 2]} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh position={[0, 2.85, -0.42]}>
        <planeGeometry args={[1.35, 0.62]} />
        <meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>
      <StallGoods goods={goods} />
      {/* Crates & barrel tucked beside the counter, inside the stall footprint */}
      <mesh position={[-1.05, 0.22, -0.45]} rotation={[0, 0.3, 0]}>
        <boxGeometry args={[0.42, 0.42, 0.42]} />
        <meshToonMaterial color="#d49a5a" />
      </mesh>
      <mesh position={[1.05, 0.3, -0.42]}>
        <cylinderGeometry args={[0.25, 0.25, 0.6, 14]} />
        <meshToonMaterial color="#9a5b2c" />
      </mesh>
      {[0.12, 0.48].map((y) => (
        <mesh key={y} position={[1.05, y, -0.42]}>
          <torusGeometry args={[0.255, 0.02, 6, 16]} />
          <meshToonMaterial color="#4a4a52" />
        </mesh>
      ))}
    </group>
  );
}

function StallGoods({ goods }: { goods: Goods }) {
  const items = [-0.8, -0.27, 0.27, 0.8];
  if (goods === "tea") {
    return (
      <group>
        {items.map((x, i) => (
          <group key={x} position={[x, 1.17, 0.2]}>
            <mesh>
              <sphereGeometry args={[0.13, 14, 10]} />
              <meshToonMaterial color={["#ffffff", "#7ec8ff", "#ffb3c7", "#fff08a"][i]!} />
            </mesh>
            <mesh position={[0.15, 0.02, 0]} rotation={[0, 0, -0.6]}>
              <cylinderGeometry args={[0.025, 0.03, 0.14, 6]} />
              <meshToonMaterial color="#ffffff" />
            </mesh>
          </group>
        ))}
      </group>
    );
  }
  if (goods === "records") {
    return (
      <group>
        {items.map((x, i) => (
          <mesh key={x} position={[x, 1.32, 0.15]} rotation={[0.2, 0, 0]}>
            <boxGeometry args={[0.4, 0.4, 0.04]} />
            <meshToonMaterial color={["#ff5a5a", "#ffc23d", "#3a8bff", "#8a4fd6"][i]!} />
          </mesh>
        ))}
      </group>
    );
  }
  return (
    <group>
      {items.map((x, i) => (
        <group key={x} position={[x, 1.2, 0.2]}>
          <mesh>
            <cylinderGeometry args={[0.12, 0.1, 0.2, 12]} />
            <meshToonMaterial color="#c8743f" />
          </mesh>
          {[-0.07, 0.07, 0].map((dx, j) => (
            <mesh key={j} position={[dx, 0.2 + (j === 2 ? 0.07 : 0), j === 2 ? 0.04 : 0]}>
              <sphereGeometry args={[0.08, 10, 8]} />
              <meshToonMaterial
                color={["#ff6fae", "#ffd84a", "#ff5a5a", "#b98cff"][(i + j) % 4]!}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function useStripes([a, b]: [string, string]) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 8;
    const g = c.getContext("2d");
    if (g) {
      for (let i = 0; i < 8; i += 1) {
        g.fillStyle = i % 2 ? b : a;
        g.fillRect(i * 16, 0, 16, 8);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [a, b]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

function useSign(label: string) {
  const tex = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const g = canvas.getContext("2d");
    if (g) {
      g.fillStyle = "#7a4a26";
      g.fillRect(0, 0, 256, 128);
      g.fillStyle = "#a8693a";
      g.fillRect(8, 8, 240, 112);
      g.fillStyle = "#fff6e0";
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

function LampPost({ position, lit }: { position: [number, number, number]; lit?: boolean }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.07, 0.1, 1.8, 8]} />
        <meshToonMaterial color="#3b3646" />
      </mesh>
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.22, 0.26, 0.16, 10]} />
        <meshToonMaterial color="#3b3646" />
      </mesh>
      <mesh position={[0, 1.95, 0]}>
        <boxGeometry args={[0.3, 0.32, 0.3]} />
        <meshBasicMaterial color="#ffd36b" />
      </mesh>
      <mesh position={[0, 2.25, 0]}>
        <coneGeometry args={[0.28, 0.28, 4]} />
        <meshToonMaterial color="#3b3646" />
      </mesh>
      {lit && (
        <pointLight
          position={[0, 1.95, 0]}
          color="#ffc86b"
          intensity={1.4}
          distance={8}
          decay={2}
        />
      )}
    </group>
  );
}

function Houses() {
  const houses = useMemo(() => {
    const out: { x: number; z: number; rot: number; w: number; h: number; i: number }[] = [];
    const n = 16;
    for (let k = 0; k < n; k += 1) {
      const a = (k / n) * Math.PI * 2 + 0.1;
      // Leave an opening behind the gatehouse (south, +z).
      if (Math.abs(wrap(a - Math.PI / 2)) < 0.35) continue;
      const r = PLAZA_R + 8 + (k % 3) * 0.6;
      out.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        rot: -a - Math.PI / 2,
        w: 3.6 + (k % 2) * 0.8,
        h: 2.6 + (k % 3) * 0.6,
        i: k,
      });
    }
    return out;
  }, []);
  return (
    <group>
      {houses.map((h) => (
        <House key={h.i} {...h} />
      ))}
    </group>
  );
}

function wrap(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function House({
  x,
  z,
  rot,
  w,
  h,
  i,
}: {
  x: number;
  z: number;
  rot: number;
  w: number;
  h: number;
  i: number;
}) {
  const d = 3;
  const wall = PLASTER[i % PLASTER.length]!;
  const roof = ROOFS[i % ROOFS.length]!;
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshToonMaterial color={wall} />
      </mesh>
      {/* Timber framing on the plaza-facing side (+z) */}
      {[-w / 2 + 0.08, 0, w / 2 - 0.08].map((tx) => (
        <mesh key={tx} position={[tx, h / 2, d / 2 + 0.02]}>
          <boxGeometry args={[0.16, h, 0.05]} />
          <meshToonMaterial color={TIMBER} />
        </mesh>
      ))}
      {[0.08, h * 0.52, h - 0.08].map((ty) => (
        <mesh key={ty} position={[0, ty, d / 2 + 0.03]}>
          <boxGeometry args={[w, 0.16, 0.05]} />
          <meshToonMaterial color={TIMBER} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * w) / 4, h * 0.76, d / 2 + 0.03]} rotation={[0, 0, s * 0.7]}>
          <boxGeometry args={[0.12, h * 0.55, 0.05]} />
          <meshToonMaterial color={TIMBER} />
        </mesh>
      ))}
      {/* Windows with flower boxes */}
      {[-1, 1].map((s) => (
        <group key={s} position={[(s * w) / 4, h * 0.3, d / 2 + 0.05]}>
          <mesh>
            <boxGeometry args={[0.6, 0.6, 0.04]} />
            <meshBasicMaterial color="#ffe08a" />
          </mesh>
          <mesh position={[0, -0.36, 0.08]}>
            <boxGeometry args={[0.7, 0.14, 0.18]} />
            <meshToonMaterial color={roof} />
          </mesh>
          {[-0.2, 0, 0.2].map((fx) => (
            <mesh key={fx} position={[fx, -0.24, 0.1]}>
              <sphereGeometry args={[0.07, 8, 6]} />
              <meshToonMaterial color={fx === 0 ? "#ff6fae" : "#ff5a5a"} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Steep gabled roof */}
      <mesh
        position={[0, h + w * 0.42, 0]}
        rotation={[0, 0, 0]}
        scale={[w * 0.74, w * 0.85, (d + 0.5) / 2]}
      >
        <cylinderGeometry args={[0, 1, 1, 4, 1, false, Math.PI / 4]} />
        <meshToonMaterial color={roof} />
      </mesh>
      <mesh position={[w / 4, h + w * 0.55, -0.4]}>
        <boxGeometry args={[0.35, 1, 0.35]} />
        <meshToonMaterial color="#b5523a" />
      </mesh>
    </group>
  );
}

const BUNTING_TOP = 2.32; // lamp-post cap height: the rope is tied there

function Bunting({ from, to }: { from: [number, number]; to: [number, number] }) {
  const flags = 9;
  const segs = 12;
  const sag = 0.55;
  const colors = ["#ff5a5a", "#ffc23d", "#3a8bff", "#2fbf71", "#ff6fae", "#8a4fd6"];
  const [x0, z0] = from;
  const [x1, z1] = to;
  const yaw = Math.atan2(-(z1 - z0), x1 - x0);
  const at = (t: number) =>
    new THREE.Vector3(
      x0 + (x1 - x0) * t,
      BUNTING_TOP - Math.sin(t * Math.PI) * sag,
      z0 + (z1 - z0) * t,
    );
  const rope = Array.from({ length: segs }, (_, i) => {
    const a = at(i / segs);
    const b = at((i + 1) / segs);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize(),
    );
    return { mid, len: dir.length(), q };
  });
  return (
    <group>
      {rope.map((r, i) => (
        <mesh key={`r${i}`} position={r.mid} quaternion={r.q}>
          <cylinderGeometry args={[0.012, 0.012, r.len, 4]} />
          <meshBasicMaterial color="#5a3a22" />
        </mesh>
      ))}
      {Array.from({ length: flags }, (_, i) => {
        const t = (i + 1) / (flags + 1);
        const p = at(t);
        return (
          <mesh key={i} position={[p.x, p.y - 0.1, p.z]} rotation={[0, yaw, Math.PI]}>
            <circleGeometry args={[0.12, 3]} />
            <meshToonMaterial color={colors[i % colors.length]!} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
    </group>
  );
}
