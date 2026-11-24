const KEY = "kept";
const AT_HOME = "#1e8e3e";
const WANDERED = "#e8710a";

let cache = null;
let queue = Promise.resolve();

function run(fn) {
  const result = queue.then(fn);
  queue = result.catch((error) => console.error(error));
  return result;
}

function fire(fn) {
  run(fn).catch(() => {});
}

async function entries() {
  if (!cache) {
    const stored = await chrome.storage.local.get(KEY);
    cache = stored[KEY] || [];
  }
  return cache;
}

async function save() {
  await chrome.storage.local.set({ [KEY]: cache });
}

function samePage(a, b) {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.origin === y.origin && x.pathname === y.pathname;
  } catch {
    return false;
  }
}

async function byTabId(tabId) {
  return (await entries()).find((entry) => entry.tabId === tabId);
}

async function snapshot(entry, tab) {
  if (tab.index < 0) {
    return;
  }
  entry.tabId = tab.id;
  entry.windowId = tab.windowId;
  entry.index = tab.index;
  entry.lastUrl = tab.pendingUrl || tab.url;
  entry.title = tab.title || entry.title || entry.homeUrl;
  if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
    const group = await chrome.tabGroups.get(tab.groupId);
    entry.groupId = group.id;
    entry.group = { title: group.title, color: group.color };
  } else {
    entry.groupId = null;
    entry.group = null;
  }
}

async function badge(tab) {
  const entry = await byTabId(tab.id);
  if (!entry) {
    await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
    await chrome.action.setTitle({ tabId: tab.id, title: "Keep this tab" });
    return;
  }
  const home = samePage(tab.pendingUrl || tab.url, entry.homeUrl);
  await chrome.action.setBadgeText({ tabId: tab.id, text: "●" });
  await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: home ? AT_HOME : WANDERED });
  await chrome.action.setTitle({
    tabId: tab.id,
    title: home ? "Kept tab, at home" : `Kept tab: click to go home (${entry.homeUrl})`,
  });
}

async function refreshAll() {
  for (const entry of await entries()) {
    if (entry.tabId == null) {
      continue;
    }
    try {
      await snapshot(entry, await chrome.tabs.get(entry.tabId));
    } catch {
      entry.tabId = null;
    }
  }
  await save();
}

async function keep(tab) {
  if (await byTabId(tab.id)) {
    return;
  }
  const entry = { id: crypto.randomUUID(), homeUrl: tab.pendingUrl || tab.url };
  await snapshot(entry, tab);
  cache.push(entry);
  await save();
  await badge(tab);
}

async function unkeep(tab) {
  cache = (await entries()).filter((entry) => entry.tabId !== tab.id);
  await save();
  await badge(tab);
}

async function setHome(tab) {
  const entry = await byTabId(tab.id);
  if (entry) {
    entry.homeUrl = tab.url;
    await save();
    await badge(tab);
  } else {
    await keep(tab);
  }
}

async function goHome(tab) {
  const entry = await byTabId(tab.id);
  if (entry && !samePage(tab.url, entry.homeUrl)) {
    await chrome.tabs.update(tab.id, { url: entry.homeUrl });
  }
}

async function targetWindow(entry) {
  if (entry.windowId != null) {
    try {
      await chrome.windows.get(entry.windowId);
      return entry.windowId;
    } catch {}
  }
  const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
  return win.id;
}

async function findGroup(entry, windowId) {
  if (entry.groupId != null) {
    try {
      const group = await chrome.tabGroups.get(entry.groupId);
      if (group.windowId === windowId) {
        return group.id;
      }
    } catch {}
  }
  const [match] = await chrome.tabGroups.query({ windowId, title: entry.group.title });
  return match ? match.id : null;
}

async function recreate(entry) {
  const windowId = await targetWindow(entry);
  const tab = await chrome.tabs.create({
    windowId,
    index: entry.index >= 0 ? entry.index : undefined,
    url: entry.homeUrl,
    active: false,
  });
  if (entry.group) {
    const groupId = await findGroup(entry, windowId);
    if (groupId != null) {
      await chrome.tabs.group({ groupId, tabIds: [tab.id] });
    } else {
      const created = await chrome.tabs.group({ createProperties: { windowId }, tabIds: [tab.id] });
      await chrome.tabGroups.update(created, { title: entry.group.title, color: entry.group.color });
    }
    if (entry.index >= 0) {
      await chrome.tabs.move(tab.id, { index: entry.index }).catch(() => {});
    }
  }
  await snapshot(entry, await chrome.tabs.get(tab.id));
  await save();
  await badge(await chrome.tabs.get(tab.id));
}

async function rebindAll({ forgetTabIds }) {
  const list = await entries();
  const tabs = await chrome.tabs.query({});
  const groups = new Map((await chrome.tabGroups.query({})).map((group) => [group.id, group.title]));
  const used = new Set();

  if (!forgetTabIds) {
    for (const entry of list) {
      const tab = tabs.find((candidate) => candidate.id === entry.tabId);
      if (tab) {
        used.add(tab.id);
        await snapshot(entry, tab);
      } else {
        entry.tabId = null;
      }
    }
  } else {
    for (const entry of list) {
      entry.tabId = null;
    }
  }

  for (const entry of list) {
    if (entry.tabId != null) {
      continue;
    }
    const matches = tabs.filter(
      (tab) =>
        !used.has(tab.id) && (samePage(tab.url, entry.homeUrl) || (entry.lastUrl && tab.url === entry.lastUrl)),
    );
    const sameGroup = matches.find((tab) => entry.group && groups.get(tab.groupId) === entry.group.title);
    const tab = sameGroup || matches[0];
    if (tab) {
      used.add(tab.id);
      await snapshot(entry, tab);
    } else {
      await recreate(entry);
    }
  }
  await save();
  for (const tab of await chrome.tabs.query({})) {
    await badge(tab);
  }
}

async function isAlive(entry) {
  if (entry.tabId == null) {
    return null;
  }
  try {
    return await chrome.tabs.get(entry.tabId);
  } catch {
    entry.tabId = null;
    return null;
  }
}

async function focus(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
}

async function openEntry(id) {
  const entry = (await entries()).find((candidate) => candidate.id === id);
  if (!entry) {
    return;
  }
  if (!(await isAlive(entry))) {
    await recreate(entry);
  }
  await focus(await chrome.tabs.get(entry.tabId));
}

async function unkeepEntry(id) {
  cache = (await entries()).filter((entry) => entry.id !== id);
  await save();
  for (const tab of await chrome.tabs.query({})) {
    await badge(tab);
  }
}

async function reopenParked() {
  for (const entry of await entries()) {
    if (!(await isAlive(entry))) {
      await recreate(entry);
    }
  }
}

async function cleanup({ windowId, allWindows }) {
  const keptIds = new Set();
  for (const entry of await entries()) {
    if (await isAlive(entry)) {
      keptIds.add(entry.tabId);
    }
  }
  const ownPages = chrome.runtime.getURL("");
  const tabs = await chrome.tabs.query(allWindows ? { windowType: "normal" } : { windowId });
  const groups = new Map((await chrome.tabGroups.query({})).map((group) => [group.id, group]));
  const closing = tabs.filter(
    (tab) => !tab.pinned && !keptIds.has(tab.id) && !(tab.url || "").startsWith(ownPages),
  );
  if (closing.length === 0) {
    return { closed: 0 };
  }

  const closingIds = new Set(closing.map((tab) => tab.id));
  for (const id of new Set(tabs.map((tab) => tab.windowId))) {
    const survivors = tabs.filter((tab) => tab.windowId === id && !closingIds.has(tab.id));
    if (survivors.length === 0) {
      await chrome.tabs.create({ windowId: id, active: true });
    }
  }

  const saved = closing
    .map((tab) => {
      const group = groups.get(tab.groupId);
      return {
        url: tab.pendingUrl || tab.url,
        title: tab.title,
        group: group ? { title: group.title, color: group.color } : null,
      };
    })
    .filter((tab) => tab.url && tab.url !== "chrome://newtab/");
  await chrome.storage.local.set({ lastCleanup: { at: Date.now(), tabs: saved } });
  await chrome.tabs.remove(closing.map((tab) => tab.id));
  return { closed: closing.length };
}

async function undoCleanup({ windowId }) {
  const { lastCleanup } = await chrome.storage.local.get("lastCleanup");
  if (!lastCleanup) {
    return { reopened: 0 };
  }
  const grouped = new Map();
  for (const saved of lastCleanup.tabs) {
    const tab = await chrome.tabs.create({ windowId, url: saved.url, active: false });
    if (saved.group) {
      const key = `${saved.group.title}\u0000${saved.group.color}`;
      if (!grouped.has(key)) {
        grouped.set(key, { group: saved.group, tabIds: [] });
      }
      grouped.get(key).tabIds.push(tab.id);
    }
  }
  for (const { group, tabIds } of grouped.values()) {
    const [existing] = await chrome.tabGroups.query({ windowId, title: group.title });
    if (existing) {
      await chrome.tabs.group({ groupId: existing.id, tabIds });
    } else {
      const created = await chrome.tabs.group({ createProperties: { windowId }, tabIds });
      await chrome.tabGroups.update(created, { title: group.title, color: group.color });
    }
  }
  await chrome.storage.local.remove("lastCleanup");
  return { reopened: lastCleanup.tabs.length };
}

async function listForPage() {
  const list = [];
  for (const entry of await entries()) {
    const tab = await isAlive(entry);
    list.push({
      id: entry.id,
      title: (tab && tab.title) || entry.title || entry.homeUrl,
      homeUrl: entry.homeUrl,
      group: entry.group,
      state: !tab ? "parked" : samePage(tab.pendingUrl || tab.url, entry.homeUrl) ? "home" : "wandered",
    });
  }
  await save();
  const { lastCleanup } = await chrome.storage.local.get("lastCleanup");
  return { entries: list, lastCleanup: lastCleanup ? { at: lastCleanup.at, count: lastCleanup.tabs.length } : null };
}

async function openManager() {
  await chrome.runtime.openOptionsPage();
}

function setupMenus() {
  chrome.contextMenus.removeAll(() => {
    const contexts = ["page", "action"];
    chrome.contextMenus.create({ id: "keep", title: "Keep this tab", contexts });
    chrome.contextMenus.create({ id: "set-home", title: "Set current page as home", contexts });
    chrome.contextMenus.create({ id: "go-home", title: "Go to home page", contexts });
    chrome.contextMenus.create({ id: "unkeep", title: "Stop keeping this tab", contexts });
    chrome.contextMenus.create({ id: "cleanup", title: "Close all unkept tabs in this window", contexts: ["action"] });
    chrome.contextMenus.create({ id: "manage", title: "Kept tabs…", contexts: ["action"] });
  });
}

const actions = {
  keep,
  unkeep,
  "set-home": setHome,
  "go-home": goHome,
  cleanup: (tab) => cleanup({ windowId: tab.windowId }),
  manage: openManager,
};

const messages = {
  list: listForPage,
  open: ({ id }) => openEntry(id),
  unkeep: ({ id }) => unkeepEntry(id),
  "reopen-parked": reopenParked,
  cleanup: ({ windowId, allWindows }) => cleanup({ windowId, allWindows }),
  undo: ({ windowId }) => undoCleanup({ windowId }),
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = message && messages[message.type];
  if (!handler) {
    return false;
  }
  run(() => handler(message)).then(
    (result) => sendResponse({ ok: true, result }),
    (error) => sendResponse({ ok: false, error: String(error.message || error) }),
  );
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  setupMenus();
  fire(() => rebindAll({ forgetTabIds: false }));
});

chrome.runtime.onStartup.addListener(() => {
  setTimeout(() => fire(() => rebindAll({ forgetTabIds: true })), 3000);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const action = actions[info.menuItemId];
  if (action && tab) {
    fire(() => action(tab));
  }
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (!tab) {
    return;
  }
  if (command === "go-home") {
    fire(() => goHome(tab));
  } else if (command === "toggle-keep") {
    fire(async () => ((await byTabId(tab.id)) ? unkeep(tab) : keep(tab)));
  } else if (command === "cleanup") {
    fire(() => cleanup({ windowId: tab.windowId }));
  }
});

async function primaryAction(tab) {
  if (await byTabId(tab.id)) {
    await goHome(tab);
  } else {
    await keep(tab);
  }
}

chrome.action.onClicked.addListener((tab) => fire(() => primaryAction(tab)));

chrome.tabs.onRemoved.addListener((tabId, info) => {
  fire(async () => {
    const entry = await byTabId(tabId);
    if (!entry) {
      return;
    }
    if (info.isWindowClosing) {
      entry.tabId = null;
      await save();
      return;
    }
    await recreate(entry);
  });
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  fire(async () => {
    const entry = await byTabId(removedTabId);
    if (entry) {
      entry.tabId = addedTabId;
      await save();
    }
  });
});

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (!("url" in change) && !("groupId" in change) && change.status !== "complete") {
    return;
  }
  fire(async () => {
    const entry = await byTabId(tabId);
    if (entry) {
      await snapshot(entry, tab);
      await save();
    }
    await badge(tab);
  });
});

for (const event of [chrome.tabs.onMoved, chrome.tabs.onAttached, chrome.tabs.onDetached, chrome.tabGroups.onUpdated]) {
  event.addListener(() => fire(refreshAll));
}
