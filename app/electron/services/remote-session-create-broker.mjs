import { randomUUID } from "node:crypto";

function createStatusError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Bridges an HTTP session-create request to the coordinator renderer and keeps
 * the request pending until the renderer confirms that it actually added the
 * session. This prevents a delivered IPC event from being reported as a
 * successful creation.
 */
export class RemoteSessionCreateBroker {
  constructor({ dispatch, timeoutMs = 15_000, idFactory = randomUUID }) {
    this.dispatch = dispatch;
    this.timeoutMs = timeoutMs;
    this.idFactory = idFactory;
    this.pending = new Map();
  }

  create(payload) {
    const id = this.idFactory();
    const requestId = this.idFactory();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(createStatusError(
          "세션 생성 응답 시간이 초과되었습니다. 데스크톱 창이 준비되었는지 확인해 주세요.",
          504,
        ));
      }, this.timeoutMs);

      this.pending.set(requestId, { id, resolve, reject, timeout });

      try {
        if (this.dispatch({ requestId, id, ...payload }) === false) {
          this.rejectPending(
            requestId,
            "세션 생성을 처리할 데스크톱 창이 준비되지 않았습니다.",
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
    if (ok) {
      pending.resolve({ id });
    } else {
      pending.reject(createStatusError(
        String(error || "세션을 생성하지 못했습니다."),
        Number.isInteger(statusCode) ? statusCode : 409,
      ));
    }
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

  close(message = "애플리케이션이 종료되어 세션 생성을 완료하지 못했습니다.") {
    for (const requestId of [...this.pending.keys()]) {
      this.rejectPending(requestId, message, 503);
    }
  }
}
