import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DesktopPetPage } from "./components/DesktopPetPage";
import {
  DocumentBrowserPage,
  isDocumentBrowserPage,
} from "./components/DocumentBrowserPage";
import {
  syncReopenStateBeforeRender,
  syncSharedStorageBeforeRender,
} from "./platform/storageMigration";
import { AppLanguageProvider } from "./lib/appLanguage";

const desktopPet =
  (window as Window & { __MULTIAGENT_DESKTOP_PET__?: boolean })
    .__MULTIAGENT_DESKTOP_PET__ === true ||
  new URLSearchParams(window.location.search).has("desktopPet");
const documentBrowser = !desktopPet && isDocumentBrowserPage();

async function render() {
  if (!desktopPet && !documentBrowser) {
    await Promise.all([
      syncSharedStorageBeforeRender(),
      syncReopenStateBeforeRender(),
    ]);
  }
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <AppLanguageProvider>
        {desktopPet ? <DesktopPetPage /> : documentBrowser ? <DocumentBrowserPage /> : <App />}
      </AppLanguageProvider>
    </React.StrictMode>,
  );
}

void render().catch((error: unknown) => {
  console.error("[Acedia] renderer startup failed", error);
  const root = document.getElementById("root");
  if (!root) return;
  const fallback = document.createElement("div");
  fallback.className = "startup-fallback";
  const copy = document.createElement("div");
  copy.className = "startup-fallback-copy";
  const title = document.createElement("strong");
  title.textContent = navigator.languages?.some((locale) => /^ko(?:-|$)/i.test(locale))
    ? "Acedia를 시작하지 못했습니다"
    : "Could not start Acedia";
  const detail = document.createElement("span");
  detail.textContent = error instanceof Error ? error.message : String(error);
  copy.append(title, detail);
  fallback.append(copy);
  root.replaceChildren(fallback);
});
