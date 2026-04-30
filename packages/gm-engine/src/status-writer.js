/**
 * StatusWriter — writes .gm-status.json after every run.
 * Always runs, even on failure.
 */
export class StatusWriter {
  constructor(worldState) {
    this.ws = worldState;
  }

  async write({ trigger, lettersProcessed = 0, success, error = null, compressionRan = false, deliveries = [], extraData = {} }) {
    const status = {
      timestamp: new Date().toISOString(),
      trigger,
      success,
      lettersProcessed,
      compressionRan,
      deliveries,
      error: error ? String(error) : null,
      ...extraData,
    };
    await this.ws.writeGmStatus(status);
    return status;
  }
}