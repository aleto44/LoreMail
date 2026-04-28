/**
 * StatusWriter — writes .gm-status.json after every run.
 */
export class StatusWriter {
  constructor(worldState) {
    this.ws = worldState;
  }

  async write({ trigger, lettersProcessed, success, error = null, extraData = {} }) {
    const status = {
      timestamp: new Date().toISOString(),
      trigger,
      lettersProcessed,
      success,
      error: error ? String(error) : null,
      ...extraData,
    };
    await this.ws.writeGmStatus(status);
    return status;
  }
}
