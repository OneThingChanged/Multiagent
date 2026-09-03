import { randomUUID } from "node:crypto";

function createStatusError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Bridges an HTTP session-activation request to the coordinator renderer and
 * keeps the request pending until the renderer confirms that the PTY spawn has
 * completed. A delivered IPC event is not itself a successful activation.
 */
export class RemoteSessionActivationBroker {
  constructor({
    dispatch,
    isActive = () => false,
    timeoutMs = 30_000,
    idFactory = randomUUID,
  }) {
    this.dispatch = dispatch;
    this.isActive = isActive;
    this.timeoutMs = timeoutMs;
    this.idFactory = idFactory;
    this.pending = new Map();
  }

  activate(id) {
    const agentId = String(id || "").trim();
    if (!agentId) {
      return Promise.reject(createStatusError("세션 ID가 비어 있습니다.", 400));
    }
    if (this.isActive(agentId)) {
      return Promise.resolve({ id: agentId, active: true, restarted: false });
    }

    const requestId = this.idFactory();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(createStatusError(
          "세션 활성화 응답 시간이 초과되었습니다. 데스크톱 창이 준비되었는지 확인해 주세요.",
          504,
        ));
      }, this.timeoutMs);

      this.pending.set(requestId, { id: agentId, resolve, reject, timeout });
      try {
        if (this.dispatch({ requestId, id: agentId }) === false) {
          this.rejectPending(
            requestId,
            "세션 활성화를 처리할 데스크톱 창이 준비되지 않았습니다.",
            503,
          );
        }
      } catch (error) {
        this.rejectPending(
          requestId,
          error instanceof Error ? error.message : String(error),
          500,
        );
      }
    });
  }

  complete({ requestId, id, ok, error, statusCode }) {
    const pending = this.pending.get(requestId);
    if (!pending || pending.id !== id) return false;

    this.pending.delete(requestId);
    clearTimeout(pending.timeout);
    if (!ok) {
      pending.reject(createStatusError(
        String(error || "세션을 활성화하지 못했습니다."),
        Number.isInteger(statusCode) ? statusCode : 409,
      ));
      return true;
    }
    if (!this.isActive(id)) {
      pending.reject(createStatusError(
        "터미널 생성 완료를 확인하지 못했습니다.",
        409,
      ));
      return true;
    }
    pending.resolve({ id, active: true, restarted: true });
    return true;
  }

  rejectPending(requestId, message, statusCode) {
    const pending = this.pending.get(requestId);
    if (!pending) return false;
    this.pending.delete(requestId);
    clearTimeout(pending.timeout);
    pending.reject(createStatusError(message, statusCode));
    return true;
  }

  close(message = "애플리케이션이 종료되어 세션 활성화를 완료하지 못했습니다.") {
    for (const requestId of [...this.pending.keys()]) {
      this.rejectPending(requestId, message, 503);
    }
  }
}
