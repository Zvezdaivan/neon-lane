/**
 * Church interactions overlay: proximity prompts, the 電子聖經 reader and the
 * 電子告解室 quiet-reflection view with local synthesized hymns.
 */
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { BIBLE, BIBLE_VERSIONS, type BibleVersion } from "./bible-data";
import { HymnPlayer } from "./hymns";
import { OPEN_BIBLE_EVENT, sanctuary, type SanctuaryMode } from "./sanctuary-state";
import { boothFlush, remoteVisibilitySnapshot } from "./World";
import { BOOTH_EXIT, LECTERN } from "./sim";
import type { LocalBody } from "./types";

type Near = "" | "bible" | "booth";
const NEAR_R = 1.9;
const N_CH = BIBLE.hant.length;
const VERSION_KEY = "neon-lane:bible-version";

/**
 * Default Bible version: saved choice → browser languages (zh-Hant/HK/TW/MO →
 * 繁, zh-Hans/CN/SG/plain zh → 简, else EN). The game UI itself is fixed
 * Traditional Chinese (no i18n setting exists), so navigator.languages is the
 * only per-player language signal.
 */
function pickBibleVersion(saved: string | null, langs: readonly string[]): BibleVersion {
  if (saved === "hant" || saved === "hans" || saved === "en") return saved;
  // The player's first (preferred) language decides.
  const l = (langs[0] ?? "").toLowerCase();
  if (l.startsWith("zh")) return /hant|-(hk|tw|mo)\b/.test(l) ? "hant" : "hans";
  return "en";
}
function initialVersion(): BibleVersion {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(VERSION_KEY);
  } catch {
    saved = null;
  }
  const langs = typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language];
  return pickBibleVersion(saved, langs);
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

declare global {
  interface Window {
    __sanctuaryTest?: { mode: () => SanctuaryMode; pos: () => { x: number; z: number }; near: () => Near; audio: () => { state: string; playing: boolean; voices: number; live: number; muted: boolean; hymn: string }; peers: () => ReturnType<typeof remoteVisibilitySnapshot>; boothFlush: () => { at: number; pray: boolean }; warp: (x: number, z: number) => void };
  }
}

export function Sanctuary({
  entered,
  player,
  held,
}: {
  entered: boolean;
  player: MutableRefObject<LocalBody>;
  held: MutableRefObject<Set<string>>;
}) {
  const [mode, setMode] = useState<SanctuaryMode>("none");
  const [near, setNear] = useState<Near>("");
  const [chapter, setChapter] = useState(0);
  const [version, setVersionState] = useState<BibleVersion>(initialVersion);
  const setVersion = (v: BibleVersion) => {
    setVersionState(v);
    try {
      localStorage.setItem(VERSION_KEY, v);
    } catch {
      /* storage unavailable */
    }
  };
  const [hymn, setHymn] = useState("");
  const [vol, setVol] = useState(0.6);
  const [muted, setMuted] = useState(false);
  const music = useRef<HymnPlayer | null>(null);
  const st = useRef({ mode, near });
  st.current = { mode, near };

  useEffect(() => sanctuary.subscribe(() => setMode(sanctuary.mode)), []);

  // Proximity polling (cheap; 6–7 Hz is plenty for a prompt).
  useEffect(() => {
    if (!entered) return;
    const id = window.setInterval(() => {
      const p = player.current;
      const dB = Math.hypot(p.x - LECTERN.x, p.z - LECTERN.z);
      const dC = Math.hypot(p.x - BOOTH_EXIT.x, p.z - BOOTH_EXIT.z);
      setNear(dB < NEAR_R ? "bible" : dC < NEAR_R ? "booth" : "");
    }, 150);
    return () => window.clearInterval(id);
  }, [entered, player]);

  const open = (next: SanctuaryMode) => {
    held.current.clear();
    if (next === "booth") {
      const m = (music.current ??= new HymnPlayer());
      m.onHymn = setHymn;
      m.setVolume(vol);
      m.start(); // inside the key/click gesture → allowed to start audio
    }
    sanctuary.set(next);
  };
  const close = () => {
    if (sanctuary.mode === "booth") {
      music.current?.stop();
      const p = player.current;
      p.x = BOOTH_EXIT.x;
      p.z = BOOTH_EXIT.z;
    }
    held.current.clear();
    sanctuary.set("none");
  };
  const act = useRef({ open, close });
  act.current = { open, close };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.repeat) return;
      const s = st.current;
      if (s.mode !== "none") {
        if (e.code === "Escape" || e.code === "KeyE") {
          e.preventDefault();
          act.current.close();
        }
        if (s.mode === "bible" && (e.code === "ArrowRight" || e.code === "ArrowLeft")) {
          e.preventDefault();
          setChapter((c) => (c + (e.code === "ArrowRight" ? 1 : N_CH - 1)) % N_CH);
        }
        return;
      }
      if (e.code !== "KeyE") return;
      if (s.near === "bible") act.current.open("bible");
      else if (s.near === "booth") act.current.open("booth");
    };
    const click = () => {
      const p = player.current;
      if (st.current.mode === "none" && Math.hypot(p.x - LECTERN.x, p.z - LECTERN.z) < NEAR_R + 1.5) act.current.open("bible");
    };
    window.addEventListener("keydown", down);
    window.addEventListener(OPEN_BIBLE_EVENT, click);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener(OPEN_BIBLE_EVENT, click);
    };
  }, [player]);

  useEffect(() => {
    window.__sanctuaryTest = {
      mode: () => sanctuary.mode,
      pos: () => ({ x: player.current.x, z: player.current.z }),
      near: () => st.current.near,
      audio: () => ({
        state: music.current?.ctx?.state ?? "none",
        playing: music.current?.playing ?? false,
        voices: music.current?.active ?? 0,
        live: music.current?.live ?? 0,
        muted: music.current?.muted ?? false,
        hymn: music.current ? hymn : "",
      }),
      peers: () => remoteVisibilitySnapshot(),
      boothFlush: () => ({ at: boothFlush.at, pray: boothFlush.pray }),
      warp: (x, z) => { player.current.x = x; player.current.z = z; },
    };
  }, [hymn, player]);

  useEffect(
    () => () => {
      music.current?.stop();
      sanctuary.set("none");
    },
    [],
  );

  if (!entered) return null;
  const book = BIBLE[version];
  const ch = book[chapter];
  const vinfo = BIBLE_VERSIONS.find((v) => v.id === version)!;

  return (
    <>
      {mode === "none" && near ? (
        <div className="pointer-events-none absolute inset-x-0 top-[22%] z-30 flex justify-center">
            <button
              type="button"
              data-testid="sanctuary-prompt"
              onClick={() => open(near)}
              className="pointer-events-auto rounded-full border-2 border-white/70 bg-amber px-5 py-2.5 text-base font-bold text-ink shadow-lg transition hover:scale-105"
            >
              {near === "bible" ? "📖 按 E 打開聖經" : "🕯️ 按 E 入去靜思"}
            </button>
        </div>
      ) : null}

      {mode === "bible" ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink/55 p-3" onClick={close}>
          <div
            role="dialog"
            aria-label="電子聖經"
            onClick={(e) => e.stopPropagation()}
            className="flex h-[min(86dvh,640px)] w-[min(96vw,860px)] overflow-hidden rounded-[28px] border-4 border-[#ffc83d] bg-[#fff8ec] text-[#3b2a1a] shadow-2xl"
          >
            <nav className="hidden w-56 shrink-0 flex-col gap-1.5 overflow-y-auto bg-[#ffe7b8] p-3 sm:flex">
              <div className="mb-1 px-2 text-lg font-black">📖 電子聖經</div>
              <div className="mb-2 flex gap-1 px-1" role="group" aria-label="版本">
                {BIBLE_VERSIONS.map((v) => (
                  <button key={v.id} type="button" data-testid={`bible-ver-${v.id}`} aria-pressed={v.id === version} onClick={() => setVersion(v.id)}
                    className={`flex-1 rounded-full py-1 text-sm font-black ${v.id === version ? "bg-[#3a86ff] text-white" : "bg-white/70"}`}>{v.label}</button>
                ))}
              </div>
              {book.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  data-testid={`bible-ch-${c.id}`}
                  onClick={() => setChapter(i)}
                  className={`rounded-2xl px-3 py-2 text-left text-sm font-bold transition ${i === chapter ? "bg-[#ff7b54] text-white" : "bg-white/70 hover:bg-white"}`}
                >
                  {c.title}
                  <div className={`text-xs font-medium ${i === chapter ? "text-white/85" : "text-[#8a6a4a]"}`}>{c.subtitle}</div>
                </button>
              ))}
            </nav>
            <section className="flex min-w-0 flex-1 flex-col">
              <header className="flex items-center gap-2 border-b-2 border-[#ffe0a3] px-5 py-3">
                <select
                  aria-label="章節"
                  className="rounded-xl bg-[#ffe7b8] px-2 py-1 text-sm font-bold sm:hidden"
                  value={chapter}
                  onChange={(e) => setChapter(Number(e.target.value))}
                >
                  {book.map((c, i) => (
                    <option key={c.id} value={i}>{c.title}</option>
                  ))}
                </select>
                <h2 className="hidden flex-1 text-2xl font-black sm:block" data-testid="bible-title">{ch.title}</h2>
                <div className="flex-1 sm:hidden" />
                <div className="flex gap-1 sm:hidden">
                  {BIBLE_VERSIONS.map((v) => (
                    <button key={v.id} type="button" onClick={() => setVersion(v.id)} className={`rounded-full px-2 py-1 text-xs font-black ${v.id === version ? "bg-[#3a86ff] text-white" : "bg-[#ffe7b8]"}`}>{v.label}</button>
                  ))}
                </div>
                <button type="button" aria-label="關閉" data-testid="bible-close" onClick={close} className="grid h-10 w-10 place-items-center rounded-full bg-[#ff7b54] text-xl font-black text-white">✕</button>
              </header>
              <article lang={version === "en" ? "en" : version === "hans" ? "zh-Hans" : "zh-Hant"} data-testid="bible-text" className="flex-1 overflow-y-auto px-6 py-4 text-[19px] leading-[2.05]">
                <div className="mb-2 text-sm font-bold text-[#c0603a]">{ch.subtitle}</div>
                {ch.verses.map((v) => (
                  <p key={v.n} className="mb-1">
                    <sup className="mr-1 font-bold text-[#ff7b54]">{v.n}</sup>
                    {v.t}
                  </p>
                ))}
              </article>
              <footer className="flex items-center justify-between gap-2 border-t-2 border-[#ffe0a3] px-4 py-2.5">
                <button type="button" data-testid="bible-prev" onClick={() => setChapter((c) => (c + N_CH - 1) % N_CH)} className="rounded-full bg-[#7bd389] px-4 py-1.5 font-bold text-white">{version === "en" ? "◀ Prev" : version === "hans" ? "◀ 上一篇" : "◀ 上一篇"}</button>
                <span className="text-center text-xs text-[#8a6a4a]">{vinfo.source}</span>
                <button type="button" data-testid="bible-next" onClick={() => setChapter((c) => (c + 1) % N_CH)} className="rounded-full bg-[#3a86ff] px-4 py-1.5 font-bold text-white">{version === "en" ? "Next ▶" : "下一篇 ▶"}</button>
              </footer>
            </section>
          </div>
        </div>
      ) : null}

      {mode === "booth" ? (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-5 bg-[radial-gradient(ellipse_at_center,rgba(255,200,120,0.55),rgba(40,20,40,0.92)_70%)] text-center text-cream">
          <div className="text-6xl">🕯️</div>
          <div className="text-3xl font-black tracking-wide">靜靜地祈禱、反思</div>
          <div className="text-base text-cream/80">呢度只有你自己，慢慢呼吸，聽下詩歌。</div>
          <div className="rounded-full bg-black/35 px-5 py-2 text-sm font-bold" data-testid="hymn-name">♪ {hymn || "…"}</div>
          <div className="flex items-center gap-3 rounded-full bg-black/35 px-4 py-2">
            <button
              type="button"
              data-testid="hymn-mute"
              onClick={() => {
                const next = !muted;
                setMuted(next);
                music.current?.setMuted(next);
              }}
              className="rounded-full bg-amber px-3 py-1 text-sm font-bold text-ink"
            >
              {muted ? "🔇 開聲" : "🔊 靜音"}
            </button>
            <input
              aria-label="音量"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={vol}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVol(v);
                music.current?.setVolume(v);
              }}
            />
          </div>
          <button type="button" data-testid="booth-leave" onClick={close} className="rounded-full border-2 border-white/60 px-5 py-2 font-bold">
            離開（E / Esc）
          </button>
        </div>
      ) : null}
    </>
  );
}
