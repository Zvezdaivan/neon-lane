/**
 * Calm hymn player for the confessional, fully synthesized with Web Audio.
 * Melodies are traditional public-domain hymn tunes, entered as note lists
 * (no recordings, no downloads):
 *  - NEW BRITAIN (Amazing Grace, 奇異恩典), American folk tune, 1829/1835
 *  - STILLE NACHT (Silent Night, 平安夜), Franz Gruber, 1818
 *  - HYMN TO JOY (歡欣歡欣), Beethoven, 1824
 * Audio is local to this player only; the context is created on the user's
 * keypress/click so browser autoplay rules are respected.
 */
type Note = [midi: number, beats: number];
export type Hymn = { name: string; bpm: number; key: number; notes: Note[] };

const AG: Note[] = [
  [62, 1], [67, 2], [71, 0.5], [67, 0.5], [71, 2], [69, 1], [67, 2], [64, 1], [62, 2],
  [62, 1], [67, 2], [71, 0.5], [67, 0.5], [71, 2], [69, 1], [74, 5],
  [71, 1], [74, 2], [71, 0.5], [67, 0.5], [71, 2], [69, 1], [67, 2], [64, 1], [62, 2],
  [62, 1], [67, 2], [71, 0.5], [67, 0.5], [71, 2], [69, 1], [67, 5],
];
const SN: Note[] = [
  [67, 3], [69, 1], [67, 2], [64, 6], [67, 3], [69, 1], [67, 2], [64, 6],
  [74, 4], [74, 2], [71, 6], [72, 4], [72, 2], [67, 6],
  [69, 4], [69, 2], [72, 3], [71, 1], [69, 2], [67, 3], [69, 1], [67, 2], [64, 6],
  [69, 4], [69, 2], [72, 3], [71, 1], [69, 2], [67, 3], [69, 1], [67, 2], [64, 6],
  [74, 4], [74, 2], [77, 3], [74, 1], [71, 2], [72, 6], [76, 6],
  [72, 2], [67, 2], [64, 2], [67, 3], [65, 1], [62, 2], [60, 12],
];
const JOY: Note[] = [
  [64, 1], [64, 1], [65, 1], [67, 1], [67, 1], [65, 1], [64, 1], [62, 1],
  [60, 1], [60, 1], [62, 1], [64, 1], [64, 1.5], [62, 0.5], [62, 2],
  [64, 1], [64, 1], [65, 1], [67, 1], [67, 1], [65, 1], [64, 1], [62, 1],
  [60, 1], [60, 1], [62, 1], [64, 1], [62, 1.5], [60, 0.5], [60, 2],
  [62, 1], [62, 1], [64, 1], [60, 1], [62, 1], [64, 0.5], [65, 0.5], [64, 1], [60, 1],
  [62, 1], [64, 0.5], [65, 0.5], [64, 1], [62, 1], [60, 1], [62, 1], [55, 2],
  [64, 1], [64, 1], [65, 1], [67, 1], [67, 1], [65, 1], [64, 1], [62, 1],
  [60, 1], [60, 1], [62, 1], [64, 1], [62, 1.5], [60, 0.5], [60, 2],
];

export const HYMNS: Hymn[] = [
  { name: "奇異恩典 Amazing Grace", bpm: 66, key: 55, notes: AG },
  { name: "平安夜 Silent Night", bpm: 150, key: 48, notes: SN },
  { name: "歡欣歡欣 Hymn to Joy", bpm: 76, key: 48, notes: JOY },
];

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

export class HymnPlayer {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer = 0;
  private hymn = 0;
  private idx = 0;
  private nextAt = 0;
  private pad: OscillatorNode[] = [];
  private padGain: GainNode | null = null;
  volume = 0.6;
  muted = false;
  active = 0; // voices currently sounding (for tests)
  onHymn: (name: string) => void = () => {};

  get playing() {
    return !!this.ctx && this.ctx.state === "running" && this.timer !== 0;
  }

  /** Call from a user gesture. */
  start() {
    if (this.timer) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = (this.ctx ??= new Ctx());
    void ctx.resume();
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    // Soft church-like reverb from a generated decaying-noise impulse.
    const verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.8);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.master.connect(ctx.destination);
    this.master.connect(verb).connect(wet).connect(ctx.destination);
    this.applyVolume(0.8);
    this.hymn = 0;
    this.beginHymn(ctx.currentTime + 0.3);
    this.timer = window.setInterval(() => this.tick(), 100);
  }

  stop() {
    window.clearInterval(this.timer);
    this.timer = 0;
    const ctx = this.ctx;
    const m = this.master;
    if (ctx && m) {
      m.gain.cancelScheduledValues(ctx.currentTime);
      m.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      const pads = this.pad;
      window.setTimeout(() => {
        pads.forEach((o) => o.stop());
        m.disconnect();
        void ctx.suspend();
      }, 700);
    }
    this.pad = [];
    this.master = null;
    this.active = 0;
  }

  setVolume(v: number) {
    this.volume = v;
    this.applyVolume(0.1);
  }
  setMuted(m: boolean) {
    this.muted = m;
    this.applyVolume(0.05);
  }
  private applyVolume(tc: number) {
    if (!this.ctx || !this.master) return;
    const g = this.muted ? 0 : this.volume * 0.5;
    this.master.gain.setTargetAtTime(g, this.ctx.currentTime, tc);
  }

  private beginHymn(at: number) {
    const ctx = this.ctx!;
    const h = HYMNS[this.hymn];
    this.idx = 0;
    this.nextAt = at;
    this.onHymn(h.name);
    // Organ pad: soft tonic + fifth drone under the melody.
    this.pad.forEach((o) => o.stop(at));
    this.padGain?.gain.setTargetAtTime(0, at, 0.5);
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(0, at);
    pg.gain.linearRampToValueAtTime(0.06, at + 2);
    pg.connect(this.master!);
    this.padGain = pg;
    this.pad = [h.key - 12, h.key - 5, h.key].map((m) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = hz(m);
      o.connect(pg);
      o.start(at);
      return o;
    });
  }

  private tick() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const h = HYMNS[this.hymn];
    const beat = 60 / h.bpm;
    while (this.nextAt < ctx.currentTime + 0.6) {
      if (this.idx >= h.notes.length) {
        this.hymn = (this.hymn + 1) % HYMNS.length;
        this.beginHymn(this.nextAt + 2.5);
        return;
      }
      const [m, b] = h.notes[this.idx++];
      this.voice(hz(m), this.nextAt, b * beat);
      this.nextAt += b * beat;
    }
  }

  /** Flute/organ-ish voice: sine + quiet octave, gentle attack and release. */
  private voice(f: number, t: number, dur: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1800;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.06);
    g.gain.setTargetAtTime(0.16, t + 0.06, 0.3);
    g.gain.setTargetAtTime(0, t + dur * 0.92, 0.12);
    g.connect(lp).connect(this.master!);
    const end = t + dur + 0.8;
    for (const [mult, type, amp] of [[1, "sine", 1], [2, "triangle", 0.18], [0.5, "sine", 0.25]] as const) {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = type;
      o.frequency.value = f * mult;
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(end);
      this.active++;
      o.onended = () => {
        this.active = Math.max(0, this.active - 1);
      };
    }
  }
}
