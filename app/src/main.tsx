import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DesktopPetPage } from "./components/DesktopPetPage";
import { importTauriStorageBeforeRender } from "./platform/storageMigration";

const desktopPet =
  (window as Window & { __MULTIAGENT_DESKTOP_PET__?: boolean })
    .__MULTIAGENT_DESKTOP_PET__ === true ||
  new URLSearchParams(window.location.search).has("desktopPet");

async function render() {
  if (!desktopPet) await importTauriStorageBeforeRender();
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      {desktopPet ? <DesktopPetPage /> : <App />}
    </React.StrictMode>,
  );
}

void render().catch((error: unknown) => {
  console.error("[MultiAgent] renderer startup failed", error);
  const root = document.getElementById("root");
  if (!root) return;
  const fallback = document.createElement("div");
  fallback.className = "startup-fallback";
  const copy = document.createElement("div");
  copy.className = "startup-fallback-copy";
  const title = document.createElement("strong");
  title.textContent = "MultiAgent를 시작하지 못했습니다";
  const detail = document.createElement("span");
  detail.textContent = error instanceof Error ? error.message : String(error);
  copy.append(title, detail);
  fallback.append(copy);
  root.replaceChildren(fallback);
});
