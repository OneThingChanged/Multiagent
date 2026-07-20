import { useEffect, useRef, useState, type ReactNode } from "react";
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

  const turns: ReactNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    if (blocks[i].role === "user" && blocks[i].kind === "text") {
      turns.push(
        <div key={`u${i}`} className="chat-turn user">
          <div className="chat-user">{blocks[i].text}</div>
        </div>
      );
      i += 1;
    } else {
      const run: ChatBlock[] = [];
      while (i < blocks.length && blocks[i].role !== "user") {
        run.push(blocks[i]);
        i += 1;
      }
      turns.push(<AssistantTurn key={`a${i}`} run={run} />);
    }
  }

  const hidden = Math.max(0, turns.length - visible);
  const visibleTurns = hidden > 0 ? turns.slice(hidden) : turns;

  return (
    <div className="chat-view" ref={scrollRef}>
      {status === "unsupported" && (
        <div className="chat-empty">대화 보기를 지원하지 않는 세션입니다 (codex/claude).</div>
      )}
      {status === "loading" && <div className="chat-empty">대화를 불러오는 중…</div>}
      {status === "empty" && <div className="chat-empty">아직 대화 기록이 없습니다.</div>}
      {status === "ready" && hidden > 0 && (
        <button type="button" className="chat-more" onClick={() => setVisible((v) => v + CHAT_PAGE * 2)}>
          ▲ 이전 대화 더 보기 ({hidden})
        </button>
      )}
      {status === "ready" && visibleTurns}
    </div>
  );
}
