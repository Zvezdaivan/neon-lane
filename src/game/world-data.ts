import type { Obstacle } from "./sim";

export const PUBLIC_ROOM = "neon-lane";

export type PlaceMode = "lobby" | "room";

export const STATIC_OBSTACLES: Obstacle[] = [
  { x: 0, z: 0, r: 1.9 },
  { x: -8.3, z: -0.6, r: 1.55 },
  { x: 8.3, z: -0.6, r: 1.55 },
  { x: 0, z: -8.5, r: 1.5 },
  { x: -5.6, z: 5.2, r: 0.38 },
  { x: 5.6, z: 5.2, r: 0.38 },
  { x: -6.2, z: -5.4, r: 0.38 },
  { x: 6.2, z: -5.4, r: 0.38 },
  { x: -1.55, z: 12.15, r: 0.42 },
  { x: 1.55, z: 12.15, r: 0.42 },
];

export type NpcDef = {
  id: string;
  name: string;
  dye: number;
  hair: number;
  lines: string[];
  path: [number, number][];
};

export const NPCS: NpcDef[] = [
  {
    id: "npc-mei",
    name: "阿美",
    dye: 0,
    hair: 1,
    lines: ["今晚個月好圓，想飲杯熱檸茶？", "你係第一次嚟霓巷？", "茶檔仲有座位。"],
    path: [
      [-6.2, 1.4],
      [-6.2, -2.5],
      [-10.1, -2.5],
      [-10.1, 1.6],
    ],
  },
  {
    id: "npc-lok",
    name: "樂樂",
    dye: 4,
    hair: 3,
    lines: ["呢隻碟好耐冇播。", "你鍾意慢歌定快歌？", "唱片檔可以企一陣。"],
    path: [
      [6.2, 1.4],
      [6.2, -2.5],
      [10.2, -2.5],
      [10.2, 1.6],
    ],
  },
  {
    id: "npc-yan",
    name: "阿欣",
    dye: 2,
    hair: 2,
    lines: ["黃菊今晚特別香。", "送俾朋友都得。", "花檔唔使急住行。"],
    path: [
      [-2.4, -6.5],
      [2.4, -6.5],
      [2.4, -10.4],
      [-2.4, -10.4],
    ],
  },
];

export function npcAt(npc: NpcDef, t: number): { x: number; z: number; yaw: number } {
  const path = npc.path;
  const segs: number[] = [];
  let total = 0;
  for (let i = 0; i < path.length; i += 1) {
    const a = path[i]!;
    const b = path[(i + 1) % path.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push(len);
    total += len;
  }
  if (total < 0.001) return { x: path[0]![0], z: path[0]![1], yaw: 0 };
  let dist = (t * 0.7) % total;
  for (let i = 0; i < path.length; i += 1) {
    const seg = segs[i] ?? 0;
    const a = path[i]!;
    const b = path[(i + 1) % path.length]!;
    if (dist <= seg) {
      const u = seg < 0.001 ? 0 : dist / seg;
      const x = a[0] + (b[0] - a[0]) * u;
      const z = a[1] + (b[1] - a[1]) * u;
      const yaw = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]));
      return { x, z, yaw };
    }
    dist -= seg;
  }
  return { x: path[0]![0], z: path[0]![1], yaw: 0 };
}

export function roomFromCode(code: string): string {
  const cleaned = code
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8);
  return cleaned ? `nl-${cleaned}` : PUBLIC_ROOM;
}

export function makeRoomCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let next = "";
  for (let i = 0; i < 4; i += 1) next += alphabet[Math.floor(Math.random() * alphabet.length)] ?? "a";
  return next;
}

export function roomLabel(room: string): string {
  if (room === PUBLIC_ROOM) return "大廳";
  return `私人房 ${room.replace(/^nl-/, "").toUpperCase()}`;
}
