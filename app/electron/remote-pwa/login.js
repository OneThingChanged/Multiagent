const startButton = document.querySelector("#startLogin");
const loginTitle = document.querySelector("#loginTitle");
const loginDescription = document.querySelector("#loginDescription");
const devicePanel = document.querySelector("#devicePanel");
const deviceCode = document.querySelector("#deviceCode");
const deviceLink = document.querySelector("#deviceLink");
const copyCode = document.querySelector("#copyCode");
const loginProgress = document.querySelector("#loginProgress");
const loginError = document.querySelector("#loginError");

let mode = { configured: false, web: false };
let pollTimer = null;

function showError(message) {
  loginError.textContent = message;
  loginError.hidden = false;
  startButton.disabled = false;
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

async function pollLogin(device) {
  try {
    const result = await requestJson("/auth/poll", {
      method: "POST",
      body: JSON.stringify({ device_code: device.device_code }),
    });
    if (result.pending) {
      const nextDelay = Math.max(5, Number(result.interval || device.interval || 5)) * 1000;
      loginProgress.textContent = result.slow_down ? "GitHub 요청 간격을 조정하는 중…" : "GitHub 인증 대기 중…";
      pollTimer = setTimeout(() => pollLogin(device), nextDelay);
      return;
    }
    if (result.login) {
      loginProgress.textContent = `GitHub @${result.login} 로그인 완료`;
      location.href = "/";
      return;
    }
    throw new Error("로그인 결과를 확인하지 못했습니다.");
  } catch (error) {
    showError(`로그인 확인 실패: ${error.message}`);
  }
}

async function startDeviceLogin() {
  startButton.disabled = true;
  loginError.hidden = true;
  try {
    const device = await requestJson("/auth/start", { method: "POST", body: "{}" });
    deviceCode.textContent = device.user_code || "----";
    deviceLink.href = device.verification_uri || device.verification_uri_complete || "https://github.com/login/device";
    devicePanel.hidden = false;
    document.querySelector("#loginReady").hidden = true;
    pollTimer = setTimeout(() => pollLogin(device), Math.max(5, Number(device.interval || 5)) * 1000);
  } catch (error) {
    showError(`GitHub 로그인을 시작하지 못했습니다: ${error.message}`);
  }
}

startButton.addEventListener("click", () => {
  if (!mode.web) {
    void startDeviceLogin();
    return;
  }
  const target = new URL("/auth/github", location.origin);
  const profileId = String(window.__MULTIAGENT_PROFILE_ID__ || "").trim();
  if (
    window.__MULTIAGENT_NATIVE_APP__ === true &&
    /^[A-Za-z0-9._:-]{1,128}$/.test(profileId)
  ) {
    target.searchParams.set("source", "mobile-app");
    target.searchParams.set("profile", profileId);
  }
  location.href = `${target.pathname}${target.search}`;
});

copyCode.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(deviceCode.textContent || "");
    copyCode.textContent = "복사됨";
  } catch {}
});

addEventListener("beforeunload", () => { if (pollTimer) clearTimeout(pollTimer); });

try {
  mode = await requestJson("/auth/mode", { headers: {} });
  if (!mode.configured) {
    loginTitle.textContent = "PC에서 GitHub Client ID를 설정해 주세요";
    loginDescription.textContent = "Acedia 설정 → Remote PWA → GitHub OAuth에 Client ID가 필요합니다.";
    startButton.hidden = true;
  } else if (mode.web) {
    loginTitle.textContent = "GitHub 웹 로그인";
    loginDescription.textContent = "고정 도메인에 연결된 GitHub OAuth로 안전하게 로그인합니다.";
    startButton.disabled = false;
  } else {
    loginTitle.textContent = "GitHub 기기 로그인";
    loginDescription.textContent = "Quick tunnel에서도 사용할 수 있도록 일회용 기기 코드로 로그인합니다.";
    startButton.disabled = false;
  }
} catch (error) {
  showError(`서버 설정을 확인하지 못했습니다: ${error.message}`);
}
