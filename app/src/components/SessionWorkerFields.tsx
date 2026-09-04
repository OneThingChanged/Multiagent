import type {
  SessionWorkerPreset,
  SessionWorkerSettings,
} from "../types";
import {
  availableSessionWorkerOptions,
  updateSessionWorkerSetting,
} from "../lib/sessionWorkers";
import { useAppLanguage } from "../lib/appLanguage";

export function SessionWorkerFields({
  settings,
  disabledTools,
  onChange,
  className = "session-worker-fields",
}: {
  settings: SessionWorkerSettings | undefined;
  disabledTools: readonly string[];
  onChange: (settings: SessionWorkerSettings | undefined) => void;
  className?: string;
}) {
  const { text } = useAppLanguage();
  const options = availableSessionWorkerOptions(disabledTools);
  if (options.length === 0) return null;

  const renderSelect = (
    label: string,
    kind: keyof SessionWorkerSettings,
    hint: string
  ) => {
    const selected = settings?.[kind];
    const visibleValue = options.some((option) => option.id === selected)
      ? selected
      : "";
    return (
      <label className="field session-worker-field">
        <span className="field-label">{label}</span>
        <select
          value={visibleValue}
          onChange={(event) =>
            onChange(
              updateSessionWorkerSetting(
                settings,
                kind,
                (event.target.value || undefined) as
                  | SessionWorkerPreset
                  | undefined
              )
            )
          }
        >
          <option value="">{text("사용 안 함", "Disabled")}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="session-worker-hint">{hint}</span>
      </label>
    );
  };

  return (
    <div className={className} data-testid="session-worker-settings">
      <div className="session-worker-heading">{text("문서·HTML 병렬 작업자", "Document and HTML parallel workers")}</div>
      <div className="session-worker-description">
        {text("독립 작업만 별도 작업자에게 맡기며, 메인 Codex가 결과를 취합하고 검증합니다.", "Only independent tasks are delegated; the primary Codex integrates and verifies the results.")}
      </div>
      {renderSelect(
        text("문서·Markdown", "Documents and Markdown"),
        "documents",
        text("문서 작성·정리 작업에 사용할 작업자", "Worker used for writing and organizing documents")
      )}
      {renderSelect(
        "HTML",
        "html",
        text("HTML 제작과 관련 표현 작업에 사용할 작업자", "Worker used for HTML creation and presentation work")
      )}
    </div>
  );
}
