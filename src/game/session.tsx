import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { PeerInfo } from "@/lib/multiplayer/p2p";
import { useP2PRoom } from "@/lib/multiplayer/use-p2p-room";
import { PlazaChrome } from "./overlay";
import { FilePass, type PassView } from "./files";
import {
  DEFAULT_PROFILE,
  cleanName,
  loadFriends,
  loadProfile,
  saveFriends,
  saveProfile,
  type Friend,
  type Profile,
} from "./profile";
import { SPAWN } from "./sim";
import type { AutoTarget, ChatLine, Emote, Joy, LocalBody, NetApi, Pose } from "./types";
import { PlazaAudio, voiceGain } from "./voice";
import { readPose, WorldCanvas } from "./World";
import { NPCS, npcAt, PUBLIC_ROOM, makeRoomCode, roomFromCode, roomLabel, type PlaceMode } from "./world-data";

function nid() {
  return `c${Math.random().toString(36).slice(2, 10)}`;
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function nearest(body: LocalBody, remotes: Map<string, Pose>) {
  let best = 3.6;
  let id: string | null = null;
  for (const [peerId, pose] of remotes) {
    const dist = Math.hypot(pose.x - body.x, pose.z - body.z);
    if (dist < best) {
      best = dist;
      id = peerId;
    }
  }
  const t = Date.now() / 1000;
  for (const npc of NPCS) {
    const at = npcAt(npc, t);
    const dist = Math.hypot(at.x - body.x, at.z - body.z);
    if (dist < best) {
      best = dist;
      id = npc.id;
    }
  }
  return id;
}

export function NeonLane() {
  const [booted, setBooted] = useState(false);
  const [entered, setEntered] = useState(false);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [code, setCode] = useState("");
  const [place, setPlace] = useState<PlaceMode>("lobby");
  const [room, setRoom] = useState(PUBLIC_ROOM);
  const [chats, setChats] = useState<ChatLine[]>([]);
  const [bubbles, setBubbles] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [remoteIds, setRemoteIds] = useState<string[]>([]);
  const [roster, setRoster] = useState<{ peers: PeerInfo[]; joined: boolean; selfId: string }>({
    peers: [],
    joined: false,
    selfId: "",
  });
  const [mic, setMic] = useState<"off" | "on" | "denied" | "missing">("off");
  const [ambience, setAmbience] = useState(true);
  const [copied, setCopied] = useState(false);
  const [passes, setPasses] = useState<PassView[]>([]);

  const player = useRef<LocalBody>({ ...SPAWN, speed: 0, emote: "", emoteUntil: 0 });
  const camYaw = useRef(0);
  const held = useRef(new Set<string>());
  const probe = useRef<string[] | null>(null);
  const joy = useRef<Joy>({ f: 0, s: 0 });
  const auto = useRef<AutoTarget | null>(null);
  const remotes = useRef(new Map<string, Pose>());
  const net = useRef<NetApi | null>(null);
  const talking = useRef(false);
  const audioRef = useRef<PlazaAudio | null>(null);
  const profileRef = useRef(profile);
  const chatRef = useRef<ChatLine[]>([]);
  const enteredRef = useRef(false);
  const npcLine = useRef<Record<string, number>>({});
  const copyTimer = useRef(0);
  const micRef = useRef(mic);
  const passNote = useRef<(text: string) => void>(() => {});
  const passRef = useRef<FilePass | null>(null);
  profileRef.current = profile;
  enteredRef.current = entered;
  chatRef.current = chats;
  micRef.current = mic;
  passNote.current = (text) => pushChat({ id: nid(), name: "", text, kind: "sys", at: Date.now() });
  if (passRef.current === null) {
    passRef.current = new FilePass({
      send: (data, peerId) => net.current?.send(data, peerId) ?? false,
      distance: (peerId) => {
        const pose = remotes.current.get(peerId);
        if (!pose) return null;
        return Math.hypot(pose.x - player.current.x, pose.z - player.current.z);
      },
      nameOf: (peerId) => remotes.current.get(peerId)?.name || "街坊",
      onChange: setPasses,
      onNote: (text) => passNote.current(text),
    });
  }

  const say = (id: string, text: string) => {
    setBubbles((prev) => ({ ...prev, [id]: text }));
    window.setTimeout(() => {
      setBubbles((prev) => {
        if (prev[id] !== text) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, 4200);
  };

  const pushChat = (line: ChatLine) => {
    setChats((prev) => {
      if (prev.some((item) => item.id === line.id)) return prev;
      const next = [...prev, line].slice(-40);
      chatRef.current = next;
      return next;
    });
  };

  const playEmote = (emote: Emote) => {
    player.current.emote = emote;
    player.current.emoteUntil = performance.now() + 2200;
    audioRef.current?.playBlip();
  };

  const sendText = (raw: string) => {
    const text = raw.replace(/\s+/g, " ").trim().slice(0, 80);
    if (!text) return;
    const line: ChatLine = {
      id: nid(),
      name: cleanName(profileRef.current.name),
      text,
      kind: "talk",
      at: Date.now(),
      from: "self",
    };
    pushChat(line);
    say("self", text);
    net.current?.send({
      k: "c",
      id: line.id,
      name: line.name,
      text,
      at: line.at,
      profileId: profileRef.current.id,
    });
  };

  const greet = (id: string) => {
    playEmote("wave");
    if (id === "self") return;
    if (id.startsWith("npc-")) {
      const npc = NPCS.find((item) => item.id === id);
      if (!npc) return;
      const index = npcLine.current[id] ?? 0;
      npcLine.current[id] = index + 1;
      const reply = npc.lines[index % npc.lines.length] ?? "你好。";
      pushChat({ id: nid(), name: cleanName(profileRef.current.name), text: "你好", kind: "talk", at: Date.now(), from: "self" });
      say("self", "你好");
      pushChat({ id: nid(), name: npc.name, text: reply, kind: "talk", at: Date.now(), from: id });
      say(id, reply);
      return;
    }
    sendText(`你好，我係${cleanName(profileRef.current.name)}`);
  };

  const actions = useRef({ emote: playEmote, mic: () => {}, greet });
  actions.current.emote = playEmote;
  actions.current.greet = greet;

  const onNetRef = useRef<(from: string, data: unknown, channel: "state" | "reliable") => void>(() => {});
  onNetRef.current = (from, data, channel) => {
    if (passRef.current?.onMessage(from, data)) return;
    if (!data || typeof data !== "object") return;
    const msg = data as Record<string, unknown>;
    if (channel === "state" && msg.k === "p") {
      const pose = readPose(data);
      if (!pose) return;
      const known = remotes.current.has(from);
      remotes.current.set(from, pose);
      if (!known) setRemoteIds([...remotes.current.keys()]);
      return;
    }
    if (channel === "state" && msg.k === "v" && typeof msg.pcm === "string" && typeof msg.seq === "number") {
      audioRef.current?.ingest(from, msg.pcm, msg.seq);
      return;
    }
    if (msg.k === "c" && typeof msg.text === "string" && typeof msg.id === "string") {
      const text = msg.text.replace(/\s+/g, " ").trim().slice(0, 80);
      if (!text) return;
      pushChat({ id: msg.id.slice(0, 40), name: cleanName(msg.name), text, kind: "talk", at: Date.now(), from });
      say(from, text);
      return;
    }
    if (msg.k === "h" && Array.isArray(msg.chats)) {
      for (const item of msg.chats) {
        if (!item || typeof item !== "object") continue;
        const row = item as Record<string, unknown>;
        if (typeof row.text !== "string" || typeof row.id !== "string") continue;
        const text = row.text.replace(/\s+/g, " ").trim().slice(0, 80);
        if (!text) continue;
        pushChat({
          id: row.id.slice(0, 40),
          name: cleanName(row.name),
          text,
          kind: "talk",
          at: typeof row.at === "number" ? row.at : Date.now(),
        });
      }
    }
  };

  useEffect(() => {
    const loaded = loadProfile();
    setProfile(loaded);
    setFriends(loadFriends());
    const fromUrl = new URLSearchParams(window.location.search).get("room");
    if (fromUrl && /^[a-zA-Z0-9_-]{1,64}$/.test(fromUrl)) {
      setRoom(fromUrl);
      if (fromUrl.startsWith("nl-")) {
        setPlace("room");
        setCode(fromUrl.slice(3));
      } else {
        setPlace("lobby");
      }
    }
    const audio = new PlazaAudio({
      send: (payload) => net.current?.broadcast(payload),
      volumeFor: (peerId) => {
        const pose = remotes.current.get(peerId);
        if (!pose) return 0;
        return voiceGain(Math.hypot(pose.x - player.current.x, pose.z - player.current.z));
      },
      onTalking: (value) => {
        talking.current = value;
      },
    });
    audioRef.current = audio;
    if (import.meta.env.DEV || window.location.search.includes("qa=1")) {
      window.__controlsTest = {
        getYaw: () => player.current.yaw,
        getSpeed: () => player.current.speed,
        setKeys: (codes) => {
          probe.current = codes;
        },
      };
    }
    setBooted(true);
    return () => {
      audio.dispose();
      audioRef.current = null;
      delete window.__controlsTest;
      window.clearTimeout(copyTimer.current);
    };
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      held.current.add(event.code);
      if (event.code.startsWith("Arrow")) event.preventDefault();
      if (!enteredRef.current || event.repeat) return;
      if (event.code === "Digit1") actions.current.emote("wave");
      if (event.code === "Digit2") actions.current.emote("bow");
      if (event.code === "Digit3") actions.current.emote("dance");
      if (event.code === "KeyM") actions.current.mic();
      if (event.code === "KeyF") {
        const id = nearest(player.current, remotes.current);
        if (id) actions.current.greet(id);
      }
      if (event.code === "Enter") {
        event.preventDefault();
        document.getElementById("lane-chat")?.focus();
      }
    };
    const up = (event: KeyboardEvent) => held.current.delete(event.code);
    const clear = () => held.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
    };
  }, []);

  const enter = () => {
    const next = { ...profileRef.current, name: cleanName(profileRef.current.name) };
    setProfile(next);
    saveProfile(next);
    let nextCode = code;
    if (place === "room" && !nextCode.trim().toLowerCase().replace(/[^a-z0-9]/g, "")) {
      nextCode = makeRoomCode();
      setCode(nextCode);
    }
    const nextRoom = place === "lobby" ? PUBLIC_ROOM : roomFromCode(nextCode);
    setRoom(nextRoom);
    setEntered(true);
    audioRef.current?.setAmbience(ambience);
    audioRef.current?.unlock();
    const url = new URL(window.location.href);
    url.searchParams.set("room", nextRoom);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    pushChat({
      id: nid(),
      name: "",
      text:
        nextRoom === PUBLIC_ROOM
          ? "大廳。行近其他玩家就可以打招呼、加好友、傳檔。"
          : `${roomLabel(nextRoom)}。複製連結，朋友先入到。行近就可以傳檔。`,
      kind: "sys",
      at: Date.now(),
    });
  };

  const leave = () => {
    passRef.current?.reset();
    setPasses([]);
    setEntered(false);
    setSelected(null);
    setChats([]);
    chatRef.current = [];
    setBubbles({});
    remotes.current.clear();
    setRemoteIds([]);
    setRoster({ peers: [], joined: false, selfId: "" });
    void audioRef.current?.setMic(false);
    setMic("off");
    player.current.x = SPAWN.x;
    player.current.z = SPAWN.z;
    player.current.yaw = SPAWN.yaw;
    player.current.speed = 0;
  };

  const toggleMic = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (micRef.current === "on") {
      await audio.setMic(false);
      setMic("off");
      return;
    }
    audio.unlock();
    const result = await audio.setMic(true);
    setMic(result === "ok" ? "on" : result);
  };
  actions.current.mic = () => {
    void toggleMic();
  };

  const walkTo = (id: string) => {
    if (id.startsWith("npc-")) {
      auto.current = { x: 0, z: 0, npcId: id, until: performance.now() + 20000 };
      return;
    }
    const pose = remotes.current.get(id);
    if (!pose) return;
    auto.current = { x: pose.x, z: pose.z, until: performance.now() + 15000 };
  };

  const addFriend = (friend: Friend) => {
    setFriends((prev) => {
      const next = [friend, ...prev.filter((item) => item.id !== friend.id)].slice(0, 40);
      saveFriends(next);
      return next;
    });
  };

  const removeFriend = (id: string) => {
    setFriends((prev) => {
      const next = prev.filter((item) => item.id !== id);
      saveFriends(next);
      return next;
    });
  };

  const copyLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("room", room);
    void navigator.clipboard
      .writeText(url.toString())
      .then(() => {
        setCopied(true);
        window.clearTimeout(copyTimer.current);
        copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => setCopied(false));
  };

  const newCode = () => {
    setPlace("room");
    setCode(makeRoomCode());
  };

  const sendFile = (peerId: string, file: File) => {
    const peer = roster.peers.find((item) => item.id === peerId);
    if (!peer || peer.connectionState !== "connected") {
      pushChat({ id: nid(), name: "", text: "未連到對方", kind: "sys", at: Date.now() });
      return;
    }
    passRef.current?.offer(peerId, file);
  };

  const onSys = (text: string) => pushChat({ id: nid(), name: "", text, kind: "sys", at: Date.now() });

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-ink text-cream">
      {booted ? (
        <WorldCanvas
          live={entered}
          profile={profile}
          player={player}
          camYaw={camYaw}
          held={held}
          probe={probe}
          joy={joy}
          auto={auto}
          remotes={remotes}
          remoteIds={remoteIds}
          friendIds={friends.map((friend) => friend.id)}
          net={net}
          bubbles={bubbles}
          selected={selected}
          onPick={setSelected}
          micOn={mic === "on"}
          talking={talking}
        />
      ) : (
        <div className="absolute inset-0 bg-ink" />
      )}
      {entered ? (
        <RoomSession
          key={room}
          room={room}
          name={cleanName(profile.name)}
          remotes={remotes}
          setRemoteIds={setRemoteIds}
          net={net}
          onRoster={setRoster}
          onNet={(from, data, channel) => onNetRef.current(from, data, channel)}
          chatRef={chatRef}
          onSys={onSys}
        />
      ) : null}
      <PlazaChrome
        booted={booted}
        entered={entered}
        profile={profile}
        onProfile={(next) => {
          setProfile(next);
          if (booted && next.id !== "pending") saveProfile({ ...next, name: cleanName(next.name) });
        }}
        code={code}
        onCode={setCode}
        onNewCode={newCode}
        place={place}
        onPlace={setPlace}
        onEnter={enter}
        room={room}
        joined={roster.joined}
        peers={roster.peers}
        player={player}
        remotes={remotes}
        friends={friends}
        onAddFriend={addFriend}
        onRemoveFriend={removeFriend}
        onWalkTo={walkTo}
        onGreet={greet}
        selected={selected}
        onSelect={setSelected}
        chats={chats}
        onSend={sendText}
        onEmote={playEmote}
        mic={mic}
        onMic={() => {
          void toggleMic();
        }}
        ambience={ambience}
        onAmbience={() => {
          const next = !ambience;
          setAmbience(next);
          audioRef.current?.setAmbience(next);
          if (next) audioRef.current?.unlock();
        }}
        onLeave={leave}
        onCopy={copyLink}
        copied={copied}
        joy={joy}
        passes={passes}
        onSendFile={sendFile}
        onAcceptFile={(id) => passRef.current?.accept(id)}
        onRejectFile={(id) => passRef.current?.reject(id)}
        onDismissFile={(id) => passRef.current?.dismiss(id)}
      />
    </main>
  );
}

function RoomSession(props: {
  room: string;
  name: string;
  remotes: MutableRefObject<Map<string, Pose>>;
  setRemoteIds: (ids: string[]) => void;
  net: MutableRefObject<NetApi | null>;
  onRoster: (roster: { peers: PeerInfo[]; joined: boolean; selfId: string }) => void;
  onNet: (from: string, data: unknown, channel: "state" | "reliable") => void;
  chatRef: MutableRefObject<ChatLine[]>;
  onSys: (text: string) => void;
}) {
  const p2p = useP2PRoom({ room: props.room, name: props.name });
  const met = useRef(new Set<string>());
  const onNet = useRef(props.onNet);
  const onSys = useRef(props.onSys);
  const onRoster = useRef(props.onRoster);
  const setRemoteIds = props.setRemoteIds;
  onNet.current = props.onNet;
  onSys.current = props.onSys;
  onRoster.current = props.onRoster;

  useEffect(() => {
    props.net.current = { selfId: p2p.selfId, broadcast: p2p.broadcast, send: p2p.send };
    return () => {
      props.net.current = null;
      props.remotes.current.clear();
      setRemoteIds([]);
    };
  }, [p2p.selfId, p2p.broadcast, p2p.send, props.net, props.remotes, setRemoteIds]);

  useEffect(() => p2p.onMessage((from, data, channel) => onNet.current(from, data, channel)), [p2p.onMessage]);

  useEffect(() => {
    onRoster.current({ peers: p2p.peers, joined: p2p.joined, selfId: p2p.selfId });
  }, [p2p.peers, p2p.joined, p2p.selfId]);

  useEffect(() => {
    const connected = p2p.peers.filter((peer) => peer.connectionState === "connected");
    for (const peer of connected) {
      if (met.current.has(peer.id)) continue;
      const already = [p2p.selfId, ...connected.map((item) => item.id).filter((id) => id !== peer.id)];
      const smallest = already.reduce((a, b) => (a < b ? a : b));
      if (smallest === p2p.selfId) {
        const payload = props.chatRef.current
          .filter((line) => line.kind === "talk")
          .slice(-12)
          .map((line) => ({ id: line.id, name: line.name, text: line.text, at: line.at }));
        if (payload.length) p2p.send({ k: "h", chats: payload }, peer.id);
      }
      met.current.add(peer.id);
      onSys.current(`${peer.name || "有人"} 入咗廣場`);
    }
    for (const id of [...met.current]) {
      if (!p2p.peers.some((peer) => peer.id === id)) {
        met.current.delete(id);
        onSys.current("有人離開咗");
      }
    }
  }, [p2p.peers, p2p.selfId, p2p.send, props.chatRef]);

  useEffect(() => {
    const alive = new Set(p2p.peers.map((peer) => peer.id));
    let changed = false;
    for (const id of props.remotes.current.keys()) {
      if (!alive.has(id)) {
        props.remotes.current.delete(id);
        changed = true;
      }
    }
    if (changed) setRemoteIds([...props.remotes.current.keys()]);
  }, [p2p.peers, props.remotes, setRemoteIds]);

  return null;
}
