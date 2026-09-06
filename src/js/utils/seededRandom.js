/**
 * POLARIS Nav-OS — Deterministic Seeded Pseudo-Random Number Generator
 *
 * Implements a Mulberry32 PRNG algorithm.
 * Guarantees 100% reproducible scenario generation given an integer seed.
 */

export class SeededRandom {
  constructor(seed = 12345) {
    this.initialSeed = typeof seed === 'number' ? Math.floor(seed) : 12345;
    this.state = (this.initialSeed ^ 0xDEADBEEF) >>> 0;
  }

  /**
   * Returns a pseudo-random float in the range [0, 1)
   */
  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns a pseudo-random float in the range [min, max)
   */
  range(min, max) {
    return min + this.next() * (max - min);
  }

  /**
   * Returns a pseudo-random integer in the range [min, max] (inclusive)
   */
  rangeInt(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  /**
   * Randomly chooses one element from an array
   */
  choice(array) {
    if (!Array.isArray(array) || array.length === 0) return null;
    return array[this.rangeInt(0, array.length - 1)];
  }
}
