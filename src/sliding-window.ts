import { COMPACTION_THRESHOLD, MIN_SLIDING_WINDOW } from "./constants";

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
   * Divides tokens in the window by the actual time span. When the span
   * is artificially short (e.g. after a stall followed by a burst), extends
   * the span to include the gap before the burst by looking at the last
   * event before the window's first event.
   *
   * Returns 0 if no tokens are in the window.
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

    // Measure span from the first in-window event.
    let spanStart = this.events[this.windowStartIndex].time;

    // Check if all events in the window share the same timestamp.
    // This indicates a flush after a stall (provider buffering),
    // where all tokens arrive at once with no time between them.
    const firstEventTime = this.events[this.windowStartIndex].time;
    const lastEventTime = this.events[this.events.length - 1].time;
    const allSameTimestamp = firstEventTime === lastEventTime;

    // If all events are from the same timestamp and there's a previous
    // event, extend the span to include the gap before the burst.
    if (allSameTimestamp && this.windowStartIndex > 0) {
      spanStart = this.events[this.windowStartIndex - 1].time;
    }

    const span = Math.max(now - spanStart, MIN_SLIDING_WINDOW);
    return (1000 * windowTokenCount) / span;
  }

  /**
   * Removes the dead prefix of the events array to free memory.
   * Called periodically when `windowStartIndex` reaches the compaction threshold.
   */
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
