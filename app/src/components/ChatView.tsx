import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { invoke, listen } from "../platform/runtime";
import { electronBridge } from "../platform/electronBridge";
import { extractDroppedFilePaths, formatDroppedPathForTerminal, hasExternalFiles } from "../lib/fileDrop";
import { parseChatPrompt, type ChatPromptOption } from "../lib/chatPrompt";
import {
  applyAutocomplete,
  detectAutocomplete,
  filterSlashCommands,
  slashCommandsForTool,
  type AutocompleteTrigger,
} from "../lib/composerAutocomplete";
import type { AppThemeId } from "../lib/appTheme";
import type { ChatBlock, ChatDiffLine } from "../platform/ipcContract";
import type { AgentStatus } from "../types";

// While the agent is working, composer sends are queued and drained one at a
// time once it's ready for input (with a short cooldown so a message doesn't
// fire during the brief lag before "working" registers).
const BUSY_STATUSES: AgentStatus[] = ["working", "starting"];
const DEAD_STATUSES: AgentStatus[] = ["exited", "unreachable"];
const QUEUE_COOLDOWN_MS = 1200;

// Reserved (queued) messages, kept per session outside the component so they
// survive the ChatView unmount/remount when toggling terminal ↔ chat.
const queueStore = new Map<string, string[]>();
// The in-progress composer draft + image attachments, likewise kept per session
// so switching to the terminal and back doesn't lose them.
const draftStore = new Map<string, string>();
// Composer attachments: a pasted/dropped image (path + preview), or a large
// pasted text block collapsed to a chip (like a terminal's pasted-text token).
type Attachment =
  | { kind: "image"; path: string; dataUrl: string }
  | { kind: "text"; text: string };
const attachStore = new Map<string, Attachment[]>();
// A text paste at/above this size collapses into a chip instead of filling the
// input inline.
const PASTE_COLLAPSE_CHARS = 300;
const PASTE_COLLAPSE_LINES = 5;

// Desktop conversation view: renders an agent's own transcript (Codex/Claude)
// as a chat, the same shape the Remote client shows. Polls chat_blocks while
// visible and skips re-render when nothing changed so open tool details stay
// open. The terminal remains the source of truth; this is a read-only view.

type Status = "loading" | "unsupported" | "empty" | "ready";

// Render only the most recent N turns so a long transcript paints fast;
// older turns are revealed on demand.
const CHAT_PAGE = 10;

// Pull image file paths (quoted, Windows, or POSIX absolute) out of a user
// message so they can render as thumbnails in the bubble instead of raw paths.
const IMAGE_PATH_RE =
  /"([^"]+\.(?:png|jpe?g|gif|webp|bmp))"|([A-Za-z]:\\[^\s"]+\.(?:png|jpe?g|gif|webp|bmp))|(\/[^\s"]+\.(?:png|jpe?g|gif|webp|bmp))/gi;

function splitImagePaths(text: string): { rest: string; images: string[] } {
  const images: string[] = [];
  const rest = text
    .replace(IMAGE_PATH_RE, (_m, quoted, win, unix) => {
      images.push(quoted || win || unix);
      return "";
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return { rest, images };
}

function ChatImage({ path }: { path: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let ok = true;
    void invoke<string | { dataUrl?: string } | null>("read_image_data_url", { path })
      .then((r) => {
        if (ok) setUrl(typeof r === "string" ? r : r?.dataUrl ?? "");
      })
      .catch(() => {});
    return () => {
      ok = false;
    };
  }, [path]);
  const name = path.split(/[\\/]/).pop() || path;
  return url ? (
    <img className="chat-user-img" src={url} alt={name} title={name} />
  ) : (
    <span className="chat-user-file" title={path}>🖼 {name}</span>
  );
}

function UserMessage({ text }: { text: string }) {
  const { rest, images } = splitImagePaths(text);
  return (
    <div className="chat-user">
      {rest && <div className="chat-user-text">{rest}</div>}
      {images.map((p, i) => (
        <ChatImage key={`${p}-${i}`} path={p} />
      ))}
    </div>
  );
}

function toolLabel(block: { name?: string; summary?: string; input?: unknown }): string {
  // Prefer the server-computed summary; fall back to deriving from input.
  let arg = block.summary ?? "";
  if (!arg) {
    const input = block.input;
    if (typeof input === "string") arg = input;
    else if (input && typeof input === "object") {
      const o = input as Record<string, unknown>;
      arg = String(o.command ?? o.cmd ?? o.file_path ?? o.path ?? o.pattern ?? JSON.stringify(o));
    }
  }
  arg = arg.replace(/\s+/g, " ").slice(0, 120);
  return arg ? `${block.name ?? "tool"} · ${arg}` : block.name ?? "tool";
}

function ChatDiff({ diff }: { diff: ChatDiffLine[] }) {
  return (
    <div className="chat-diff">
      {diff.map((line, i) => (
        <div key={i} className={`chat-diff-line ${line.type}`}>
          <span className="chat-diff-gutter">
            {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
          </span>
          {line.text || " "}
        </div>
      ))}
    </div>
  );
}

type ToolPair = {
  name?: string;
  input?: unknown;
  summary?: string;
  diff?: ChatDiffLine[];
  output?: string;
  isError?: boolean;
};

function AssistantTurn({ run }: { run: ChatBlock[] }) {
  const tools: ToolPair[] = [];
  const body: ReactNode[] = [];
  let pending: ToolPair | null = null;
  run.forEach((block, index) => {
    if (block.kind === "tool-call") {
      pending = { name: block.name, input: block.input, summary: block.summary, diff: block.diff };
      tools.push(pending);
    } else if (block.kind === "tool-result") {
      if (pending && pending.output === undefined) {
        pending.output = block.output;
        pending.isError = block.isError;
        if (!pending.diff && block.diff) pending.diff = block.diff;
        pending = null;
      } else {
        tools.push({ name: "result", output: block.output, isError: block.isError, diff: block.diff });
      }
    } else if (block.kind === "reasoning") {
      body.push(
        <details key={`r${index}`} className="chat-work">
          <summary>추론</summary>
          <pre className="chat-reason">{block.text}</pre>
        </details>
      );
    } else if (block.kind === "text") {
      body.push(
        <div key={`t${index}`} className="chat-md">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {block.text ?? ""}
          </ReactMarkdown>
        </div>
      );
    } else if (block.kind === "image") {
      body.push(
        <div key={`i${index}`} className="chat-md">
          🖼 이미지
        </div>
      );
    }
  });
  return (
    <div className="chat-turn">
      <div className="chat-role">
        <span className="chat-av">✦</span> Assistant
      </div>
      {tools.length > 0 && (
        <details className="chat-work">
          <summary>작업 · 툴 {tools.length}개</summary>
          <div className="chat-tools">
            {tools.map((tool, index) => (
              <details key={index} className="chat-tool">
                <summary>
                  <span className="chat-tool-k">$</span> {toolLabel(tool)}
                </summary>
                {tool.diff && <ChatDiff diff={tool.diff} />}
                {(tool.output !== undefined || !tool.diff) && (
                  <pre className={tool.isError ? "err" : ""}>{tool.output ?? "(출력 없음)"}</pre>
                )}
              </details>
            ))}
          </div>
        </details>
      )}
      {body}
    </div>
  );
}

export function ChatView({
  agentId,
  active,
  agentStatus,
  sessionId,
  question,
  assistantMessage,
  folder,
}: {
  agentId: string;
  active: boolean;
  theme: AppThemeId;
  agentStatus: AgentStatus;
  sessionId?: string;
  question?: string | null;
  assistantMessage?: string | null;
  folder?: string;
}) {
  const [blocks, setBlocks] = useState<ChatBlock[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [tool, setTool] = useState<string | undefined>(undefined);
  // Turn lifecycle from the transcript — overrides a stale hook "working".
  const [lifecycle, setLifecycle] = useState<"working" | "idle" | undefined>(undefined);
  // Transcript signature + the value at the moment the user hit 중단/Esc, so an
  // interrupt immediately unsticks a stuck "working" until genuinely new content
  // arrives (msgKey changes).
  const [msgKey, setMsgKey] = useState("");
  const msgKeyRef = useRef("");
  const [stoppedKey, setStoppedKey] = useState<string | null>(null);
  // Signature of the prompt the user just answered (hides its card).
  const [answeredPromptSig, setAnsweredPromptSig] = useState("");
  const [visible, setVisible] = useState(CHAT_PAGE);
  // Reserved (queued) messages waiting to be sent while the agent is working.
  // Restored from the module store so switching to the terminal and back keeps
  // them; every mutation writes back through mutateQueue.
  const [queue, setQueue] = useState<string[]>(() => queueStore.get(agentId) ?? []);
  const lastDispatchRef = useRef(0);
  // Messages just sent from the composer, echoed instantly so the chat updates
  // without waiting for the next poll; dropped once the transcript includes them.
  const [pending, setPending] = useState<string[]>([]);
  const keyRef = useRef("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fetchRef = useRef<() => void>(() => {});
  // First paint (session open / terminal→chat switch) should land at the
  // bottom (most recent), not the top.
  const firstLoadRef = useRef(true);
  // When we reveal older turns, remember the scroll height taken just before so
  // the layout effect can restore the viewport position (content grows above).
  const anchorHeightRef = useRef<number | null>(null);
  // Set to the transcript signature at the moment "/clear" is sent. While the
  // transcript still matches it (the agent hasn't cut over to a fresh
  // conversation yet), the view stays empty instead of flashing the old messages
  // back. Released once the transcript signature changes.
  const clearedSigRef = useRef<string | null>(null);

  useEffect(() => {
    keyRef.current = "";
    setStatus("loading");
    setBlocks([]);
    setVisible(CHAT_PAGE);
    setPending([]);
    setQueue(queueStore.get(agentId) ?? []); // restore this session's reservations
    setAnsweredPromptSig("");
    setStoppedKey(null);
    firstLoadRef.current = true;
    clearedSigRef.current = null;
  }, [agentId]);

  useEffect(() => {
    let cancelled = false;
    const fetchBlocks = async () => {
      try {
        const result = await invoke("chat_blocks", { id: agentId, sessionId });
        if (cancelled) return;
        if (result.unsupported) {
          setStatus("unsupported");
          return;
        }
        const next = result.blocks ?? [];
        if (result.tool) setTool(result.tool);
        setLifecycle(result.lifecycle);
        // Drop optimistic echoes now present in the transcript (exact match on
        // a user text block) so we don't show them twice.
        const userTexts = new Set(
          next.filter((b) => b.role === "user" && b.kind === "text").map((b) => b.text ?? "")
        );
        setPending((prev) => prev.filter((t) => !userTexts.has(t)));
        const last = next[next.length - 1];
        const key = `${next.length}:${String(last?.text ?? last?.output ?? "").length}`;
        // After "/clear", keep the view empty until the transcript actually
        // changes (agent emptied it or cut over to a new session). Restoring the
        // pre-clear content on the next poll would undo the clear visually.
        if (clearedSigRef.current !== null) {
          if (key === clearedSigRef.current) return;
          clearedSigRef.current = null;
        }
        if (key === keyRef.current) return;
        keyRef.current = key;
        msgKeyRef.current = key;
        setMsgKey(key);
        const el = scrollRef.current;
        const firstLoad = firstLoadRef.current;
        const nearBottom = el
          ? el.scrollHeight - el.scrollTop - el.clientHeight < 80
          : true;
        setBlocks(next);
        setStatus(next.length ? "ready" : "empty");
        // Follow live updates only when the user was already near the bottom.
        // The first-paint bottom-pin is handled by the layout effect below (it
        // runs after the new blocks commit to the DOM); doing it here with a rAF
        // could fire before the commit, leaving scrollHeight stale so the view
        // sticks at the top when re-entering the chat from another session.
        if (nearBottom && !firstLoad) {
          requestAnimationFrame(() => {
            if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          });
        }
      } catch {
        // Keep the last conversation on a transient IPC error.
      }
    };
    fetchRef.current = fetchBlocks;
    // Load once whenever the view is shown (even for an inactive pane in a
    // Screen split); only the focused pane keeps polling to limit work.
    void fetchBlocks();
    if (!active) return () => { cancelled = true; };
    const timer = window.setInterval(fetchBlocks, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [agentId, active, sessionId]);

  // Instant refresh when the transcript file changes on disk (fs.watch push),
  // instead of waiting for the 3s poll. Only the focused pane subscribes.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let unlisten = () => {};
    void listen("chat:changed", () => fetchRef.current()).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten();
    };
  }, [active]);

  // Group blocks into turns as [start, end) ranges. A new turn begins at a user
  // *text* block; everything else — assistant text/reasoning/tools and user
  // images (role:"user", kind:"image") — folds into the preceding run. The
  // do…while always advances `i`: a user block whose kind isn't "text" MUST be
  // consumed here or the loop spins forever (runaway-memory freeze).
  const ranges: { user: boolean; start: number; end: number }[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.role === "user" && b.kind === "text") {
      ranges.push({ user: true, start: i, end: i + 1 });
      i += 1;
    } else {
      const start = i;
      do {
        i += 1;
      } while (i < blocks.length && !(blocks[i].role === "user" && blocks[i].kind === "text"));
      ranges.push({ user: false, start, end: i });
    }
  }

  const hidden = Math.max(0, ranges.length - visible);

  const loadOlder = () => {
    const el = scrollRef.current;
    anchorHeightRef.current = el ? el.scrollHeight : null;
    setVisible((v) => v + CHAT_PAGE * 2);
  };

  // Auto-reveal older turns when the user scrolls to the top (button remains
  // as an explicit affordance). The anchor guard blocks re-entry until the
  // layout effect below has restored position for the pending load.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || status !== "ready" || hidden <= 0) return;
    if (el.scrollTop < 80 && anchorHeightRef.current === null) loadOlder();
  };

  // Prepending older turns grows content above the viewport; shift scrollTop by
  // the added height so the previously-visible messages stay put (no jump).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && anchorHeightRef.current !== null) {
      el.scrollTop += el.scrollHeight - anchorHeightRef.current;
      anchorHeightRef.current = null;
    }
  }, [visible]);

  // First paint after a fresh mount (opening the chat, or re-entering it from
  // another session) pins to the bottom once the blocks have actually committed
  // to the DOM — a layout effect sees the final scrollHeight, unlike a rAF fired
  // from inside the async fetch, so the view no longer sticks at the top.
  useLayoutEffect(() => {
    if (!firstLoadRef.current || status !== "ready") return;
    if (anchorHeightRef.current !== null) return; // loadOlder prepend in flight
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    firstLoadRef.current = false;
  }, [status, blocks, visible]);

  const visibleTurns: ReactNode[] = ranges.slice(hidden).map((range) =>
    range.user ? (
      <div key={`u${range.start}`} className="chat-turn user">
        <UserMessage text={blocks[range.start].text ?? ""} />
      </div>
    ) : (
      <AssistantTurn key={`a${range.start}`} run={blocks.slice(range.start, range.end)} />
    )
  );

  // The transcript's turn lifecycle is authoritative: if it says the last turn
  // finished, treat the session as not-busy even when the hook status is stuck
  // at "working" (missed Stop hook). This stops a phantom "작업 중…" that traps
  // composer sends in the queue.
  const stoppedHere = stoppedKey !== null && stoppedKey === msgKey;
  const busy = BUSY_STATUSES.includes(agentStatus) && lifecycle !== "idle" && !stoppedHere;
  const alive = !DEAD_STATUSES.includes(agentStatus);

  // Cancel the in-progress turn by sending Esc to the PTY — same as pressing
  // Esc in the Codex/Claude TUI. Re-poll so the transcript updates promptly.
  const interrupt = useCallback(() => {
    void invoke("write_pty", { id: agentId, data: "\x1b" }).catch(() => {});
    // Unstick the UI immediately: treat the session as idle until new content
    // (a changed transcript signature) arrives, so a stuck "working" after an
    // interrupt doesn't trap sends in the queue.
    setStoppedKey(msgKeyRef.current);
    window.setTimeout(() => fetchRef.current(), 500);
  }, [agentId]);

  // Inline prompt (question options / permission Allow-Deny) parsed from the
  // agent's waiting-status text; answered by writing the choice to the PTY.
  const prompt = parseChatPrompt(agentStatus, question, assistantMessage);
  const promptSig = prompt
    ? `${prompt.kind}|${prompt.text}|${prompt.options.map((o) => o.label).join("|")}`
    : "";
  // Hide the card once answered so repeated clicks don't pile up keystrokes;
  // a genuinely different prompt (new signature) shows again.
  const showPrompt = Boolean(prompt) && promptSig !== answeredPromptSig;

  // Write a paced key sequence to the PTY (arrow/enter groups a beat apart so
  // the TUI registers each keystroke), then re-poll.
  const writeKeys = (keys: string[]) => {
    keys.forEach((key, idx) => {
      window.setTimeout(() => {
        void invoke("write_pty", { id: agentId, data: key }).catch(() => {});
      }, idx * 60);
    });
    window.setTimeout(() => fetchRef.current(), keys.length * 60 + 400);
  };
  const respondPrompt = (option: ChatPromptOption) => {
    setAnsweredPromptSig(promptSig);
    if (prompt?.answerStyle === "arrow") {
      // Claude's selector: move down to option i (1-based send), then Enter.
      const steps = Math.max(0, Number(option.send) - 1);
      writeKeys([...Array(steps).fill("\x1b[B"), "\r"]);
    } else {
      writeKeys([option.send, "\r"]);
    }
  };

  // Esc cancels the in-progress turn from anywhere in the focused chat pane
  // (not just when the composer has focus) while the agent is working.
  useEffect(() => {
    if (!active || !busy) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        interrupt();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, busy, interrupt]);

  // Actually write a message to the PTY + echo it instantly. Text and Enter go
  // as separate writes (80ms apart) so Codex/Claude don't treat "text\r" as a
  // multiline paste.
  const dispatch = useCallback(
    (value: string) => {
      lastDispatchRef.current = Date.now();
      if (value.trim() === "/clear") {
        // /clear resets the agent's conversation — mirror it in the view right
        // away and suppress the pre-clear transcript until it changes on disk.
        clearedSigRef.current = keyRef.current || "empty";
        keyRef.current = "";
        setBlocks([]);
        setPending([]);
        setVisible(CHAT_PAGE);
        setStatus("empty");
        setStoppedKey(null);
        firstLoadRef.current = true;
      } else {
        setPending((p) => [...p, value]);
      }
      void invoke("write_pty", { id: agentId, data: value }).catch(() => {});
      window.setTimeout(() => {
        void invoke("write_pty", { id: agentId, data: "\r" }).catch(() => {});
      }, 80);
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
      // Re-poll soon so the real transcript (and reply) lands fast, not on the 3s tick.
      window.setTimeout(() => fetchRef.current(), 700);
      window.setTimeout(() => fetchRef.current(), 1600);
    },
    [agentId]
  );

  // Mutate the queue and mirror it into the module store so it survives the
  // ChatView unmount/remount on a terminal ↔ chat switch.
  const mutateQueue = useCallback(
    (fn: (q: string[]) => string[]) => {
      setQueue((prev) => {
        const next = fn(prev);
        if (next.length) queueStore.set(agentId, next);
        else queueStore.delete(agentId);
        return next;
      });
    },
    [agentId]
  );

  // Composer submit: send now if the agent is ready and nothing is queued;
  // otherwise reserve it in the queue to be drained when the agent frees up.
  const sendMessage = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const cooled = Date.now() - lastDispatchRef.current >= QUEUE_COOLDOWN_MS;
    if (alive && !busy && queue.length === 0 && cooled) dispatch(value);
    else mutateQueue((q) => [...q, value]);
  };

  // Drain the queue one message per cooldown while the agent is ready.
  useEffect(() => {
    if (busy || !alive || queue.length === 0) return;
    const wait = Math.max(0, QUEUE_COOLDOWN_MS - (Date.now() - lastDispatchRef.current));
    const timer = window.setTimeout(() => {
      dispatch(queue[0]);
      mutateQueue((q) => q.slice(1));
    }, wait);
    return () => window.clearTimeout(timer);
  }, [busy, alive, queue, dispatch, mutateQueue]);

  const cancelQueued = (index: number) =>
    mutateQueue((q) => q.filter((_, i) => i !== index));

  return (
    <div className="chat-view">
      <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
        {status === "unsupported" && (
          <div className="chat-empty">대화 보기를 지원하지 않는 세션입니다 (codex/claude).</div>
        )}
        {status === "loading" && <div className="chat-empty">대화를 불러오는 중…</div>}
        {status === "empty" && !pending.length && (
          <div className="chat-empty">아직 대화 기록이 없습니다.</div>
        )}
        {status === "ready" && hidden > 0 && (
          <button type="button" className="chat-more" onClick={loadOlder}>
            ▲ 이전 대화 더 보기 ({hidden})
          </button>
        )}
        {status === "ready" && visibleTurns}
        {pending.map((t, i) => (
          <div key={`pending-${i}`} className="chat-turn user">
            <UserMessage text={t} />
          </div>
        ))}
        {busy && status !== "unsupported" && status !== "loading" && (
          <div className="chat-thinking" aria-live="polite">
            <span className="chat-thinking-dots">
              <i />
              <i />
              <i />
            </span>
            작업 중…
            <button
              type="button"
              className="chat-stop"
              onClick={interrupt}
              title="진행 취소 (Esc)"
            >
              ■ 중단
            </button>
          </div>
        )}
      </div>
      {showPrompt && prompt && (
        <div className={`chat-prompt ${prompt.kind}`}>
          <div className="chat-prompt-text">
            {prompt.kind === "permission" ? "🔒 " : "❓ "}
            {prompt.text}
          </div>
          <div className="chat-prompt-options">
            {prompt.options.map((option, i) => (
              <button
                key={i}
                type="button"
                className="chat-prompt-option"
                onClick={() => respondPrompt(option)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {queue.length > 0 && (
        <div className="chat-queue">
          <div className="chat-queue-head">
            예약 대기열 {queue.length}
            {busy && <span className="chat-queue-hint">· 대기 상태가 되면 순서대로 전송</span>}
          </div>
          {queue.map((t, i) => (
            <div key={`q${i}`} className="chat-queue-item">
              <span className="chat-queue-text">{t}</span>
              <button
                type="button"
                className="chat-queue-cancel"
                title="예약 취소"
                onClick={() => cancelQueued(i)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {status !== "unsupported" && (
        <ChatComposer agentId={agentId} onSend={sendMessage} busy={busy} tool={tool} folder={folder} />
      )}
    </div>
  );
}

// Composer for sending additional instructions to the session from the chat
// view. The draft text and image attachments are persisted per session (module
// stores) so switching to the terminal and back keeps them. On send, attachment
// paths are appended to the message so Codex/Claude can read the images.
type AcItem = { value: string; label: string; desc?: string };

function ChatComposer({
  agentId,
  onSend,
  busy,
  tool,
  folder,
}: {
  agentId: string;
  onSend: (text: string) => void;
  busy: boolean;
  tool?: string;
  folder?: string;
}) {
  const [text, setText] = useState(() => draftStore.get(agentId) ?? "");
  const [attachments, setAttachments] = useState<Attachment[]>(
    () => attachStore.get(agentId) ?? []
  );
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  // Autocomplete popup (/slash or @file).
  const [ac, setAc] = useState<{ items: AcItem[]; index: number; trigger: AutocompleteTrigger } | null>(null);
  const acTriggerRef = useRef<AutocompleteTrigger | null>(null);
  const fileSeqRef = useRef(0);
  const fileTimerRef = useRef<number | undefined>(undefined);

  const refreshAutocomplete = (value: string, caret: number) => {
    const trigger = detectAutocomplete(value, caret);
    acTriggerRef.current = trigger;
    if (!trigger) {
      setAc(null);
      return;
    }
    if (trigger.kind === "slash") {
      const items = filterSlashCommands(slashCommandsForTool(tool), trigger.query).map((c) => ({
        value: c.name,
        label: `/${c.name}`,
        desc: c.desc,
      }));
      setAc(items.length ? { items, index: 0, trigger } : null);
      return;
    }
    // @file — debounced backend search under the session folder.
    window.clearTimeout(fileTimerRef.current);
    const seq = ++fileSeqRef.current;
    if (!folder) {
      setAc(null);
      return;
    }
    fileTimerRef.current = window.setTimeout(() => {
      void invoke("search_files", { folder, query: trigger.query, limit: 20 })
        .then((paths) => {
          const current = acTriggerRef.current;
          if (seq !== fileSeqRef.current || !current || current.kind !== "file") return;
          const list = Array.isArray(paths) ? (paths as string[]) : [];
          const items = list.map((p) => ({ value: p, label: p }));
          setAc(items.length ? { items, index: 0, trigger: current } : null);
        })
        .catch(() => {});
    }, 140);
  };

  const acceptAutocomplete = (item: AcItem) => {
    const trigger = ac?.trigger;
    if (!trigger) return;
    const result = applyAutocomplete(text, trigger, item.value);
    updateText(result.text);
    setAc(null);
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (el) {
        el.focus();
        el.selectionStart = el.selectionEnd = result.caret;
      }
    });
  };

  // Auto-grow the textarea to fit its content up to a max height, then scroll —
  // so a long message is fully visible instead of trapped in one scrolling row.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  // Restore the persisted draft/attachments when the session changes.
  useEffect(() => {
    setText(draftStore.get(agentId) ?? "");
    setAttachments(attachStore.get(agentId) ?? []);
  }, [agentId]);

  const updateText = (value: string) => {
    setText(value);
    if (value) draftStore.set(agentId, value);
    else draftStore.delete(agentId);
  };
  const updateAttachments = (fn: (a: Attachment[]) => Attachment[]) => {
    setAttachments((prev) => {
      const next = fn(prev);
      if (next.length) attachStore.set(agentId, next);
      else attachStore.delete(agentId);
      return next;
    });
  };

  const send = () => {
    // Expand attachments on send: pasted-text blocks and image paths join the
    // typed text so the agent receives everything.
    const texts = attachments.filter((a) => a.kind === "text").map((a) => a.text);
    const paths = attachments
      .filter((a) => a.kind === "image")
      .map((a) => formatDroppedPathForTerminal((a as { path: string }).path))
      .filter(Boolean);
    const value = [text.trim(), ...texts, ...paths].filter(Boolean).join("\n").trim();
    if (!value) return;
    onSend(value);
    updateText("");
    updateAttachments(() => []);
  };

  const addImage = (filePath: string) => {
    void invoke<{ dataUrl?: string } | string | null>("read_image_data_url", { path: filePath })
      .then((res) => {
        const dataUrl = typeof res === "string" ? res : res?.dataUrl ?? "";
        updateAttachments((a) => [...a, { kind: "image", path: filePath, dataUrl }]);
      })
      .catch(() => updateAttachments((a) => [...a, { kind: "image", path: filePath, dataUrl: "" }]));
  };

  // Append a file path to the input (like dropping into the terminal).
  const insertSnippet = (snippet: string) => {
    if (!snippet) return;
    updateText(text.trim() ? `${text.replace(/\s*$/, "")} ${snippet} ` : `${snippet} `);
  };

  // Ctrl+V: a clipboard image saves to a temp file and shows as a chip; a large
  // text paste collapses into a "pasted text" chip (like a terminal) instead of
  // flooding the input; small text pastes go inline as normal.
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    const hasImage = items && Array.from(items).some((it) => it.type.startsWith("image/"));
    if (hasImage) {
      e.preventDefault();
      void invoke<string | null>("save_clipboard_image")
        .then((filePath) => {
          if (filePath) addImage(filePath);
        })
        .catch(() => {});
      return;
    }
    const pasted = e.clipboardData?.getData("text") ?? "";
    const lines = pasted.split(/\r?\n/).length;
    if (pasted.length > PASTE_COLLAPSE_CHARS || lines > PASTE_COLLAPSE_LINES) {
      e.preventDefault();
      updateAttachments((a) => [...a, { kind: "text", text: pasted }]);
    }
    // else: let the small paste insert inline.
  };

  // Drag & drop a file/image → insert its path (Electron resolves the real path).
  const onDragOver = (e: DragEvent<HTMLTextAreaElement>) => {
    if (hasExternalFiles(e.dataTransfer)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };
  const onDrop = (e: DragEvent<HTMLTextAreaElement>) => {
    if (!hasExternalFiles(e.dataTransfer)) return;
    e.preventDefault();
    const bridge = electronBridge();
    const paths = extractDroppedFilePaths(
      e.dataTransfer,
      bridge ? (file) => bridge.getPathForFile(file) : undefined
    )
      .map(formatDroppedPathForTerminal)
      .filter(Boolean);
    if (paths.length) insertSnippet(paths.join(" "));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Autocomplete popup takes priority over the send/newline keys.
    if (ac) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAc({ ...ac, index: (ac.index + 1) % ac.items.length });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setAc({ ...ac, index: (ac.index - 1 + ac.items.length) % ac.items.length });
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && !e.nativeEvent.isComposing) {
        e.preventDefault();
        acceptAutocomplete(ac.items[ac.index]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setAc(null);
        return;
      }
    }
    // Esc-to-cancel is handled by a window listener in ChatView.
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd+Enter inserts a newline at the cursor (a textarea has no
      // default newline for this combo, so do it manually).
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart ?? text.length;
      const end = el.selectionEnd ?? text.length;
      const next = `${text.slice(0, start)}\n${text.slice(end)}`;
      updateText(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 1;
      });
      return;
    }
    // Plain Enter sends.
    e.preventDefault();
    send();
  };

  const canSend = Boolean(text.trim() || attachments.length);

  return (
    <div className="chat-composer">
      {attachments.length > 0 && (
        <div className="chat-attachments">
          {attachments.map((a, i) =>
            a.kind === "image" ? (
              <div key={`img-${i}`} className="chat-attachment" title={a.path}>
                {a.dataUrl ? (
                  <img src={a.dataUrl} alt="첨부 이미지" />
                ) : (
                  <span className="chat-attachment-file">🖼</span>
                )}
                <button
                  type="button"
                  className="chat-attachment-remove"
                  title="첨부 제거"
                  onClick={() => updateAttachments((arr) => arr.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
            ) : (
              <div
                key={`txt-${i}`}
                className="chat-attachment-textchip"
                title={a.text.slice(0, 2000)}
              >
                <span className="chat-attachment-texticon">📄</span>
                붙여넣은 텍스트 · {a.text.length.toLocaleString()}자
                <button
                  type="button"
                  className="chat-attachment-textremove"
                  title="첨부 제거"
                  onClick={() => updateAttachments((arr) => arr.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
            )
          )}
        </div>
      )}
      {ac && (
        <div className="chat-ac">
          {ac.items.map((item, i) => (
            <button
              type="button"
              key={item.value}
              className={`chat-ac-item ${i === ac.index ? "on" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                acceptAutocomplete(item);
              }}
            >
              <span className="chat-ac-label">{item.label}</span>
              {item.desc && <span className="chat-ac-desc">{item.desc}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="chat-composer-row">
        <textarea
          ref={taRef}
          className="chat-composer-input"
          value={text}
          onChange={(e) => {
            updateText(e.target.value);
            refreshAutocomplete(e.target.value, e.target.selectionStart ?? e.target.value.length);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => window.setTimeout(() => setAc(null), 120)}
          onPaste={onPaste}
          onDragOver={onDragOver}
          onDrop={onDrop}
          placeholder={
            busy
              ? "작업 중 — Enter로 예약(대기열에 추가) · Ctrl+Enter 줄바꿈"
              : "이 세션으로 전송…  (Enter 전송 · Ctrl+Enter 줄바꿈 · /명령 @파일)"
          }
          rows={1}
        />
        <button
          type="button"
          className="chat-composer-send"
          onClick={send}
          disabled={!canSend}
        >
          {busy ? "예약" : "전송"}
        </button>
      </div>
    </div>
  );
}
