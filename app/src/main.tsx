import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DesktopPetPage } from "./components/DesktopPetPage";

const desktopPet =
  (window as Window & { __MULTIAGENT_DESKTOP_PET__?: boolean })
    .__MULTIAGENT_DESKTOP_PET__ === true ||
  new URLSearchParams(window.location.search).has("desktopPet");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {desktopPet ? <DesktopPetPage /> : <App />}
  </React.StrictMode>,
);
