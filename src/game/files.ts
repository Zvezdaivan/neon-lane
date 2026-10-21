/** Close-range file handoff. Bytes stay on the WebRTC reliable channel. */

export const PASS_RANGE = 2.8;
export const PASS_BREAK = 6;
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const CHUNK_BYTES = 12_000;

const ID_RE = /^f[a-z0-9]{8}$/;

export type PassStatus = "in" | "out" | "send" | "recv" | "ready" | "done" | "fail";

export type PassView = {
  id: string;
  peerId: string;
  peerName: string;
  fileName: string;
  size: number;
  progress: number;
  status: PassStatus;
  note: string;
  url?: string;
};

type Job = {
  id: string;
  peerId: string;
  peerName: string;
  fileName: string;
  mime: string;
  size: number;
  status: PassStatus;
  got: number;
  total: number;
  chunks: Map<number, Uint8Array>;
  file?: File;
  url?: string;
  note: string;
  abort: boolean;
};

export function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const step = 0x2000;
  for (let i = 0; i < bytes.length; i += step) {
    const slice = bytes.subarray(i, Math.min(bytes.length, i + step));
    bin += String.fromCharCode.apply(null, Array.from(slice));
  }
  return btoa(bin);
}

export function b64ToBytes(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i) & 255;
  return out;
}

export function safeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const cleaned = base.replace(/[^\w.\-\u3400-\u9fff ]+/gu, "").trim();
  return (cleaned || "file").slice(0, 64);
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function newId() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "f";
  for (let i = 0; i < 8; i += 1) id += alphabet[Math.floor(Math.random() * alphabet.length)] ?? "a";
  return id;
}

function viewOf(job: Job): PassView {
  return {
    id: job.id,
    peerId: job.peerId,
    peerName: job.peerName,
    fileName: job.fileName,
    size: job.size,
    progress: job.size > 0 ? Math.min(1, job.got / job.size) : 0,
    status: job.status,
    note: job.note,
    url: job.url,
  };
}

export class FilePass {
  private jobs = new Map<string, Job>();
  private pumping = new Set<string>();
  private readonly opts: {
    send: (data: unknown, peerId: string) => void;
    distance: (peerId: string) => number | null;
    nameOf: (peerId: string) => string;
    onChange: (views: PassView[]) => void;
    onNote: (text: string) => void;
  };

  constructor(opts: {
    send: (data: unknown, peerId: string) => void;
    distance: (peerId: string) => number | null;
    nameOf: (peerId: string) => string;
    onChange: (views: PassView[]) => void;
    onNote: (text: string) => void;
  }) {
    this.opts = opts;
  }

  private publish() {
    this.opts.onChange([...this.jobs.values()].map(viewOf));
  }

  reset() {
    for (const job of this.jobs.values()) {
      job.abort = true;
      if (job.url) URL.revokeObjectURL(job.url);
    }
    this.jobs.clear();
    this.publish();
  }

  dismiss(id: string) {
    const job = this.jobs.get(id);
    if (!job) return;
    job.abort = true;
    if (job.status === "send" || job.status === "recv" || job.status === "out" || job.status === "in") {
      try {
        this.opts.send({ k: "fx", id }, job.peerId);
      } catch {
        /* peer already gone */
      }
    }
    if (job.url) URL.revokeObjectURL(job.url);
    this.jobs.delete(id);
    this.publish();
  }

  offer(peerId: string, file: File): string | null {
    if (file.size <= 0) {
      this.opts.onNote("檔案係空嘅");
      return null;
    }
    if (file.size > MAX_FILE_BYTES) {
      this.opts.onNote(`檔案太大，上限 ${formatBytes(MAX_FILE_BYTES)}`);
      return null;
    }
    const dist = this.opts.distance(peerId);
    if (dist === null || dist > PASS_RANGE) {
      this.opts.onNote("行近啲先傳到");
      return null;
    }
    if ([...this.jobs.values()].some((job) => job.status === "out" || job.status === "send")) {
      this.opts.onNote("有檔案傳緊，等呢次完先");
      return null;
    }
    const id = newId();
    const fileName = safeFileName(file.name);
    const job: Job = {
      id,
      peerId,
      peerName: this.opts.nameOf(peerId),
      fileName,
      mime: (file.type || "application/octet-stream").slice(0, 80),
      size: file.size,
      status: "out",
      got: 0,
      total: Math.ceil(file.size / CHUNK_BYTES),
      chunks: new Map(),
      file,
      note: "等對方接收",
      abort: false,
    };
    this.jobs.set(id, job);
    this.publish();
    try {
      this.opts.send({ k: "fo", id, name: fileName, size: file.size, mime: job.mime }, peerId);
    } catch {
      this.fail(job, "傳唔出");
      return null;
    }
    this.opts.onNote(`問緊${job.peerName}收唔收 ${fileName}`);
    setTimeout(() => {
      const current = this.jobs.get(id);
      if (!current || current.status !== "out") return;
      try {
        this.opts.send({ k: "fx", id }, peerId);
      } catch {
        /* gone */
      }
      this.fail(current, "對方未接收");
    }, 45000);
    return id;
  }

  accept(id: string) {
    const job = this.jobs.get(id);
    if (!job || job.status !== "in") return;
    const dist = this.opts.distance(job.peerId);
    if (dist === null || dist > PASS_BREAK) {
      try {
        this.opts.send({ k: "fr", id }, job.peerId);
      } catch {
        /* gone */
      }
      this.fail(job, "行開咗，收唔到");
      return;
    }
    job.status = "recv";
    job.note = "接收緊";
    this.publish();
    try {
      this.opts.send({ k: "fa", id }, job.peerId);
    } catch {
      this.fail(job, "連唔到對方");
    }
  }

  reject(id: string) {
    const job = this.jobs.get(id);
    if (!job || job.status !== "in") return;
    try {
      this.opts.send({ k: "fr", id }, job.peerId);
    } catch {
      /* gone */
    }
    this.jobs.delete(id);
    this.publish();
    this.opts.onNote("已拒絕");
  }

  /** Returns true when the payload is a file message (even if ignored). */
  onMessage(from: string, data: unknown): boolean {
    if (!data || typeof data !== "object") return false;
    const msg = data as Record<string, unknown>;
    const kind = msg.k;
    if (kind !== "fo" && kind !== "fa" && kind !== "fr" && kind !== "fc" && kind !== "fd" && kind !== "fx") {
      return false;
    }
    const id = typeof msg.id === "string" ? msg.id : "";
    if (!ID_RE.test(id)) return true;
    if (kind === "fo") this.onOffer(from, id, msg);
    else if (kind === "fa") this.onAccept(from, id);
    else if (kind === "fr") this.onReject(id);
    else if (kind === "fc") this.onChunk(from, id, msg);
    else if (kind === "fd") this.onDone(id);
    else this.onCancel(id);
    return true;
  }

  private onOffer(from: string, id: string, msg: Record<string, unknown>) {
    if (this.jobs.has(id)) return;
    const size = msg.size;
    const name = typeof msg.name === "string" ? safeFileName(msg.name) : "";
    const mime = typeof msg.mime === "string" ? msg.mime.slice(0, 80) : "application/octet-stream";
    const reject = () => {
      try {
        this.opts.send({ k: "fr", id }, from);
      } catch {
        /* ignore */
      }
    };
    if (!name || typeof size !== "number" || !Number.isInteger(size) || size <= 0 || size > MAX_FILE_BYTES) {
      reject();
      return;
    }
    const busy = [...this.jobs.values()].some(
      (job) => job.peerId === from && (job.status === "in" || job.status === "recv"),
    );
    const dist = this.opts.distance(from);
    if (busy || dist === null || dist > PASS_BREAK) {
      reject();
      return;
    }
    const peerName = this.opts.nameOf(from);
    const job: Job = {
      id,
      peerId: from,
      peerName,
      fileName: name,
      mime,
      size,
      status: "in",
      got: 0,
      total: Math.ceil(size / CHUNK_BYTES),
      chunks: new Map(),
      note: "等你接收",
      abort: false,
    };
    this.jobs.set(id, job);
    this.publish();
    this.opts.onNote(`${peerName} 想傳 ${name}（${formatBytes(size)}）`);
    setTimeout(() => {
      const current = this.jobs.get(id);
      if (!current || current.status !== "in") return;
      this.jobs.delete(id);
      this.publish();
    }, 45000);
  }

  private onAccept(from: string, id: string) {
    const job = this.jobs.get(id);
    if (!job || job.peerId !== from || job.status !== "out" || !job.file) return;
    job.status = "send";
    job.note = "傳緊";
    this.publish();
    void this.pump(job);
  }

  private onReject(id: string) {
    const job = this.jobs.get(id);
    if (!job || (job.status !== "out" && job.status !== "send")) return;
    this.fail(job, `${job.peerName} 拒絕收 ${job.fileName}`);
  }

  private onCancel(id: string) {
    const job = this.jobs.get(id);
    if (!job || job.status === "ready" || job.status === "done" || job.status === "fail") return;
    job.abort = true;
    this.fail(job, "傳輸取消");
  }

  private onChunk(from: string, id: string, msg: Record<string, unknown>) {
    const job = this.jobs.get(id);
    if (!job || job.peerId !== from || job.status !== "recv" || job.abort) return;
    const index = msg.i;
    const total = msg.n;
    const payload = msg.d;
    if (typeof index !== "number" || typeof total !== "number" || typeof payload !== "string") return;
    if (!Number.isInteger(index) || !Number.isInteger(total)) return;
    if (total !== job.total || index < 0 || index >= job.total) return;
    if (payload.length > 20_000) return;
    if (job.chunks.has(index)) return;
    let bytes: Uint8Array;
    try {
      bytes = b64ToBytes(payload);
    } catch {
      this.fail(job, "檔案壞咗");
      return;
    }
    if (bytes.length === 0 || bytes.length > CHUNK_BYTES) return;
    if (job.got + bytes.length > job.size) {
      this.fail(job, "檔案壞咗");
      return;
    }
    job.chunks.set(index, bytes);
    job.got += bytes.length;
    if (job.chunks.size % 3 === 0) this.publish();
  }

  private onDone(id: string) {
    const job = this.jobs.get(id);
    if (!job || job.status !== "recv") return;
    if (job.chunks.size !== job.total || job.got !== job.size) {
      this.fail(job, "檔案未齊");
      return;
    }
    const parts: BlobPart[] = [];
    for (let i = 0; i < job.total; i += 1) {
      const part = job.chunks.get(i);
      if (!part) {
        this.fail(job, "檔案未齊");
        return;
      }
      parts.push(new Uint8Array(part));
    }
    const blob = new Blob(parts, { type: job.mime || "application/octet-stream" });
    job.chunks.clear();
    if (typeof URL.createObjectURL === "function") job.url = URL.createObjectURL(blob);
    job.status = "ready";
    job.got = job.size;
    job.note = "可以下載";
    this.publish();
    this.opts.onNote(`收到 ${job.fileName}`);
  }

  private fail(job: Job, note: string) {
    if (job.status === "fail" || job.status === "ready" || job.status === "done") return;
    job.abort = true;
    job.status = "fail";
    job.note = note;
    job.chunks.clear();
    job.file = undefined;
    this.publish();
    this.opts.onNote(note);
  }

  private async pump(job: Job) {
    if (this.pumping.has(job.id) || !job.file) return;
    this.pumping.add(job.id);
    try {
      const buf = new Uint8Array(await job.file.arrayBuffer());
      if (buf.length !== job.size) {
        this.fail(job, "檔案讀唔到");
        return;
      }
      for (let i = 0; i < job.total; i += 1) {
        if (job.abort) return;
        const dist = this.opts.distance(job.peerId);
        if (dist === null || dist > PASS_BREAK) {
          try {
            this.opts.send({ k: "fx", id: job.id }, job.peerId);
          } catch {
            /* gone */
          }
          this.fail(job, "行開咗，傳輸取消");
          return;
        }
        const slice = buf.subarray(i * CHUNK_BYTES, Math.min(buf.length, (i + 1) * CHUNK_BYTES));
        const payload = { k: "fc", id: job.id, i, n: job.total, d: bytesToB64(slice) };
        let sent = false;
        for (let attempt = 0; attempt < 40 && !sent && !job.abort; attempt += 1) {
          try {
            this.opts.send(payload, job.peerId);
            sent = true;
          } catch {
            await sleep(40);
          }
        }
        if (job.abort) return;
        if (!sent) {
          this.fail(job, "傳輸中斷");
          return;
        }
        job.got = Math.min(job.size, (i + 1) * CHUNK_BYTES);
        if (i % 2 === 0) this.publish();
        await sleep(6);
      }
      if (job.abort) return;
      this.opts.send({ k: "fd", id: job.id, n: job.total }, job.peerId);
      job.status = "done";
      job.got = job.size;
      job.note = "已送出";
      job.file = undefined;
      this.publish();
      this.opts.onNote(`已傳 ${job.fileName} 俾${job.peerName}`);
    } catch {
      if (!job.abort) this.fail(job, "傳輸中斷");
    } finally {
      this.pumping.delete(job.id);
    }
  }
}
