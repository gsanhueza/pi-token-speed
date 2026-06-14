import { settings } from "./settings";
import { SlidingWindow } from "./sliding-window";

export class TokenSpeedEngine {
  private _isStreaming = false;
  private _tokenCount = 0;
  private _startTime = 0;
  private _endTime = 0;
  private _ttftStart = 0;
  private _ttftEnd = 0;
  private _countedUsageOutput = 0;

  private _slidingWindow!: SlidingWindow;
  private _windowMs!: number;
  private _useProviderTokens!: boolean;
  private _countStrategy!: "estimate" | "direct";

  /**
   * Loads configuration from disk. Must be called before any other method.
   */
  async initialize(): Promise<void> {
    const { config } = await settings.getConfig();
    this._windowMs = config.slidingWindow;
    this._slidingWindow = new SlidingWindow(config.slidingWindow);
    this._countStrategy = config.countStrategy;
    this._useProviderTokens = config.useProviderTokens;
  }

  /**
   * Record a streaming delta. Uses provider-reported output-token count
   * when it advances; otherwise falls back to estimating tokens from the
   * delta text.
   *
   * @param delta The text/thinking delta string.
   * @param usageOutput Provider-reported cumulative output-token count (optional).
   */
  recordDelta(delta: string, usageOutput?: number): void {
    if (!this._isStreaming) return;

    if (
      this._useProviderTokens &&
      usageOutput !== undefined &&
      usageOutput > this._countedUsageOutput
    ) {
      this.recordTokens(usageOutput - this._countedUsageOutput);
      this._countedUsageOutput = usageOutput;
    } else {
      if (this._countStrategy === "estimate") {
        this.recordTokens(this.estimateTokens(delta));
      } else {
        this.recordTokens(1);
      }
    }
  }

  /**
   * Snap the total to the authoritative usage so the final average is exact.
   *
   * @param tokens The authoritative token count from the message end event.
   */
  reconcileTotal(tokens: number): void {
    if (tokens > 0) this._tokenCount = tokens;
  }

  /**
   * Whether a streaming session is currently active
   */
  get isStreaming() {
    return this._isStreaming;
  }

  /**
   * Total number of tokens recorded since stream start
   */
  get tokenCount() {
    return this._tokenCount;
  }

  /**
   * Returns elapsed milliseconds since stream start (0 if not started)
   */
  get elapsedMs(): number {
    if (this._startTime === 0) return 0;
    if (this.isStreaming) return Date.now() - this._startTime;
    return this._endTime - this._startTime;
  }

  /** Returns elapsed seconds since stream start (0 if not started). */
  get elapsedSeconds(): number {
    return this.elapsedMs / 1000;
  }

  /**
   * Returns tokens-per-second based on a time-based sliding window.
   * Falls back to the overall average during the first window period.
   */
  get tps(): number {
    // While the window is still filling, use the average instead
    if (this.elapsedMs < this._windowMs) return this.tps_avg;

    // While we're stopped, return our last calculation
    if (!this.isStreaming) return this.tps_avg;

    return this._slidingWindow.getTps(Date.now());
  }

  /**
   * Returns average tokens-per-second
   */
  private get tps_avg(): number {
    if (this.elapsedSeconds === 0) return 0;
    return this.tokenCount / this.elapsedSeconds;
  }

  /**
   * Returns time to first token in milliseconds
   */
  get ttft(): number {
    return Math.max(this._ttftEnd - this._ttftStart, 0);
  }

  /**
   * Starts a new streaming session.
   */
  start() {
    this._tokenCount = 0;
    this._isStreaming = true;
    this._startTime = Date.now();
    this._endTime = Date.now();
    this._slidingWindow.reset();
    this._countedUsageOutput = 0;
  }

  /**
   * Records the start timestamp for TTFT measurement.
   */
  startTTFT(): void {
    this._ttftStart = Date.now();
    this._ttftEnd = 0;
  }

  /**
   * Records the end timestamp for TTFT measurement.
   * Only captures once per stream (guarded by _ttftEnd).
   */
  stopTTFT(): void {
    if (this._ttftEnd !== 0) return;

    // Record the timestamp
    this._ttftEnd = Date.now();

    // Reconcile the start time of the engine, because
    // this is the moment the first token is being processed
    this._startTime = Date.now();
  }

  /**
   * Stops streaming
   */
  stop() {
    this._isStreaming = false;
    this._endTime = Date.now();
    this._slidingWindow.reset();
  }

  /** Records a batch of tokens, pushing a timestamped event for TPS calculation. */
  private recordTokens(tokens: number) {
    if (!this._isStreaming || tokens <= 0) return;

    this._tokenCount += tokens;
    this._slidingWindow.record(tokens);
  }

  /**
   * Estimates tokens in a text string.
   * Used as a fallback when the provider doesn't report token counts.
   */
  private estimateTokens(text: string): number {
    if (!text) return 0;
    const matches = text.match(/\w+|[^\s\w]/g);
    return matches ? matches.length : 0;
  }
}
