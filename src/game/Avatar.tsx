import { useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";
import { dyeHex, HAIR, JADE, PANTS, SKIN } from "./palette";
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
  const shirt = dyeHex(dye);

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.1);
    const m = motion.current;
    const moving = m.walking && m.emote === "";
    if (moving || m.emote === "dance" || m.emote === "wave") phase.current += d * (m.emote === "dance" ? 7 : 8);
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
    if (bob.current) bob.current.position.y = moving ? Math.abs(Math.sin(phase.current)) * 0.045 : 0;
    if (ring.current) {
      ring.current.visible = m.talk;
      const pulse = 1 + Math.sin(phase.current * 3) * 0.08;
      ring.current.scale.setScalar(m.talk ? pulse : 1);
    }
  });

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.34, 16]} />
        <meshBasicMaterial color="#0b0d0e" transparent opacity={0.38} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]} visible={false}>
        <ringGeometry args={[0.4, 0.5, 24]} />
        <meshBasicMaterial color={JADE} transparent opacity={0.9} />
      </mesh>
      <group ref={bob}>
        <group ref={legL} position={[-0.1, 0.74, 0]}>
          <mesh position={[0, -0.32, 0]}>
            <boxGeometry args={[0.13, 0.6, 0.15]} />
            <meshStandardMaterial color={PANTS} roughness={0.8} />
          </mesh>
        </group>
        <group ref={legR} position={[0.1, 0.74, 0]}>
          <mesh position={[0, -0.32, 0]}>
            <boxGeometry args={[0.13, 0.6, 0.15]} />
            <meshStandardMaterial color={PANTS} roughness={0.8} />
          </mesh>
        </group>
        <group ref={torso}>
          <mesh position={[0, 1.05, 0]}>
            <capsuleGeometry args={[0.22, 0.32, 4, 10]} />
            <meshStandardMaterial color={shirt} roughness={0.55} />
          </mesh>
          <mesh position={[0, 1.5, 0]}>
            <sphereGeometry args={[0.2, 18, 14]} />
            <meshStandardMaterial color={SKIN} roughness={0.62} />
          </mesh>
          <mesh position={[-0.07, 1.53, 0.16]}>
            <sphereGeometry args={[0.028, 8, 8]} />
            <meshStandardMaterial color="#1a1614" />
          </mesh>
          <mesh position={[0.07, 1.53, 0.16]}>
            <sphereGeometry args={[0.028, 8, 8]} />
            <meshStandardMaterial color="#1a1614" />
          </mesh>
          <Hair style={hair} />
          <group ref={armL} position={[-0.3, 1.2, 0]}>
            <mesh position={[0, -0.22, 0]}>
              <boxGeometry args={[0.11, 0.42, 0.12]} />
              <meshStandardMaterial color={shirt} roughness={0.55} />
            </mesh>
            <mesh position={[0, -0.46, 0]}>
              <sphereGeometry args={[0.065, 8, 8]} />
              <meshStandardMaterial color={SKIN} roughness={0.62} />
            </mesh>
          </group>
          <group ref={armR} position={[0.3, 1.2, 0]}>
            <mesh position={[0, -0.22, 0]}>
              <boxGeometry args={[0.11, 0.42, 0.12]} />
              <meshStandardMaterial color={shirt} roughness={0.55} />
            </mesh>
            <mesh position={[0, -0.46, 0]}>
              <sphereGeometry args={[0.065, 8, 8]} />
              <meshStandardMaterial color={SKIN} roughness={0.62} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}

function Hair({ style }: { style: number }) {
  if (style === 1) {
    return (
      <group>
        <mesh position={[0, 1.66, -0.02]} scale={[1.02, 0.48, 1.02]}>
          <sphereGeometry args={[0.2, 14, 10]} />
          <meshStandardMaterial color={HAIR} roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.84, 0]}>
          <sphereGeometry args={[0.09, 10, 10]} />
          <meshStandardMaterial color={HAIR} roughness={0.7} />
        </mesh>
      </group>
    );
  }
  if (style === 2) {
    return (
      <group>
        <mesh position={[0, 1.66, -0.02]} scale={[1.02, 0.5, 1.02]}>
          <sphereGeometry args={[0.2, 14, 10]} />
          <meshStandardMaterial color={HAIR} roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.32, -0.12]}>
          <boxGeometry args={[0.3, 0.48, 0.12]} />
          <meshStandardMaterial color={HAIR} roughness={0.7} />
        </mesh>
      </group>
    );
  }
  if (style === 3) {
    return (
      <mesh position={[0, 1.68, 0.02]} rotation={[0.12, 0, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.1, 16]} />
        <meshStandardMaterial color="#2c241c" roughness={0.6} />
      </mesh>
    );
  }
  return (
    <mesh position={[0, 1.64, 0]} scale={[1, 0.5, 1]}>
      <sphereGeometry args={[0.2, 14, 10]} />
      <meshStandardMaterial color={HAIR} roughness={0.7} />
    </mesh>
  );
}
