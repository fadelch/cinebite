import "server-only";
import { ServiceError } from "@/server/services/service-error";
/** A per-isolate resource bound, in addition to (never instead of) shared quotas. */
export class ImageCapacity {
  private active = 0;
  private waiting: Array<{
    resolve: () => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];
  constructor(
    private maximum = 2,
    private queueMaximum = 8,
    private waitMs = 2000,
  ) {}
  get snapshot() {
    return { active: this.active, queued: this.waiting.length };
  }
  async run<T>(work: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await work();
    } finally {
      this.active--;
      const next = this.waiting.shift();
      if (next) {
        clearTimeout(next.timer);
        this.active++;
        next.resolve();
      }
    }
  }
  private acquire() {
    if (this.active < this.maximum) {
      this.active++;
      return Promise.resolve();
    }
    const busy = () =>
      new ServiceError(
        "SECURITY_RATE_LIMITED",
        429,
        "Image processing is busy. Please retry shortly.",
      );
    if (this.waiting.length >= this.queueMaximum) return Promise.reject(busy());
    return new Promise<void>((resolve, reject) => {
      const item = {
        resolve,
        timer: setTimeout(() => {
          const position = this.waiting.indexOf(item);
          if (position >= 0) this.waiting.splice(position, 1);
          reject(busy());
        }, this.waitMs),
      };
      this.waiting.push(item);
    });
  }
}
export const imageCapacity = new ImageCapacity();
