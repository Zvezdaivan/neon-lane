/** Shared dyes. UI swatches use the matching `bg-dye-*` tokens. */
export const DYES = ["#e8a04a", "#c46a45", "#3dbe8c", "#f3eee4", "#1f6f62"] as const;

export const DYE_CLASS = ["bg-dye-0", "bg-dye-1", "bg-dye-2", "bg-dye-3", "bg-dye-4"] as const;

export const HAIR_LABELS = ["短髮", "丸子", "長髮", "帽"] as const;

export const NIGHT = "#141a1e";
export const CREAM = "#f3eee4";
export const AMBER = "#e8a04a";
export const JADE = "#3dbe8c";
export const SKIN = "#e6c2a4";
export const HAIR = "#1a1614";
export const PANTS = "#1c1916";
export const STONE = "#3a403c";
export const WOOD = "#4a3424";
export const LEAF = "#1d3b34";
export const LEAF_LIT = "#24574c";
export const WATER = "#143f3c";
export const INK = "#12161a";

export function dyeHex(index: number): string {
  return DYES[clamp(index, 0, DYES.length - 1)] ?? DYES[0];
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
