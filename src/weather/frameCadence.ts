/** Preserve the frame phase when display refresh and layer cadence differ. */
export class FrameCadence {
  private deadline = 0;

  reset() {
    this.deadline = 0;
  }

  due(now: number, fps: number) {
    const interval = 1000 / fps;
    if (this.deadline && now + 0.5 < this.deadline) return false;
    this.deadline = this.deadline && now - this.deadline < interval
      ? this.deadline + interval
      : now + interval;
    return true;
  }

  delay(now: number) {
    // Give requestAnimationFrame time to catch the next display refresh.
    return Math.max(0, this.deadline - now - 8);
  }
}
