import { clamp } from "./palette";

const PROFILE_KEY = "neon-lane-profile-v1";
const FRIENDS_KEY = "neon-lane-friends-v1";

export type Profile = {
  id: string;
  name: string;
  dye: number;
  hair: number;
};

export type Friend = {
  id: string;
  name: string;
  dye: number;
  at: number;
};

export const DEFAULT_PROFILE: Profile = {
  id: "pending",
  name: "街坊",
  dye: 0,
  hair: 0,
};

export function cleanName(raw: unknown): string {
  const text = typeof raw === "string" ? raw : "";
  const trimmed = text.replace(/\s+/g, " ").trim().slice(0, 12);
  return trimmed || "街坊";
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Profile>;
      if (parsed && typeof parsed.id === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(parsed.id)) {
        return {
          id: parsed.id,
          name: cleanName(parsed.name),
          dye: clamp(Number(parsed.dye) || 0, 0, 4),
          hair: clamp(Number(parsed.hair) || 0, 0, 3),
        };
      }
    }
  } catch {
    // ignore broken storage
  }
  const fresh: Profile = {
    id: `u${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
    name: "街坊",
    dye: 0,
    hair: 0,
  };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(fresh));
  return fresh;
}

export function saveProfile(profile: Profile) {
  if (profile.id === "pending") return;
  localStorage.setItem(
    PROFILE_KEY,
    JSON.stringify({
      id: profile.id,
      name: cleanName(profile.name),
      dye: clamp(profile.dye, 0, 4),
      hair: clamp(profile.hair, 0, 3),
    }),
  );
}

export function loadFriends(): Friend[] {
  try {
    const raw = localStorage.getItem(FRIENDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Friend[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((f) => f && typeof f.id === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(f.id))
      .slice(0, 40)
      .map((f) => ({
        id: f.id,
        name: cleanName(f.name),
        dye: clamp(Number(f.dye) || 0, 0, 4),
        at: typeof f.at === "number" ? f.at : 0,
      }));
  } catch {
    return [];
  }
}

export function saveFriends(friends: Friend[]) {
  localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends.slice(0, 40)));
}
