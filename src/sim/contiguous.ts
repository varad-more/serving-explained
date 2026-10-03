/**
 * The contiguous-max allocator (docs/SIM.md §3, §4.3): each admitted request
 * reserves `maxModelLen` slots, first-fit, in a [0, capacity) address space.
 * Not a vLLM mode; it models the pre-paged systems (kwon2023 §3.1, §6.1 "Max").
 *
 * With equal regions, every gap between regions fits a region exactly, so the
 * only slots that can never be used are the tail gap, capacity mod
 * maxModelLen. v1 keeps equal regions (Q4).
 */
import type { Region } from "./types.ts";

export interface Reservation extends Region {
  req: number;
  used: number;
}

export class ContiguousPool {
  readonly capacity: number;
  readonly regionLen: number;
  /** Sorted by start. */
  private regions: Reservation[] = [];

  constructor(capacity: number, regionLen: number) {
    this.capacity = capacity;
    this.regionLen = regionLen;
  }

  /** The first gap that fits a region, or null. */
  private firstFit(): { start: number; index: number } | null {
    let start = 0;
    for (const [index, r] of this.regions.entries()) {
      if (r.start - start >= this.regionLen) return { start, index };
      start = r.start + r.len;
    }
    return start + this.regionLen <= this.capacity
      ? { start, index: this.regions.length }
      : null;
  }

  /** First-fit; null when no gap is large enough. */
  reserve(req: number): Reservation | null {
    const fit = this.firstFit();
    if (!fit) return null;
    const region: Reservation = {
      req,
      start: fit.start,
      len: this.regionLen,
      used: 0,
    };
    this.regions.splice(fit.index, 0, region);
    return region;
  }

  canReserve(): boolean {
    return this.firstFit() !== null;
  }

  get(req: number): Reservation | undefined {
    return this.regions.find((r) => r.req === req);
  }

  release(req: number): Reservation {
    const i = this.regions.findIndex((r) => r.req === req);
    const region = this.regions[i];
    if (!region) throw new Error(`request ${String(req)} holds no region`);
    this.regions.splice(i, 1);
    return region;
  }

  allocatedSlots(): number {
    return this.regions.reduce((s, r) => s + r.len, 0);
  }

  usedSlots(): number {
    return this.regions.reduce((s, r) => s + r.used, 0);
  }

  /** Free slots in gaps too small for a region, the tail gap included. */
  unusableSlots(): number {
    let unusable = 0;
    let start = 0;
    for (const r of [...this.regions, { start: this.capacity, len: 0 }]) {
      const gap = r.start - start;
      if (gap < this.regionLen) unusable += gap;
      start = r.start + r.len;
    }
    return unusable;
  }

  view(): Reservation[] {
    return this.regions.map((r) => ({ ...r }));
  }
}
