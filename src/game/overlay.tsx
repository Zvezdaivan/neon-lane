import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Copy, LogOut, Mic, MicOff, Send, UserPlus, Users, X } from "lucide-react";
import type { PeerInfo } from "@/lib/multiplayer/p2p";
import { formatBytes, PASS_RANGE, type PassView } from "./files";
import { DYE_CLASS, DYES, HAIR_LABELS } from "./palette";
import type { Friend, Profile } from "./profile";
import type { ChatLine, Emote, Joy, LocalBody, Pose } from "./types";
import { HEAR_MAX } from "./voice";
import { NPCS, npcAt, roomLabel, type PlaceMode } from "./world-data";

const btn =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium disabled:opacity-50";
const primary = `${btn} bg-amber text-ink hover:bg-amber-deep`;
const ghost = `${btn} border border-line bg-ink text-cream hover:border-amber`;

export function PlazaChrome(props: {
  booted: boolean;
  entered: boolean;
  profile: Profile;
  onProfile: (profile: Profile) => void;
  code: string;
  onCode: (code: string) => void;
  onNewCode: () => void;
  place: PlaceMode;
  onPlace: (place: PlaceMode) => void;
  onEnter: () => void;
  room: string;
  joined: boolean;
  peers: PeerInfo[];
  player: MutableRefObject<LocalBody>;
  remotes: MutableRefObject<Map<string, Pose>>;
  friends: Friend[];
  onAddFriend: (friend: Friend) => void;
  onRemoveFriend: (id: string) => void;
  onWalkTo: (id: string) => void;
  onGreet: (id: string) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  chats: ChatLine[];
  onSend: (text: string) => void;
  onEmote: (emote: Emote) => void;
  mic: "off" | "on" | "denied" | "missing";
  onMic: () => void;
  ambience: boolean;
  onAmbience: () => void;
  onLeave: () => void;
  onCopy: () => void;
  copied: boolean;
  joy: MutableRefObject<Joy>;
  passes: PassView[];
  onSendFile: (peerId: string, file: File) => void;
  onAcceptFile: (id: string) => void;
  onRejectFile: (id: string) => void;
  onDismissFile: (id: string) => void;
}) {
  const [sheet, setSheet] = useState<"people" | "friends" | "look" | null>(null);
  const [draft, setDraft] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const filePeer = useRef<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 400);
    return () => window.clearInterval(id);
  }, []);

  const near = describeNear(props, tick);
  const nearPeer = nearestPass(props, tick);
  const passes = props.passes ?? [];
  const sending = passes.some((item) => item.status === "out" || item.status === "send");

  function pickFile(peerId: string) {
    filePeer.current = peerId;
    fileRef.current?.click();
  }

  if (!props.entered) {
    return (
      <div className="pointer-events-none absolute inset-0 z-30 flex items-end p-3 md:items-end md:p-6">
        <section className="pointer-events-auto max-h-[78dvh] w-full overflow-y-auto rounded-2xl border border-line bg-ink-2/92 p-5 text-cream shadow-2xl backdrop-blur-md md:max-w-sm">
          <p className="font-display text-xs tracking-widest text-amber">NEON LANE</p>
          <h1 className="font-display text-5xl leading-none text-cream">霓巷</h1>
          <p className="mt-2 text-sm text-cream-dim">夜間廣場。入大廳識朋友，或者開一間私人房傾偈。</p>
          <label className="mt-5 block text-sm" htmlFor="lane-name">
            你嘅名
            <input
              id="lane-name"
              value={props.profile.name}
              maxLength={12}
              autoComplete="off"
              onChange={(event) => props.onProfile({ ...props.profile, name: event.target.value })}
              className="mt-1 h-11 w-full rounded-xl border border-line bg-ink px-3 text-base text-cream outline-none focus:border-amber"
            />
          </label>
          <div className="mt-4">
            <p className="text-sm">衫色</p>
            <div className="mt-2 flex gap-2">
              {DYES.map((_, index) => (
                <button
                  key={DYE_CLASS[index]}
                  type="button"
                  aria-label={`衫色 ${index + 1}`}
                  onClick={() => props.onProfile({ ...props.profile, dye: index })}
                  className={`size-11 rounded-full ${DYE_CLASS[index]} ${props.profile.dye === index ? "ring-2 ring-amber ring-offset-2 ring-offset-ink" : ""}`}
                />
              ))}
            </div>
          </div>
          <div className="mt-4">
            <p className="text-sm">髪型</p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {HAIR_LABELS.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => props.onProfile({ ...props.profile, hair: index })}
                  className={`h-11 rounded-xl border text-sm ${props.profile.hair === index ? "border-amber bg-amber text-ink" : "border-line bg-ink text-cream"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <p className="text-sm">去邊</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed={props.place === "lobby"}
                onClick={() => props.onPlace("lobby")}
                className={`min-h-16 rounded-xl border px-3 py-2 text-left ${props.place === "lobby" ? "border-amber bg-ink text-cream" : "border-line bg-ink text-cream-dim"}`}
              >
                <span className="block text-sm font-medium text-cream">大廳</span>
                <span className="mt-1 block text-xs">識朋友，一齊行</span>
              </button>
              <button
                type="button"
                aria-pressed={props.place === "room"}
                onClick={() => props.onPlace("room")}
                className={`min-h-16 rounded-xl border px-3 py-2 text-left ${props.place === "room" ? "border-amber bg-ink text-cream" : "border-line bg-ink text-cream-dim"}`}
              >
                <span className="block text-sm font-medium text-cream">私人房</span>
                <span className="mt-1 block text-xs">開房傾偈、傳檔</span>
              </button>
            </div>
            {props.place === "room" ? (
              <>
                <div className="mt-2 flex gap-2">
                  <input
                    value={props.code}
                    maxLength={8}
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="房間代碼"
                    aria-label="房間代碼"
                    onChange={(event) => props.onCode(event.target.value)}
                    className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-ink px-3 text-base text-cream outline-none focus:border-amber"
                  />
                  <button type="button" className={ghost} onClick={props.onNewCode}>
                    開新房
                  </button>
                </div>
                <p className="mt-2 text-xs text-cream-dim">
                  {props.code.trim()
                    ? `只有有代碼嘅人入到 ${props.code.trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "…"}`
                    : "未有代碼會自動開一間。入房之後複製連結俾朋友。"}
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-cream-dim">大廳人人見到你。行近就可以打招呼、加好友、傳檔。</p>
            )}
          </div>
          <button type="button" className={`${primary} mt-5 w-full`} disabled={!props.booted} onClick={props.onEnter}>
            {!props.booted ? "載入廣場" : props.place === "room" ? "進入私人房" : "進入大廳"}
          </button>
        </section>
      </div>
    );
  }

  const shownChats = (chatOpen ? props.chats.slice(-10) : props.chats.slice(-3));
  const card = describeSelection(props, tick);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col">
      <header className="flex items-start justify-between gap-2 p-3">
        <div className="pointer-events-auto rounded-2xl border border-line bg-ink-2/88 px-3 py-2 backdrop-blur-md">
          <p className="font-display text-lg leading-none">霓巷</p>
          <p className="mt-1 text-xs text-cream-dim">
            {roomLabel(props.room)} · {props.peers.length + 1} 人
            {props.joined ? "" : " · 連緊"}
          </p>
        </div>
        <div className="pointer-events-auto flex gap-2">
          <IconButton label="人" active={sheet === "people"} onClick={() => setSheet(sheet === "people" ? null : "people")}>
            <Users className="size-5" />
          </IconButton>
          <IconButton label="好友" active={sheet === "friends"} onClick={() => setSheet(sheet === "friends" ? null : "friends")}>
            <UserPlus className="size-5" />
          </IconButton>
          <IconButton label={props.copied ? "已複製" : "複製連結"} onClick={props.onCopy}>
            <Copy className="size-5" />
          </IconButton>
          <IconButton label="離開" onClick={props.onLeave}>
            <LogOut className="size-5" />
          </IconButton>
        </div>
      </header>

      {sheet ? (
        <div className="pointer-events-auto mx-3 max-h-64 overflow-y-auto rounded-2xl border border-line bg-ink-2/92 p-3 backdrop-blur-md md:max-w-md">
          {sheet === "people" ? (
            <PeopleSheet {...props} tick={tick} onClose={() => setSheet(null)} />
          ) : null}
          {sheet === "friends" ? <FriendsSheet {...props} tick={tick} /> : null}
          {sheet === "look" ? <LookSheet {...props} /> : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1" />

      {card ? (
        <div className="pointer-events-auto mx-3 mb-2 rounded-2xl border border-line bg-ink-2/92 p-3 backdrop-blur-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">{card.title}</p>
              <p className="text-xs text-cream-dim">{card.detail}</p>
            </div>
            <button type="button" aria-label="關閉" className="grid size-11 place-items-center rounded-xl border border-line" onClick={() => props.onSelect(null)}>
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {card.greet ? (
              <button type="button" className={ghost} onClick={() => props.onGreet(card.id)}>
                打招呼
              </button>
            ) : null}
            {card.canPass ? (
              <button type="button" className={primary} onClick={() => pickFile(card.id)}>
                傳檔
              </button>
            ) : null}
            {card.walk ? (
              <button type="button" className={ghost} onClick={() => props.onWalkTo(card.id)}>
                行過去
              </button>
            ) : null}
            {card.friendId && !props.friends.some((f) => f.id === card.friendId) ? (
              <button
                type="button"
                className={primary}
                onClick={() =>
                  props.onAddFriend({
                    id: card.friendId!,
                    name: card.title,
                    dye: card.dye,
                    at: Date.now(),
                  })
                }
              >
                加好友
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {near ? <p className="pointer-events-none px-3 pb-2 text-center text-xs text-jade">{near}</p> : null}

      {passes.length > 0 || (nearPeer && !sending) ? (
        <div className="pointer-events-auto mx-3 mb-2 space-y-2 md:max-w-md">
          {nearPeer && !sending ? (
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-ink-2/92 px-3 py-2 backdrop-blur-md">
              <p className="min-w-0 text-sm">行近 {nearPeer.name}，可以傳檔</p>
              <button type="button" className={primary} onClick={() => pickFile(nearPeer.id)}>
                傳檔
              </button>
            </div>
          ) : null}
          {passes.map((item) => (
            <div key={item.id} className="rounded-2xl border border-line bg-ink-2/92 p-3 backdrop-blur-md">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-sm">
                  <span className="text-amber">{item.peerName}</span>
                  <span className="text-cream-dim"> · </span>
                  <span className="break-all">{item.fileName}</span>
                  <span className="text-cream-dim"> · {formatBytes(item.size)}</span>
                </p>
                <button
                  type="button"
                  aria-label="關閉傳檔"
                  className="grid size-11 shrink-0 place-items-center rounded-xl border border-line"
                  onClick={() => props.onDismissFile(item.id)}
                >
                  <X className="size-4" />
                </button>
              </div>
              <p className="text-xs text-cream-dim">{item.note}</p>
              {item.status === "send" || item.status === "recv" ? (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink">
                  <div className="h-full w-full origin-left bg-jade" style={{ transform: `scaleX(${item.progress})` }} />
                </div>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {item.status === "in" ? (
                  <>
                    <button type="button" className={primary} onClick={() => props.onAcceptFile(item.id)}>
                      接收
                    </button>
                    <button type="button" className={ghost} onClick={() => props.onRejectFile(item.id)}>
                      拒絕
                    </button>
                  </>
                ) : null}
                {item.status === "ready" && item.url ? (
                  <a className={primary} href={item.url} download={item.fileName}>
                    下載
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-auto flex w-full flex-col gap-2 p-3 md:max-w-md">
        <div className="flex items-end justify-between gap-2">
          <Joystick joy={props.joy} />
          <div className="pointer-events-auto flex min-w-0 flex-1 flex-wrap justify-end gap-2">
            <button type="button" className={ghost} onClick={() => props.onEmote("wave")}>揮手</button>
            <button type="button" className={ghost} onClick={() => props.onEmote("bow")}>鞠躬</button>
            <button type="button" className={ghost} onClick={() => props.onEmote("dance")}>跳舞</button>
            <button type="button" className={ghost} onClick={() => setSheet(sheet === "look" ? null : "look")}>外觀</button>
            <button
              type="button"
              className={`${props.mic === "on" ? primary : ghost} ${props.mic !== "on" && near ? "ring-2 ring-jade" : ""}`}
              onClick={props.onMic}
              aria-pressed={props.mic === "on"}
            >
              {props.mic === "on" ? <Mic className="size-4" /> : <MicOff className="size-4" />}
              {props.mic === "on" ? "收咪" : "開咪"}
            </button>
          </div>
        </div>
        <div className="pointer-events-auto rounded-2xl border border-line bg-ink-2/92 p-3 backdrop-blur-md">
          {props.mic === "denied" ? <p className="mb-2 text-xs text-clay">咪高峰被擋。可以繼續打字。</p> : null}
          {props.mic === "missing" ? <p className="mb-2 text-xs text-clay">呢個瀏覽器未開到語音。</p> : null}
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-cream-dim">
            <p>{props.copied ? "連結已複製" : "WASD 行 · 拖曳轉鏡 · 行近傳檔"}</p>
            <button type="button" className="text-cream" onClick={props.onAmbience}>
              {props.ambience ? "環境開" : "環境關"}
            </button>
            <button type="button" className="text-cream" onClick={() => setChatOpen((open) => !open)}>
              {chatOpen ? "收起" : "展開"}
            </button>
          </div>
          <div className="max-h-28 space-y-1 overflow-y-auto" aria-live="polite">
            {shownChats.length === 0 ? (
              <p className="text-sm text-cream-dim">未有人講嘢。行近常客，或者打一句。</p>
            ) : (
              shownChats.map((line) => (
                <p key={line.id} className={line.kind === "sys" ? "text-xs text-cream-dim" : "text-sm"}>
                  {line.kind === "talk" ? <span className="text-amber">{line.name} </span> : null}
                  {line.text}
                </p>
              ))
            )}
          </div>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              props.onSend(draft);
              setDraft("");
            }}
          >
            <input
              id="lane-chat"
              value={draft}
              maxLength={80}
              placeholder="講句嘢…"
              onChange={(event) => setDraft(event.target.value)}
              className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-ink px-3 text-base text-cream outline-none focus:border-amber"
            />
            <button type="submit" className={primary} aria-label="送出">
              <Send className="size-4" />
            </button>
          </form>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          const peerId = filePeer.current;
          if (file && peerId) props.onSendFile(peerId, file);
        }}
      />
    </div>
  );
}

function IconButton({
  children,
  label,
  active,
  onClick,
}: {
  children: ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid size-11 place-items-center rounded-xl border ${active ? "border-amber bg-amber text-ink" : "border-line bg-ink-2/88 text-cream"}`}
      aria-label={label}
    >
      {children}
    </button>
  );
}

function Joystick({ joy }: { joy: MutableRefObject<Joy> }) {
  const [shift, setShift] = useState({ x: 0, y: 0 });
  function place(clientX: number, clientY: number, rect: DOMRect) {
    let dx = (clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    let dy = (clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    const mag = Math.hypot(dx, dy) || 1;
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }
    joy.current = { f: -dy, s: dx };
    setShift({ x: dx * 28, y: dy * 28 });
  }
  function end() {
    joy.current = { f: 0, s: 0 };
    setShift({ x: 0, y: 0 });
  }
  return (
    <div
      className="pointer-events-auto relative size-28 touch-none rounded-full border border-line bg-ink/75 md:hidden"
      aria-label="移動搖桿"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        place(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        place(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div
        className="absolute left-1/2 top-1/2 size-12 rounded-full bg-amber"
        style={{ transform: `translate(calc(-50% + ${shift.x}px), calc(-50% + ${shift.y}px))` }}
      />
    </div>
  );
}

function PeopleSheet(props: Parameters<typeof PlazaChrome>[0] & { tick: number; onClose: () => void }) {
  const rows = rowsAround(props, props.tick);
  return (
    <div>
      <p className="mb-2 text-sm text-cream-dim">房入面嘅人。常客係呢部機嘅街坊，唔係真實玩家。</p>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-2">
            <button type="button" className="min-h-11 text-left" onClick={() => props.onSelect(row.id)}>
              <span className="block text-sm">{row.name}</span>
              <span className="text-xs text-cream-dim">{row.meta}</span>
            </button>
            <button type="button" className={ghost} onClick={() => props.onWalkTo(row.id)}>
              行過去
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FriendsSheet(props: Parameters<typeof PlazaChrome>[0] & { tick: number }) {
  if (props.friends.length === 0) {
    return <p className="text-sm text-cream-dim">未有好友。行近玩家，撳加好友。名單只留喺呢部機。</p>;
  }
  return (
    <ul className="space-y-2">
      {props.friends.map((friend) => {
        const online = [...props.remotes.current.values()].find((pose) => pose.profileId === friend.id);
        return (
          <li key={friend.id} className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm">{friend.name}</p>
              <p className="text-xs text-cream-dim">{online ? "喺呢間房" : "未上線"}</p>
            </div>
            <div className="flex gap-2">
              {online ? (
                <button
                  type="button"
                  className={ghost}
                  onClick={() => {
                    const id = [...props.remotes.current.entries()].find(([, pose]) => pose.profileId === friend.id)?.[0];
                    if (id) props.onWalkTo(id);
                  }}
                >
                  行過去
                </button>
              ) : null}
              <button type="button" className={ghost} onClick={() => props.onRemoveFriend(friend.id)}>
                移除
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function LookSheet(props: Parameters<typeof PlazaChrome>[0]) {
  return (
    <div>
      <label className="block text-sm" htmlFor="lane-rename">
        名
        <input
          id="lane-rename"
          value={props.profile.name}
          maxLength={12}
          onChange={(event) => props.onProfile({ ...props.profile, name: event.target.value })}
          className="mt-1 h-11 w-full rounded-xl border border-line bg-ink px-3 text-base outline-none focus:border-amber"
        />
      </label>
      <div className="mt-3 flex gap-2">
        {DYES.map((_, index) => (
          <button
            key={DYE_CLASS[index]}
            type="button"
            aria-label={`衫色 ${index + 1}`}
            className={`size-11 rounded-full ${DYE_CLASS[index]} ${props.profile.dye === index ? "ring-2 ring-amber ring-offset-2 ring-offset-ink" : ""}`}
            onClick={() => props.onProfile({ ...props.profile, dye: index })}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {HAIR_LABELS.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => props.onProfile({ ...props.profile, hair: index })}
            className={`h-11 rounded-xl border text-sm ${props.profile.hair === index ? "border-amber bg-amber text-ink" : "border-line"}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function rowsAround(props: Parameters<typeof PlazaChrome>[0], _tick: number) {
  const px = props.player.current.x;
  const pz = props.player.current.z;
  const t = Date.now() / 1000;
  const npcRows = NPCS.map((npc) => {
    const at = npcAt(npc, t);
    const dist = Math.hypot(at.x - px, at.z - pz);
    return { id: npc.id, name: npc.name, meta: `常客 · ${dist.toFixed(0)} 米`, dist };
  });
  const peerRows = props.peers.map((peer) => {
    const pose = props.remotes.current.get(peer.id);
    const dist = pose ? Math.hypot(pose.x - px, pose.z - pz) : null;
    const state =
      peer.connectionState === "connected" ? "喺度" : peer.connectionState === "failed" ? "連唔到" : "連緊";
    return {
      id: peer.id,
      name: pose?.name || peer.name || "街坊",
      meta: dist === null ? state : `${state} · ${dist.toFixed(0)} 米`,
      dist: dist ?? 99,
    };
  });
  return [...peerRows, ...npcRows].sort((a, b) => a.dist - b.dist);
}

function describeSelection(props: Parameters<typeof PlazaChrome>[0], _tick: number) {
  const id = props.selected;
  if (!id) return null;
  if (id === "self") {
    return { id, title: props.profile.name, detail: "呢個係你", greet: false, walk: false, friendId: "", dye: props.profile.dye, canPass: false };
  }
  const npc = NPCS.find((n) => n.id === id);
  if (npc) {
    return { id, title: npc.name, detail: "常客 · 只存在你部機", greet: true, walk: true, friendId: "", dye: npc.dye, canPass: false };
  }
  const pose = props.remotes.current.get(id);
  const peer = props.peers.find((p) => p.id === id);
  if (!pose && !peer) return null;
  const dist = pose ? Math.hypot(pose.x - props.player.current.x, pose.z - props.player.current.z) : null;
  return {
    id,
    title: pose?.name || peer?.name || "街坊",
    detail: dist === null ? "連緊" : `${dist.toFixed(1)} 米${dist < HEAR_MAX ? " · 聽得到" : " · 太遠聽唔到"}`,
    greet: true,
    walk: Boolean(pose),
    friendId: pose?.profileId && pose.profileId !== props.profile.id ? pose.profileId : "",
    dye: pose?.dye ?? 0,
    canPass: Boolean(pose) && dist !== null && dist <= PASS_RANGE && peer?.connectionState === "connected",
  };
}

function describeNear(props: Parameters<typeof PlazaChrome>[0], tick: number) {
  if (props.mic === "on") return "咪開住。綠色圈入面先聽到你。";
  const near = nearestPass(props, tick);
  if (near) return `行近${near.name}，可以傳檔或者開咪`;
  return "";
}

function nearestPass(props: Parameters<typeof PlazaChrome>[0], _tick: number) {
  let best = PASS_RANGE;
  let found: { id: string; name: string; dist: number } | null = null;
  for (const peer of props.peers) {
    if (peer.connectionState !== "connected") continue;
    const pose = props.remotes.current.get(peer.id);
    if (!pose) continue;
    const dist = Math.hypot(pose.x - props.player.current.x, pose.z - props.player.current.z);
    if (dist <= best) {
      best = dist;
      found = { id: peer.id, name: pose.name || peer.name || "街坊", dist };
    }
  }
  return found;
}
