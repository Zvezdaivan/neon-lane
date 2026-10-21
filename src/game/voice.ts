const OUT_RATE = 16000;
export const HEAR_FULL = 2.4;
export const HEAR_MAX = 7.4;

export type MicResult = "ok" | "denied" | "missing";

export function voiceGain(dist: number): number {
  if (dist <= HEAR_FULL) return 1;
  if (dist >= HEAR_MAX) return 0;
  const t = (dist - HEAR_FULL) / (HEAR_MAX - HEAR_FULL);
  return (1 - t) * (1 - t);
}

function downsampleAvg(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (inRate <= outRate + 1) return input;
  const ratio = inRate / outRate;
  const len = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(len);
  for (let i = 0; i < len; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j += 1) {
      sum += input[j] ?? 0;
      count += 1;
    }
    out[i] = count ? sum / count : 0;
  }
  return out;
}

function floatToB64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(i * 2, (s < 0 ? s * 0x8000 : s * 0x7fff) | 0, true);
  }
  let bin = "";
  const chunk = 0x4000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function b64ToFloat(b64: string): Float32Array | null {
  try {
    const bin = atob(b64);
    if (bin.length < 2 || bin.length > 16000 || bin.length % 2 !== 0) return null;
    const n = bin.length / 2;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const lo = bin.charCodeAt(i * 2);
      const hi = bin.charCodeAt(i * 2 + 1);
      let v = lo | (hi << 8);
      if (v & 0x8000) v -= 0x10000;
      out[i] = v / 32768;
    }
    return out;
  } catch {
    return null;
  }
}

function audioContext(): AudioContext | null {
  const Ctor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  return new Ctor();
}

export class PlazaAudio {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private mute: GainNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private ambienceStop: (() => void) | null = null;
  private queue: Float32Array[] = [];
  private players = new Map<string, { next: number; seq: number }>();
  private talkUntil = 0;
  private seq = 0;
  private wantAmbience = false;
  talking = false;

  constructor(
    private opts: {
      send: (payload: unknown) => void;
      volumeFor: (peerId: string) => number;
      onTalking?: (talking: boolean) => void;
    },
  ) {}

  unlock() {
    const ctx = this.ensure();
    if (!ctx) return;
    void ctx.resume();
    if (this.wantAmbience) this.startAmbience();
  }

  setAmbience(on: boolean) {
    this.wantAmbience = on;
    if (!this.ctx) return;
    if (on) this.startAmbience();
    else this.stopAmbience();
  }

  async setMic(on: boolean): Promise<MicResult> {
    if (!on) {
      this.stopMic();
      return "ok";
    }
    if (!navigator.mediaDevices?.getUserMedia) return "missing";
    const ctx = this.ensure();
    if (!ctx) return "missing";
    void ctx.resume();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
        video: false,
      });
    } catch {
      return "denied";
    }
    this.source = ctx.createMediaStreamSource(this.stream);
    this.mute = ctx.createGain();
    this.mute.gain.value = 0;
    const ok = await this.attachCapture(ctx);
    if (!ok) {
      this.stopMic();
      return "missing";
    }
    return "ok";
  }

  ingest(from: string, b64: string, seq: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const samples = b64ToFloat(b64);
    if (!samples) return;
    const slot = this.players.get(from) ?? { next: 0, seq: -1 };
    if (seq <= slot.seq) return;
    slot.seq = seq;
    const vol = this.opts.volumeFor(from);
    if (vol < 0.02) {
      slot.next = 0;
      this.players.set(from, slot);
      return;
    }
    const buffer = ctx.createBuffer(1, samples.length, OUT_RATE);
    buffer.getChannelData(0).set(samples);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = Math.min(1, vol);
    src.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    if (slot.next < now + 0.02) slot.next = now + 0.07;
    if (slot.next > now + 0.45) slot.next = now + 0.08;
    src.start(slot.next);
    slot.next += buffer.duration;
    this.players.set(from, slot);
  }

  playBlip() {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 540;
    gain.gain.setValueAtTime(0.03, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  }

  dispose() {
    this.stopMic();
    this.stopAmbience();
    void this.ctx?.close();
    this.ctx = null;
  }

  private ensure(): AudioContext | null {
    if (!this.ctx) this.ctx = audioContext();
    return this.ctx;
  }

  private setTalking(next: boolean) {
    if (next === this.talking) return;
    this.talking = next;
    this.opts.onTalking?.(next);
  }

  private handleInput(input: Float32Array) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.queue.push(new Float32Array(input));
    let total = 0;
    for (const chunk of this.queue) total += chunk.length;
    if (total < ctx.sampleRate * 0.05) return;
    const merged = new Float32Array(total);
    let offset = 0;
    for (const chunk of this.queue) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    this.queue = [];
    let sum = 0;
    for (let i = 0; i < merged.length; i += 1) sum += (merged[i] ?? 0) ** 2;
    const rms = Math.sqrt(sum / merged.length);
    const now = performance.now();
    if (rms > 0.02) this.talkUntil = now + 220;
    this.setTalking(now < this.talkUntil);
    if (rms < 0.015) return;
    const down = downsampleAvg(merged, ctx.sampleRate, OUT_RATE);
    this.seq += 1;
    this.opts.send({ k: "v", seq: this.seq, pcm: floatToB64(down) });
  }

  private async attachCapture(ctx: AudioContext): Promise<boolean> {
    if (!this.source || !this.mute) return false;
    try {
      const code =
        "class P extends AudioWorkletProcessor{process(i){const c=i[0]&&i[0][0];if(c)this.port.postMessage(c.slice(0));return true}}" +
        "registerProcessor('pcm-tap',P);";
      const url = URL.createObjectURL(new Blob([code], { type: "application/javascript" }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const node = new AudioWorkletNode(ctx, "pcm-tap");
      node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (event.data) this.handleInput(event.data);
      };
      this.source.connect(node);
      node.connect(this.mute);
      this.mute.connect(ctx.destination);
      this.worklet = node;
      return true;
    } catch {
      try {
        const proc = ctx.createScriptProcessor(2048, 1, 1);
        proc.onaudioprocess = (event) => {
          this.handleInput(event.inputBuffer.getChannelData(0));
        };
        this.source.connect(proc);
        proc.connect(this.mute);
        this.mute.connect(ctx.destination);
        this.processor = proc;
        return true;
      } catch {
        return false;
      }
    }
  }

  private stopMic() {
    this.worklet?.disconnect();
    this.processor?.disconnect();
    this.source?.disconnect();
    this.mute?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.worklet = null;
    this.processor = null;
    this.source = null;
    this.mute = null;
    this.stream = null;
    this.queue = [];
    this.talkUntil = 0;
    this.setTalking(false);
  }

  private startAmbience() {
    const ctx = this.ctx;
    if (!ctx || this.ambienceStop) return;
    const master = ctx.createGain();
    master.gain.value = 0.018;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 480;
    const make = (freq: number, type: OscillatorType, level: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = level;
      osc.connect(gain);
      gain.connect(filter);
      osc.start();
      return osc;
    };
    const low = make(174.6, "sine", 0.65);
    const mid = make(220, "triangle", 0.18);
    filter.connect(master);
    master.connect(ctx.destination);
    this.ambienceStop = () => {
      low.stop();
      mid.stop();
      master.disconnect();
    };
  }

  private stopAmbience() {
    this.ambienceStop?.();
    this.ambienceStop = null;
  }
}
