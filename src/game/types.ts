import type { MutableRefObject } from "react";

export type Emote = "" | "wave" | "bow" | "dance";

export type Pose = {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  name: string;
  dye: number;
  hair: number;
  emote: Emote;
  talk: boolean;
  profileId: string;
};

export type LocalBody = {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  emote: Emote;
  emoteUntil: number;
};

export type ChatLine = {
  id: string;
  name: string;
  text: string;
  kind: "talk" | "sys";
  at: number;
  from?: string;
};

export type NetApi = {
  selfId: string;
  broadcast: (data: unknown) => void;
  send: (data: unknown, peerId?: string) => boolean;
};

export type AutoTarget = {
  x: number;
  z: number;
  npcId?: string;
  until: number;
};

export type Joy = { f: number; s: number };

export type WorldProps = {
  live: boolean;
  profile: { id: string; name: string; dye: number; hair: number };
  player: MutableRefObject<LocalBody>;
  camYaw: MutableRefObject<number>;
  held: MutableRefObject<Set<string>>;
  probe: MutableRefObject<string[] | null>;
  joy: MutableRefObject<Joy>;
  auto: MutableRefObject<AutoTarget | null>;
  remotes: MutableRefObject<Map<string, Pose>>;
  remoteIds: string[];
  friendIds: string[];
  net: MutableRefObject<NetApi | null>;
  bubbles: Record<string, string>;
  selected: string | null;
  onPick: (id: string | null) => void;
  micOn: boolean;
  talking: MutableRefObject<boolean>;
};

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setKeys?: (codes: string[]) => void;
    };
  }
}
