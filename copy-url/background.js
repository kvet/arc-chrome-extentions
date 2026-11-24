// Copies the active tab's URL on the keyboard shortcut or a toolbar icon click.
//
// A service worker can't touch the clipboard, so the copy happens in an offscreen document.
// That works on every page, including chrome:// pages and the Web Store, where extensions
// can't run scripts. The "Copied URL" toast is drawn into the page when Chrome allows it;
// the toolbar badge confirms the copy either way.

const OFFSCREEN_URL = "offscreen.html";
const BADGE_MS = 1500;
const DEFAULT_TITLE = chrome.runtime.getManifest().action.default_title;

let creatingOffscreen;

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  // Two quick presses must not both try to create the document.
  creatingOffscreen ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.CLIPBOARD],
      justification: "Write the current tab's URL to the clipboard",
    })
    .finally(() => {
      creatingOffscreen = undefined;
    });
  await creatingOffscreen;
}

async function writeClipboard(text) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ target: "offscreen", type: "copy", text });
}

function flashBadge(tabId, text, color, title) {
  chrome.action.setBadgeBackgroundColor({ tabId, color });
  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setTitle({ tabId, title });
  setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
    chrome.action.setTitle({ tabId, title: DEFAULT_TITLE }).catch(() => {});
  }, BADGE_MS);
}

// Runs inside the page (isolated world). Built with DOM calls and inline styles only, so
// pages with strict CSP or Trusted Types don't block it, and in a shadow root so page CSS
// doesn't leak in.
function showToast(message, durationMs) {
  const HOST_ID = "copy-url-extension-toast";
  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText =
    "all: initial; position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 2147483647; pointer-events: none;";
  const root = host.attachShadow({ mode: "closed" });

  const box = document.createElement("div");
  box.style.cssText = [
    "display: flex",
    "align-items: center",
    "gap: 8px",
    "padding: 9px 14px",
    "border-radius: 10px",
    "background: rgba(32, 33, 36, 0.94)",
    "color: #fff",
    "font: 500 13px/1.2 system-ui, -apple-system, 'Segoe UI', sans-serif",
    "box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28)",
    "opacity: 0",
    "transform: translateY(-8px)",
    "transition: opacity 150ms ease, transform 150ms ease",
  ].join(";");

  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  const path = document.createElementNS(svgNs, "path");
  path.setAttribute("d", "M3 8.5 6.5 12 13 4.5");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#4ade80");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);

  const label = document.createElement("span");
  label.textContent = message;
  box.append(svg, label);
  root.append(box);
  (document.body || document.documentElement).append(host);

  requestAnimationFrame(() => {
    box.style.opacity = "1";
    box.style.transform = "none";
  });
  setTimeout(() => {
    box.style.opacity = "0";
    box.style.transform = "translateY(-8px)";
    setTimeout(() => host.remove(), 200);
  }, durationMs);
}

async function copyTabUrl(tab) {
  tab ??= (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (!tab) return;

  // activeTab exposes the URL of the tab the user invoked the extension on.
  const url = tab.url || tab.pendingUrl;
  if (!url) {
    flashBadge(tab.id, "!", "#d93025", "Couldn't read this tab's URL");
    return;
  }

  let copied = false;
  try {
    copied = await writeClipboard(url);
  } catch (error) {
    console.error("Copy failed", error);
  }
  if (!copied) {
    flashBadge(tab.id, "!", "#d93025", "Couldn't copy the URL");
    return;
  }

  flashBadge(tab.id, "✓", "#1a7f37", `Copied ${url}`);
  // Fails on pages extensions can't script (chrome://, the Web Store, the PDF viewer);
  // the badge is the confirmation there.
  chrome.scripting
    .executeScript({ target: { tabId: tab.id }, func: showToast, args: ["Copied URL", BADGE_MS] })
    .catch(() => {});
}

// Chrome won't assign a suggested key that clashes with one of its own shortcuts, and
// Cmd+Shift+C / Ctrl+Shift+C is DevTools' "inspect element". The user can still assign it
// by hand on chrome://extensions/shortcuts, so on install point them there if needed.
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== chrome.runtime.OnInstalledReason.INSTALL) return;
  const commands = await chrome.commands.getAll();
  if (!commands.find((c) => c.name === "copy-url")?.shortcut) {
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  }
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "copy-url") copyTabUrl(tab);
});

chrome.action.onClicked.addListener((tab) => copyTabUrl(tab));
