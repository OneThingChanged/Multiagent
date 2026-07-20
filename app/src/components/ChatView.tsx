import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { invoke } from "../platform/runtime";
import type { AppThemeId } from "../lib/appTheme";
import type { ChatBlock } from "../platform/ipcContract";

// Desktop conversation view: renders an agent's own transcript (Codex/Claude)
// as a chat, the same shape the Remote client shows. Polls chat_blocks while
// visible and skips re-render when nothing changed so open tool details stay
// open. The terminal remains the source of truth; this is a read-only view.

type Status = "loading" | "unsupported" | "empty" | "ready";

// Render only the most recent N turns so a long transcript paints fast;
// older turns are revealed on demand.
const CHAT_PAGE = 10;

function toolLabel(block: { name?: string; input?: unknown }): string {
  const input = block.input;
  let arg = "";
  if (typeof input === "string") arg = input;
  else if (input && typeof input === "object") {
    const o = input as Record<string, unknown>;
    arg = String(
      o.command ?? o.cmd ?? o.file_path ?? o.path ?? o.pattern ?? JSON.stringify(o)
    );
  }
  arg = arg.replace(/\s+/g, " ").slice(0, 100);
  return arg ? `${block.name ?? "tool"} · ${arg}` : block.name ?? "tool";
}

type ToolPair = { name?: string; input?: unknown; output?: string; isError?: boolean };

function AssistantTurn({ run }: { run: ChatBlock[] }) {
  const tools: ToolPair[] = [];
  const body: ReactNode[] = [];
  let pending: ToolPair | null = null;
  run.forEach((block, index) => {
    if (block.kind === "tool-call") {
      pending = { name: block.name, input: block.input };
      tools.push(pending);
    } else if (block.kind === "tool-result") {
      if (pending && pending.output === undefined) {
        pending.output = block.output;
        pending.isError = block.isError;
        pending = null;
      } else {
        tools.push({ name: "result", output: block.output, isError: block.isError });
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
                <pre className={tool.isError ? "err" : ""}>{tool.output ?? "(출력 없음)"}</pre>
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
}: {
  agentId: string;
  active: boolean;
  theme: AppThemeId;
}) {
  const [blocks, setBlocks] = useState<ChatBlock[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [visible, setVisible] = useState(CHAT_PAGE);
  const keyRef = useRef("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // When we reveal older turns, remember the scroll height taken just before so
  // the layout effect can restore the viewport position (content grows above).
  const anchorHeightRef = useRef<number | null>(null);

  useEffect(() => {
    keyRef.current = "";
    setStatus("loading");
    setBlocks([]);
    setVisible(CHAT_PAGE);
  }, [agentId]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const fetchBlocks = async () => {
      try {
        const result = await invoke("chat_blocks", { id: agentId });
        if (cancelled) return;
        if (result.unsupported) {
          setStatus("unsupported");
          return;
        }
        const next = result.blocks ?? [];
        const last = next[next.length - 1];
        const key = `${next.length}:${String(last?.text ?? last?.output ?? "").length}`;
        if (key === keyRef.current) return;
        keyRef.current = key;
        const el = scrollRef.current;
        const nearBottom = el
          ? el.scrollHeight - el.scrollTop - el.clientHeight < 80
          : true;
        setBlocks(next);
        setStatus(next.length ? "ready" : "empty");
        if (nearBottom) {
          requestAnimationFrame(() => {
            if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          });
        }
      } catch {
        // Keep the last conversation on a transient IPC error.
      }
    };
    void fetchBlocks();
    const timer = window.setInterval(fetchBlocks, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [agentId, active]);

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

  const visibleTurns: ReactNode[] = ranges.slice(hidden).map((range) =>
    range.user ? (
      <div key={`u${range.start}`} className="chat-turn user">
        <div className="chat-user">{blocks[range.start].text}</div>
      </div>
    ) : (
      <AssistantTurn key={`a${range.start}`} run={blocks.slice(range.start, range.end)} />
    )
  );

  return (
    <div className="chat-view">
      <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
        {status === "unsupported" && (
          <div className="chat-empty">대화 보기를 지원하지 않는 세션입니다 (codex/claude).</div>
        )}
        {status === "loading" && <div className="chat-empty">대화를 불러오는 중…</div>}
        {status === "empty" && <div className="chat-empty">아직 대화 기록이 없습니다.</div>}
        {status === "ready" && hidden > 0 && (
          <button type="button" className="chat-more" onClick={loadOlder}>
            ▲ 이전 대화 더 보기 ({hidden})
          </button>
        )}
        {status === "ready" && visibleTurns}
      </div>
      {status !== "unsupported" && <ChatComposer agentId={agentId} />}
    </div>
  );
}

// Send additional instructions straight to the session's PTY from the chat
// view (so you don't have to switch to the terminal tab). Text and the Enter
// keystroke MUST be written separately — a single "text\r" is treated as a
// multiline paste by Codex/Claude and won't submit.
function ChatComposer({ agentId }: { agentId: string }) {
  const [text, setText] = useState("");

  const send = () => {
    const value = text.trim();
    if (!value) return;
    void invoke("write_pty", { id: agentId, data: value }).catch(() => {});
    window.setTimeout(() => {
      void invoke("write_pty", { id: agentId, data: "\r" }).catch(() => {});
    }, 80);
    setText("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter is a newline. Ignore Enter mid-IME-composition
    // (Korean/Japanese) so a committing keystroke doesn't submit early.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="chat-composer">
      <textarea
        className="chat-composer-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="이 세션으로 전송…  (Enter 전송 · Shift+Enter 줄바꿈)"
        rows={1}
      />
      <button
        type="button"
        className="chat-composer-send"
        onClick={send}
        disabled={!text.trim()}
      >
        전송
      </button>
    </div>
  );
}
