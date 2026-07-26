const CLOSE_ACTIONS = new Set(["quit", "relaunch", "install-update"]);
const CLOSE_ACTION_PRIORITY = {
  quit: 1,
  relaunch: 2,
  "install-update": 3,
};

/**
 * Coordinates the renderer save handshake with the final Electron close action.
 *
 * A close request may originate from the tray, an ordinary relaunch, or an
 * updater install. The renderer must see exactly one prepare event and finish
 * persisting its reopen list/scrollback before the selected action runs.
 */
export class CloseCoordinator {
  constructor({
    onRequest,
    onComplete,
    onFailure = () => {},
    timeoutMs = 5_000,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  }) {
    this.onRequest = onRequest;
    this.onComplete = onComplete;
    this.onFailure = onFailure;
    this.timeoutMs = timeoutMs;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.pendingAction = null;
    this.fallbackTimer = null;
    this.completing = false;
  }

  request(action = "quit") {
    if (!CLOSE_ACTIONS.has(action)) {
      throw new Error(`Unsupported close action: ${String(action)}`);
    }
    if (this.completing) return false;

    const alreadyPending = this.pendingAction !== null;
    if (
      !alreadyPending ||
      CLOSE_ACTION_PRIORITY[action] > CLOSE_ACTION_PRIORITY[this.pendingAction]
    ) {
      this.pendingAction = action;
    }
    if (alreadyPending) return true;

    this.onRequest();
    this.fallbackTimer = this.setTimer(() => {
      this.fallbackTimer = null;
      try {
        this.complete("timeout");
      } catch {
        // onFailure already reported the synchronous completion error.
      }
    }, this.timeoutMs);
    this.fallbackTimer?.unref?.();
    return true;
  }

  confirm() {
    return this.complete("renderer");
  }

  complete(trigger = "renderer") {
    if (this.completing) return false;
    this.completing = true;
    const action = this.pendingAction ?? "quit";
    this.#clearFallback();

    try {
      this.onComplete(action, trigger);
      this.pendingAction = null;
      return true;
    } catch (error) {
      this.pendingAction = null;
      this.completing = false;
      this.onFailure(error, action);
      throw error;
    }
  }

  cancel() {
    this.#clearFallback();
    this.pendingAction = null;
    this.completing = false;
  }

  isPending() {
    return this.pendingAction !== null || this.completing;
  }

  #clearFallback() {
    if (this.fallbackTimer === null) return;
    this.clearTimer(this.fallbackTimer);
    this.fallbackTimer = null;
  }
}
