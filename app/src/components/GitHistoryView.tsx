import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "../platform/runtime";
import type { Project } from "../types";
import type {
  ChatDiffLine,
  GitCommitDetail,
  GitLogCommit,
  GitLogResult,
} from "../platform/ipcContract";
import { parseGitHistoryTabId } from "../lib/gitHistoryTabs";

const PAGE_SIZE = 50;

function baseName(p: string): string {
  const segments = p.split("/").filter(Boolean);
  return segments[segments.length - 1] || p;
}

function parentDir(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx > 0 ? p.slice(0, idx) : "";
}

function scopedFolder(root: string, repositoryPath: string | null) {
  if (!root || !repositoryPath) return root;
  const separator = root.includes("\\") ? "\\" : "/";
  const relative =
    separator === "\\"
      ? repositoryPath.replace(/\//g, "\\")
      : repositoryPath;
  return `${root.replace(/[\\/]+$/, "")}${separator}${relative}`;
}

function absoluteDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function DiffLines({ diff }: { diff: ChatDiffLine[] }) {
  return (
    <div className="chat-diff git-history-diff">
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

export function GitHistoryView({
  tabId,
  project,
}: {
  tabId: string;
  project: Project | null;
}) {
  const ref = parseGitHistoryTabId(tabId);
  const folder = scopedFolder(
    project?.folder ?? "",
    ref?.repositoryPath ?? null
  );
  const scopePath = ref?.path ?? null;

  const [commits, setCommits] = useState<GitLogCommit[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [detail, setDetail] = useState<GitCommitDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diff, setDiff] = useState<ChatDiffLine[] | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  // Debounce the search box so typing doesn't fire a git log per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const commitsLenRef = useRef(0);
  commitsLenRef.current = commits.length;

  const load = useCallback(
    async (reset: boolean) => {
      if (!folder) {
        setError(
          "프로젝트 폴더를 찾을 수 없습니다. (원격/SSH 프로젝트는 히스토리를 지원하지 않습니다)"
        );
        setLoading(false);
        return;
      }
      if (reset) setLoading(true);
      else setLoadingMore(true);
      try {
        const result = await invoke<GitLogResult>("git_log", {
          folder,
          path: scopePath ?? undefined,
          skip: reset ? 0 : commitsLenRef.current,
          limit: PAGE_SIZE,
          search: search || undefined,
        });
        setCommits((prev) =>
          reset ? result.commits : [...prev, ...result.commits]
        );
        setHasMore(result.hasMore);
        setError(null);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [folder, scopePath, search]
  );

  // Reload from the top whenever the scope or search changes; drop any
  // selection since its commit may no longer be in the filtered list.
  useEffect(() => {
    setSelectedHash(null);
    setDetail(null);
    setSelectedFile(null);
    setDiff(null);
    void load(true);
  }, [load]);

  const selectCommit = useCallback(
    async (hash: string) => {
      setSelectedHash(hash);
      setDetail(null);
      setDetailError(null);
      setSelectedFile(null);
      setDiff(null);
      try {
        const result = await invoke<GitCommitDetail>("git_commit_files", {
          folder,
          hash,
        });
        setDetail(result);
      } catch (reason) {
        setDetailError(
          reason instanceof Error ? reason.message : String(reason)
        );
      }
    },
    [folder]
  );

  const selectFile = useCallback(
    async (hash: string, relativePath: string) => {
      setSelectedFile(relativePath);
      setDiff(null);
      setDiffLoading(true);
      try {
        const result = await invoke<{ diff: ChatDiffLine[] }>(
          "git_commit_diff",
          { folder, hash, relativePath }
        );
        setDiff(result.diff);
      } catch {
        setDiff([{ type: "meta", text: "diff를 불러오지 못했습니다." }]);
      } finally {
        setDiffLoading(false);
      }
    },
    [folder]
  );

  const scopeLabel = scopePath ? baseName(scopePath) : null;

  return (
    <div className="git-history">
      <div className="git-history-header">
        <div className="git-history-title">
          <strong>Git History</strong>
          {scopeLabel && (
            <span className="git-history-scope" title={scopePath ?? ""}>
              {scopeLabel}
            </span>
          )}
        </div>
        <input
          className="git-history-search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="메시지 검색"
          spellCheck={false}
        />
        <button
          type="button"
          className="git-history-refresh"
          disabled={loading}
          onClick={() => void load(true)}
        >
          새로고침
        </button>
      </div>

      <div className="git-history-body">
        <div className="git-history-list">
          {loading ? (
            <div className="git-history-empty">불러오는 중…</div>
          ) : error ? (
            <div className="git-history-empty git-history-error">{error}</div>
          ) : commits.length === 0 ? (
            <div className="git-history-empty">
              {search ? "검색 결과가 없습니다." : "커밋이 없습니다."}
            </div>
          ) : (
            <>
              {commits.map((commit) => (
                <button
                  type="button"
                  key={commit.hash}
                  className={`git-history-commit ${
                    selectedHash === commit.hash
                      ? "git-history-commit-selected"
                      : ""
                  }`}
                  onClick={() => void selectCommit(commit.hash)}
                >
                  <span className="git-history-commit-subject">
                    {commit.subject || "(제목 없음)"}
                  </span>
                  <span className="git-history-commit-meta">
                    {commit.refs.length > 0 &&
                      commit.refs.map((r) => (
                        <span className="git-history-ref" key={r}>
                          {r}
                        </span>
                      ))}
                    <span className="git-history-author">{commit.author}</span>
                    <span className="git-history-date">{commit.relDate}</span>
                    <code className="git-history-hash">{commit.shortHash}</code>
                  </span>
                </button>
              ))}
              {hasMore && (
                <button
                  type="button"
                  className="git-history-more"
                  disabled={loadingMore}
                  onClick={() => void load(false)}
                >
                  {loadingMore ? "불러오는 중…" : "더 보기"}
                </button>
              )}
            </>
          )}
        </div>

        <div className="git-history-detail">
          {!selectedHash ? (
            <div className="git-history-empty">
              커밋을 선택하면 상세 내용이 표시됩니다.
            </div>
          ) : detailError ? (
            <div className="git-history-empty git-history-error">
              {detailError}
            </div>
          ) : !detail ? (
            <div className="git-history-empty">불러오는 중…</div>
          ) : (
            <>
              <div className="git-history-detail-head">
                <div className="git-history-detail-message">
                  {detail.message || "(메시지 없음)"}
                </div>
                <div className="git-history-detail-meta">
                  <span>{detail.author}</span>
                  {detail.email && <span>&lt;{detail.email}&gt;</span>}
                  <span title={absoluteDate(detail.date)}>
                    {detail.relDate || absoluteDate(detail.date)}
                  </span>
                  <code>{detail.shortHash}</code>
                  {detail.parents.length > 1 && (
                    <span className="git-history-merge">
                      merge ({detail.parents.length} parents)
                    </span>
                  )}
                </div>
              </div>

              <div className="git-history-files">
                <div className="git-history-files-heading">
                  변경된 파일 {detail.files.length}
                </div>
                {detail.files.map((file) => (
                  <button
                    type="button"
                    key={file.relative_path}
                    className={`git-history-file git-${file.status} ${
                      selectedFile === file.relative_path
                        ? "git-history-file-selected"
                        : ""
                    }`}
                    onClick={() =>
                      void selectFile(detail.hash, file.relative_path)
                    }
                    title={file.relative_path}
                  >
                    <span className="git-history-file-name">
                      {baseName(file.relative_path)}
                    </span>
                    <span className="git-history-file-dir">
                      {parentDir(file.relative_path)}
                    </span>
                    <span className="git-history-file-stat">
                      {file.additions > 0 && (
                        <span className="git-history-add">
                          +{file.additions}
                        </span>
                      )}
                      {file.deletions > 0 && (
                        <span className="git-history-del">
                          −{file.deletions}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>

              {selectedFile && (
                <div className="git-history-diff-wrap">
                  {diffLoading ? (
                    <div className="git-history-empty">diff 불러오는 중…</div>
                  ) : diff && diff.length > 0 ? (
                    <DiffLines diff={diff} />
                  ) : (
                    <div className="git-history-empty">
                      표시할 변경 내용이 없습니다.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
