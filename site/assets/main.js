/* MultiAgent landing — GitHub Releases auto-wiring (Standard variant only),
   lang toggle, reveal. Company builds are intentionally excluded. */
(function () {
  "use strict";

  var REPO = "OneThingChanged/Multiagent";
  var RELEASES = "https://github.com/" + REPO + "/releases";

  var FALLBACK = {
    version: "v0.5.64",
    setup:    { name: "MultiAgent-Electron-Setup.exe",    url: RELEASES + "/latest", size: null },
    portable: { name: "MultiAgent-Electron-Portable.exe", url: RELEASES + "/latest", size: null }
  };

  function $(id) { return document.getElementById(id); }
  function fmtSize(bytes) {
    if (!bytes && bytes !== 0) return "—";
    var mb = bytes / (1024 * 1024);
    return (mb >= 100 ? Math.round(mb) : mb.toFixed(1)) + " MB";
  }

  /* Standard variant only: must be .exe, must NOT be a Company build. */
  function pickAsset(assets, kindRe) {
    for (var i = 0; i < assets.length; i++) {
      var a = assets[i];
      if (!/\.exe$/i.test(a.name)) continue;      // skip .yml/.json/.sig/.blockmap
      if (/company/i.test(a.name)) continue;      // hide Company variant
      if (kindRe.test(a.name)) return a;
    }
    return null;
  }

  function render(data) {
    if ($("metaVersion")) $("metaVersion").textContent = data.version;
    if ($("metaSize")) $("metaSize").textContent = data.setup.size ? "~" + fmtSize(data.setup.size) : "—";

    var line = $("dlVersionLine");
    if (line) {
      var ko = "최신 버전 " + data.version + " · Windows (x64)";
      var en = "Latest " + data.version + " · Windows (x64)";
      line.setAttribute("data-ko", ko);
      line.setAttribute("data-en", en);
      line.textContent = document.documentElement.lang === "en" ? en : ko;
    }

    wire("heroDownload", data.setup.url);
    wire("dlSetup", data.setup.url);
    wire("dlPortable", data.portable.url);

    if ($("setupName")) $("setupName").textContent = data.setup.name;
    if ($("portableName")) $("portableName").textContent = data.portable.name;
    if ($("setupSize")) $("setupSize").textContent = fmtSize(data.setup.size);
    if ($("portableSize")) $("portableSize").textContent = fmtSize(data.portable.size);
  }
  function wire(id, url) { var el = $(id); if (el && url) el.href = url; }

  function load() {
    fetch("https://api.github.com/repos/" + REPO + "/releases/latest", {
      headers: { "Accept": "application/vnd.github+json" }
    })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (rel) {
        var assets = rel.assets || [];
        var setup    = pickAsset(assets, /setup/i);
        var portable = pickAsset(assets, /portable/i);
        render({
          version: rel.tag_name || FALLBACK.version,
          setup: setup ? { name: setup.name, url: setup.browser_download_url, size: setup.size } : FALLBACK.setup,
          portable: portable ? { name: portable.name, url: portable.browser_download_url, size: portable.size } : FALLBACK.portable
        });
      })
      .catch(function () { render(FALLBACK); });
  }

  function applyLang(lang) {
    document.documentElement.lang = lang;
    var nodes = document.querySelectorAll("[data-ko],[data-en]");
    for (var i = 0; i < nodes.length; i++) {
      var v = nodes[i].getAttribute("data-" + lang);
      if (v != null) nodes[i].textContent = v;
    }
    var t = $("langToggle");
    if (t) {
      var spans = t.querySelectorAll("span");
      spans[0].classList.toggle("on", lang === "ko");
      spans[1].classList.toggle("on", lang === "en");
    }
    try { localStorage.setItem("ma-lang", lang); } catch (e) {}
  }

  function reveal() {
    var els = document.querySelectorAll(".section");
    if (!("IntersectionObserver" in window)) return;
    els.forEach(function (el) { el.classList.add("reveal"); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.08 });
    els.forEach(function (el) { io.observe(el); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var y = $("year"); if (y) y.textContent = new Date().getFullYear();

    var saved = "ko";
    try { saved = localStorage.getItem("ma-lang") || "ko"; } catch (e) {}
    applyLang(saved);

    var toggle = $("langToggle");
    if (toggle) toggle.addEventListener("click", function () {
      applyLang(document.documentElement.lang === "ko" ? "en" : "ko");
    });

    reveal();
    load();
  });
})();
