(function installMultiAgentTerminalTouch(global) {
  const DRAG_THRESHOLD_PX = 6;

  function touchWithId(list, identifier) {
    if (!list) return null;
    for (let index = 0; index < list.length; index += 1) {
      const touch = list.item ? list.item(index) : list[index];
      if (touch?.identifier === identifier) return touch;
    }
    return null;
  }

  function scrollLinesImmediately(term, lines) {
    if (!term || !lines) return;
    const core = term._core;
    const bufferService = core?._bufferService;
    if (!bufferService || typeof core?.refresh !== "function") {
      term.scrollLines(lines);
      return;
    }
    const previousY = bufferService.buffer?.ydisp;
    bufferService.scrollLines(lines);
    if (previousY !== bufferService.buffer?.ydisp) {
      core.refresh(0, term.rows - 1);
    }
  }

  function terminalScreen(term) {
    return term?.element?.querySelector?.(".xterm-screen") || null;
  }

  function cellHeight(term) {
    const rect = terminalScreen(term)?.getBoundingClientRect?.();
    if (rect?.height > 0 && term.rows > 0) return rect.height / term.rows;
    return Math.max(8, Number(term?.options?.fontSize || 13) * 1.25);
  }

  function alternateScrollData(term, touch, direction, repeats) {
    if (term?.modes?.mouseTrackingMode === "none") {
      return (direction < 0 ? "\x1b[5~" : "\x1b[6~").repeat(repeats);
    }
    const screen = terminalScreen(term);
    const rect = screen?.getBoundingClientRect?.();
    const cols = Math.max(1, Number(term?.cols || 1));
    const rows = Math.max(1, Number(term?.rows || 1));
    const xRatio =
      rect?.width > 0 ? (touch.clientX - rect.left) / rect.width : 0.5;
    const yRatio =
      rect?.height > 0 ? (touch.clientY - rect.top) / rect.height : 0.5;
    const col = Math.min(cols, Math.max(1, Math.ceil(xRatio * cols)));
    const row = Math.min(rows, Math.max(1, Math.ceil(yRatio * rows)));
    const button = direction < 0 ? 64 : 65;
    return `\x1b[<${button};${col};${row}M`.repeat(repeats);
  }

  function install(container, instance, sendRaw) {
    if (!container || !instance?.term) return () => {};
    let touchId = null;
    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let lineRemainder = 0;
    let dragging = false;

    const reset = () => {
      touchId = null;
      lineRemainder = 0;
      dragging = false;
    };
    const onTouchStart = (event) => {
      if (event.touches?.length !== 1) {
        reset();
        return;
      }
      const touch = event.touches.item
        ? event.touches.item(0)
        : event.touches[0];
      if (!touch) return;
      touchId = touch.identifier;
      startX = touch.clientX;
      startY = touch.clientY;
      lastY = touch.clientY;
      lineRemainder = 0;
      dragging = false;
    };
    const onTouchMove = (event) => {
      if (touchId === null || event.touches?.length !== 1) return;
      const touch = touchWithId(event.touches, touchId);
      if (!touch) return;
      if (!dragging) {
        const totalX = touch.clientX - startX;
        const totalY = touch.clientY - startY;
        if (Math.abs(totalY) < DRAG_THRESHOLD_PX) return;
        if (Math.abs(totalY) <= Math.abs(totalX)) {
          reset();
          return;
        }
        dragging = true;
      }

      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      const term = instance.term;
      lineRemainder += (lastY - touch.clientY) / cellHeight(term);
      lastY = touch.clientY;
      const lines = Math.trunc(lineRemainder);
      if (!lines) return;
      lineRemainder -= lines;

      if (term.buffer?.active?.type !== "alternate") {
        scrollLinesImmediately(term, lines);
        return;
      }
      if (!instance.agentId) return;
      const repeats = Math.min(3, Math.abs(lines));
      const data = alternateScrollData(
        term,
        touch,
        lines < 0 ? -1 : 1,
        repeats
      );
      void sendRaw(instance.agentId, data);
    };
    const onTouchEnd = (event) => {
      if (
        touchId === null ||
        touchWithId(event.changedTouches, touchId)
      ) {
        reset();
      }
    };

    container.addEventListener("touchstart", onTouchStart, {
      passive: true,
      capture: true,
    });
    container.addEventListener("touchmove", onTouchMove, {
      passive: false,
      capture: true,
    });
    container.addEventListener("touchend", onTouchEnd, { capture: true });
    container.addEventListener("touchcancel", reset, { capture: true });

    return () => {
      container.removeEventListener("touchstart", onTouchStart, {
        capture: true,
      });
      container.removeEventListener("touchmove", onTouchMove, {
        capture: true,
      });
      container.removeEventListener("touchend", onTouchEnd, {
        capture: true,
      });
      container.removeEventListener("touchcancel", reset, {
        capture: true,
      });
    };
  }

  global.MultiAgentTerminalTouch = Object.freeze({
    install,
    scrollLinesImmediately,
  });
})(globalThis);
