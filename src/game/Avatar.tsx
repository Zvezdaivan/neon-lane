import { useRef, type MutableRefObject, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { BackSide, type Group, type Mesh } from "three";
import { clamp, DYES, JADE } from "./palette";
import type { Emote } from "./types";

export type Motion = {
  walking: boolean;
  emote: Emote;
  talk: boolean;
};

export function AvatarMesh({
  dye,
  hair,
  motion,
}: {
  dye: number;
  hair: number;
  motion: MutableRefObject<Motion>;
}) {
  const phase = useRef(0);
  const bob = useRef<Group>(null);
  const torso = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const tone = clamp(dye, 0, DYES.length - 1);
  const shirt = BRIGHT_SHIRTS[tone] ?? BRIGHT_SHIRTS[0];
  const pants = BRIGHT_PANTS[tone] ?? BRIGHT_PANTS[0];

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.1);
    const m = motion.current;
    const moving = m.walking && m.emote === "";
    if (moving || m.emote === "dance" || m.emote === "wave")
      phase.current += d * (m.emote === "dance" ? 7 : 8);
    const swing = moving ? Math.sin(phase.current) : 0;
    if (legL.current) legL.current.rotation.x = swing * 0.7;
    if (legR.current) legR.current.rotation.x = -swing * 0.7;
    let left = -swing * 0.55;
    let right = swing * 0.55;
    let bow = 0;
    let sway = 0;
    let waveZ = 0;
    if (m.emote === "wave") {
      right = -2.15;
      left = 0.25;
      waveZ = Math.sin(phase.current * 1.4) * 0.35;
    } else if (m.emote === "bow") {
      bow = 0.75;
      left = 0.4;
      right = 0.4;
    } else if (m.emote === "dance") {
      left = -1.15 + Math.sin(phase.current) * 0.45;
      right = -1.15 + Math.cos(phase.current) * 0.45;
      sway = Math.sin(phase.current) * 0.22;
    }
    if (armL.current) {
      armL.current.rotation.x = left;
      armL.current.rotation.z = 0.12;
    }
    if (armR.current) {
      armR.current.rotation.x = right;
      armR.current.rotation.z = m.emote === "wave" ? waveZ : -0.12;
    }
    if (torso.current) {
      torso.current.rotation.x = bow;
      torso.current.rotation.z = sway;
    }
    if (bob.current) bob.current.position.y = moving ? Math.abs(Math.sin(phase.current)) * 0.07 : 0;
    if (ring.current) {
      ring.current.visible = m.talk;
      const pulse = 1 + Math.sin(phase.current * 3) * 0.08;
      ring.current.scale.setScalar(m.talk ? pulse : 1);
    }
  });

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.36, 24]} />
        <meshBasicMaterial color="#0b0d0e" transparent opacity={0.32} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]} visible={false}>
        <ringGeometry args={[0.42, 0.52, 32]} />
        <meshBasicMaterial color={JADE} transparent opacity={0.9} />
      </mesh>
      <group ref={bob}>
        {/* Stubby legs with big round shoes */}
        {[legL, legR].map((ref, i) => (
          <group key={i} ref={ref} position={[i === 0 ? -0.12 : 0.12, 0.42, 0]}>
            <Toon position={[0, -0.14, 0]} color={pants} outline>
              <capsuleGeometry args={[0.085, 0.14, 6, 12]} />
            </Toon>
            <Toon position={[0, -0.33, 0.05]} scale={[1, 0.72, 1.35]} color={SHOE} outline>
              <sphereGeometry args={[0.12, 20, 14]} />
            </Toon>
          </group>
        ))}
        <group ref={torso}>
          {/* Round, egg-shaped body: shirt with overalls bib */}
          <Toon position={[0, 0.66, 0]} scale={[1, 1.05, 0.9]} color={shirt} outline>
            <sphereGeometry args={[0.27, 28, 20]} />
          </Toon>
          <Toon position={[0, 0.55, 0.01]} scale={[1.02, 0.72, 0.93]} color={pants}>
            <sphereGeometry args={[0.27, 28, 20]} />
          </Toon>
          <Toon position={[-0.09, 0.66, 0.225]} color={BUTTON}>
            <sphereGeometry args={[0.035, 12, 10]} />
          </Toon>
          <Toon position={[0.09, 0.66, 0.225]} color={BUTTON}>
            <sphereGeometry args={[0.035, 12, 10]} />
          </Toon>
          {/* Big head */}
          <group position={[0, 1.22, 0]}>
            <Toon color={SKIN_BRIGHT} outline>
              <sphereGeometry args={[0.36, 32, 24]} />
            </Toon>
            {/* Ears */}
            <Toon position={[-0.35, -0.02, 0]} scale={[0.6, 1, 0.8]} color={SKIN_BRIGHT}>
              <sphereGeometry args={[0.08, 12, 10]} />
            </Toon>
            <Toon position={[0.35, -0.02, 0]} scale={[0.6, 1, 0.8]} color={SKIN_BRIGHT}>
              <sphereGeometry args={[0.08, 12, 10]} />
            </Toon>
            {/* Button nose */}
            <Toon position={[0, -0.04, 0.35]} color={NOSE}>
              <sphereGeometry args={[0.065, 16, 12]} />
            </Toon>
            <Eye x={-0.12} />
            <Eye x={0.12} />
            {/* Rosy cheeks */}
            <mesh position={[-0.2, -0.1, 0.27]} rotation={[0, -0.6, 0]}>
              <circleGeometry args={[0.055, 16]} />
              <meshBasicMaterial color={CHEEK} transparent opacity={0.75} />
            </mesh>
            <mesh position={[0.2, -0.1, 0.27]} rotation={[0, 0.6, 0]}>
              <circleGeometry args={[0.055, 16]} />
              <meshBasicMaterial color={CHEEK} transparent opacity={0.75} />
            </mesh>
            {/* Smile */}
            <mesh position={[0, -0.15, 0.315]} rotation={[0.35, 0, Math.PI]}>
              <torusGeometry args={[0.055, 0.014, 8, 16, Math.PI]} />
              <meshBasicMaterial color="#5a2320" />
            </mesh>
            <Hair style={hair} accent={shirt} />
          </group>
          {/* Short round arms with mitten hands */}
          {[armL, armR].map((ref, i) => (
            <group key={i} ref={ref} position={[i === 0 ? -0.27 : 0.27, 0.8, 0]}>
              <Toon position={[0, -0.12, 0]} color={shirt} outline>
                <capsuleGeometry args={[0.07, 0.12, 6, 12]} />
              </Toon>
              <Toon position={[0, -0.27, 0]} color={GLOVE} outline>
                <sphereGeometry args={[0.085, 16, 12]} />
              </Toon>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}

const OUTLINE = "#1b1430";
const SHOE = "#7a3b1d";
const BUTTON = "#ffd84a";
const GLOVE = "#ffffff";
const NOSE = "#ffb28a";
const CHEEK = "#ff7f9e";
const SKIN_BRIGHT = "#ffd3b0";
const BRIGHT_SHIRTS = ["#ff9f1c", "#ff4d4d", "#3ddc84", "#ffe066", "#2fb8ff"] as const;
const BRIGHT_PANTS = ["#3a5bff", "#2f6bff", "#7b4dff", "#ff5fa2", "#ff8a3d"] as const;
const HAIR_COLORS = ["#6b3a1f", "#ff6fae", "#ffc93c", "#3a5bff"] as const;

/** Soft cel-shaded mesh with an optional inverted-hull cartoon outline. */
function Toon({
  color,
  outline,
  children,
  ...rest
}: {
  color: string;
  outline?: boolean;
  children: ReactNode;
  position?: [number, number, number];
  scale?: [number, number, number];
  rotation?: [number, number, number];
}) {
  return (
    <group {...rest}>
      <mesh>
        {children}
        <meshToonMaterial color={color} />
      </mesh>
      {outline && (
        <mesh scale={1.07}>
          {children}
          <meshBasicMaterial color={OUTLINE} side={BackSide} />
        </mesh>
      )}
    </group>
  );
}

function Eye({ x }: { x: number }) {
  return (
    <group position={[x, 0.07, 0.3]} rotation={[0, x * 1.6, 0]}>
      <mesh scale={[0.75, 1.15, 0.45]}>
        <sphereGeometry args={[0.075, 16, 12]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, -0.005, 0.028]} scale={[0.75, 1.1, 0.45]}>
        <sphereGeometry args={[0.05, 16, 12]} />
        <meshBasicMaterial color="#1d2a6b" />
      </mesh>
      <mesh position={[0.012, 0.03, 0.05]}>
        <sphereGeometry args={[0.014, 8, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}

function Hair({ style, accent }: { style: number; accent: string }) {
  const color = HAIR_COLORS[style] ?? HAIR_COLORS[0];
  if (style === 1) {
    // Bun
    return (
      <group>
        <Toon position={[0, 0.12, -0.03]} scale={[1.05, 0.72, 1.05]} color={color} outline>
          <sphereGeometry args={[0.35, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </Toon>
        <Toon position={[0, 0.42, -0.05]} color={color} outline>
          <sphereGeometry args={[0.13, 16, 12]} />
        </Toon>
      </group>
    );
  }
  if (style === 2) {
    // Long, bouncy pigtails
    return (
      <group>
        <Toon position={[0, 0.1, -0.03]} scale={[1.07, 0.78, 1.07]} color={color} outline>
          <sphereGeometry args={[0.35, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </Toon>
        <Toon position={[-0.36, -0.12, -0.06]} scale={[0.85, 1.35, 0.85]} color={color} outline>
          <sphereGeometry args={[0.12, 16, 12]} />
        </Toon>
        <Toon position={[0.36, -0.12, -0.06]} scale={[0.85, 1.35, 0.85]} color={color} outline>
          <sphereGeometry args={[0.12, 16, 12]} />
        </Toon>
      </group>
    );
  }
  if (style === 3) {
    // Round cap with a brim, tinted to the outfit
    return (
      <group>
        <Toon position={[0, 0.1, 0]} scale={[1.08, 0.8, 1.08]} color={accent} outline>
          <sphereGeometry args={[0.35, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </Toon>
        <Toon position={[0, 0.12, 0.3]} scale={[1, 0.18, 0.7]} color={accent} outline>
          <sphereGeometry args={[0.24, 20, 12]} />
        </Toon>
        <mesh position={[0, 0.3, 0.31]}>
          <circleGeometry args={[0.08, 20]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>
    );
  }
  // Short tousled hair
  return (
    <group>
      <Toon position={[0, 0.08, -0.02]} scale={[1.06, 0.78, 1.06]} color={color} outline>
        <sphereGeometry args={[0.35, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </Toon>
      <Toon position={[0.08, 0.36, 0.12]} rotation={[0.5, 0, -0.3]} color={color}>
        <coneGeometry args={[0.07, 0.16, 10]} />
      </Toon>
    </group>
  );
}
