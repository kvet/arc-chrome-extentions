import { MAX_TABS_PER_GROUP, loadSettings } from "./config.js";

const ALARM = "sync-pr-groups";
const PR_URL = /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/;

let running = null;

function prBase(url) {
  const match = url && url.match(PR_URL);
  return match ? match[0] : null;
}

async function searchPrs(token, query) {
  const url = `https://api.github.com/search/issues?per_page=${MAX_TABS_PER_GROUP}&sort=updated&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = await res.json();
  return body.items.map((item) => item.html_url);
}

async function targetWindowId() {
  try {
    const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
    return win.id;
  } catch {
    return null;
  }
}

async function syncGroup(def, urls, fallbackWindowId) {
  const [existing] = await chrome.tabGroups.query({ title: def.title });
  const windowId = existing ? existing.windowId : fallbackWindowId;
  if (windowId == null) {
    return;
  }

  const tabs = existing ? await chrome.tabs.query({ groupId: existing.id }) : [];
  const wanted = new Set(urls);
  const present = new Set();
  const toClose = [];

  for (const tab of tabs) {
    const base = prBase(tab.pendingUrl || tab.url);
    if (!base) {
      continue;
    }
    if (wanted.has(base) && !present.has(base)) {
      present.add(base);
    } else if (!tab.active) {
      toClose.push(tab.id);
    }
  }

  const missing = urls.filter((url) => !present.has(url));
  const created = [];
  for (const url of missing) {
    const tab = await chrome.tabs.create({ windowId, url, active: false });
    created.push(tab.id);
  }

  if (created.length > 0) {
    if (existing) {
      await chrome.tabs.group({ groupId: existing.id, tabIds: created });
    } else {
      const groupId = await chrome.tabs.group({ createProperties: { windowId }, tabIds: created });
      await chrome.tabGroups.update(groupId, { title: def.title, color: def.color, collapsed: true });
    }
  }

  if (toClose.length > 0) {
    await chrome.tabs.remove(toClose);
  }
}

async function setStatus(error) {
  await chrome.storage.local.set({ lastSync: { at: Date.now(), error: error ? String(error.message || error) : null } });
  await chrome.action.setBadgeBackgroundColor({ color: "#d93025" });
  await chrome.action.setBadgeText({ text: error ? "!" : "" });
  await chrome.action.setTitle({ title: error ? `PR Live Groups: ${error.message || error}` : "Sync PR groups now" });
}

async function syncAll() {
  const { token, groups } = await loadSettings();
  if (!token) {
    await setStatus(new Error("Set a GitHub token in the extension options"));
    return;
  }
  const windowId = await targetWindowId();
  try {
    for (const def of groups) {
      const urls = await searchPrs(token, def.query);
      await syncGroup(def, urls, windowId);
    }
    await setStatus(null);
  } catch (error) {
    await setStatus(error);
  }
}

function sync() {
  if (!running) {
    running = syncAll().finally(() => {
      running = null;
    });
  }
  return running;
}

async function schedule() {
  const { intervalMinutes } = await loadSettings();
  await chrome.alarms.create(ALARM, { periodInMinutes: Math.max(0.5, Number(intervalMinutes) || 1) });
}

chrome.runtime.onInstalled.addListener(async () => {
  await schedule();
  await sync();
});

chrome.runtime.onStartup.addListener(async () => {
  await schedule();
  await sync();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) {
    sync();
  }
});

chrome.action.onClicked.addListener(() => sync());

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message === "settings-changed") {
    schedule()
      .then(sync)
      .then(() => sendResponse(true));
    return true;
  }
  return false;
});
