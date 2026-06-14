import { COMPACTION_THRESHOLD } from "./constants";

/**
 * Time-based sliding window for calculating tokens-per-second.
 *
 * Records timestamped token events and calculates TPS by summing tokens
 * within the most recent window. Compacts old events periodically to
 * prevent unbounded memory growth.
 */
export class SlidingWindow {
  private readonly events: { time: number; tokens: number }[] = [];
  private windowStartIndex = 0;

  constructor(private readonly windowMs: number) {}

  /**
   * Records a batch of tokens with the current timestamp.
   * Compacts old events when the index reaches the compaction threshold.
   *
   * @param tokens The number of tokens to record.
   */
  record(tokens: number): void {
    this.events.push({ time: Date.now(), tokens });

    if (this.windowStartIndex >= COMPACTION_THRESHOLD) {
      this.compact();
    }
  }

  /**
   * Calculates tokens-per-second within the sliding window.
   *
   * Uses the actual time span of tokens in the window for finer precision
   * rather than the full window duration. Returns 0 if no tokens are in the window.
   *
   * @param now Current timestamp in milliseconds.
   * @returns Tokens per second, or 0 if the window is empty.
   */
  getTps(now: number): number {
    if (this.events.length === 0) return 0;

    const windowStart = now - this.windowMs;

    // Advance past events older than the window
    while (
      this.windowStartIndex < this.events.length &&
      this.events[this.windowStartIndex].time < windowStart
    ) {
      this.windowStartIndex++;
    }

    if (this.windowStartIndex >= this.events.length) return 0;

    // Sum tokens in the window
    let windowTokenCount = 0;
    for (let i = this.windowStartIndex; i < this.events.length; i++) {
      windowTokenCount += this.events[i].tokens;
    }

    if (windowTokenCount === 0) return 0;

    // Use actual time span of tokens for finer precision
    const windowDuration =
      (now - this.events[this.windowStartIndex].time) / 1000;
    if (windowDuration === 0) return 0;

    return windowTokenCount / windowDuration;
  }

  /** Removes the dead prefix of the events array to free memory. */
  private compact(): void {
    if (this.windowStartIndex === 0) return;
    this.events.splice(0, this.windowStartIndex);
    this.windowStartIndex = 0;
  }

  /**
   * Resets the window, discarding all recorded events.
   */
  reset(): void {
    this.events.length = 0;
    this.windowStartIndex = 0;
  }
}
