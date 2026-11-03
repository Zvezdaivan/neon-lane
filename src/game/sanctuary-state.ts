/**
 * Tiny shared state for the church interactions (Bible reader, confessional).
 * Kept outside React so the r3f Driver/NetPump can read it every frame.
 */
export type SanctuaryMode = "none" | "bible" | "booth";

const listeners = new Set<() => void>();
let mode: SanctuaryMode = "none";
let claimAt = 0;
let selfId = "";

export const sanctuary = {
  get mode() {
    return mode;
  },
  /** True while an overlay owns input (movement keys are ignored). */
  get modal() {
    return mode !== "none";
  },
  /** ms timestamp of our confessional claim (0 when not in the booth); synced in the pose. */
  get claimAt() {
    return claimAt;
  },
  get selfId() {
    return selfId;
  },
  setSelfId(id: string) {
    selfId = id;
  },
  set(next: SanctuaryMode) {
    if (next === mode) return;
    if (next === "booth") claimAt = Date.now();
    else if (mode === "booth") claimAt = 0;
    mode = next;
    for (const fn of listeners) fn();
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

/** Fired by a click on the 3D Bible; the overlay decides whether it opens. */
export const OPEN_BIBLE_EVENT = "neon:open-bible";
