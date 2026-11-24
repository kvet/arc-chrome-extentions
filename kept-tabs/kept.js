const listEl = document.getElementById("list");
const statusEl = document.getElementById("status");
const undoButton = document.getElementById("undo");
const reopenButton = document.getElementById("reopen");

const STATE_LABEL = { home: "at home", wandered: "wandered off", parked: "closed with its window" };

async function call(type, extra = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...extra });
  if (!response || !response.ok) {
    throw new Error(response ? response.error : "no response from extension");
  }
  return response.result;
}

async function currentWindowId() {
  return (await chrome.windows.getCurrent()).id;
}

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function row(entry) {
  return el("li", {}, [
    el("span", { className: `dot ${entry.state}`, title: STATE_LABEL[entry.state] }),
    el("div", { className: "text" }, [
      el("div", { className: "title", textContent: entry.title }),
      el("div", { className: "url", textContent: entry.homeUrl }),
    ]),
    el("span", { className: "state", textContent: STATE_LABEL[entry.state] }),
    el("button", { textContent: entry.state === "parked" ? "Reopen" : "Show", onclick: () => act("open", { id: entry.id }) }),
    el("button", { textContent: "Unkeep", onclick: () => act("unkeep", { id: entry.id }) }),
  ]);
}

async function render() {
  const { entries, lastCleanup } = await call("list");
  listEl.replaceChildren();
  if (entries.length === 0) {
    listEl.append(el("div", { className: "empty", textContent: "No kept tabs yet. Click the house icon on a tab to keep it." }));
  }
  const byGroup = new Map();
  for (const entry of entries) {
    const key = entry.group ? entry.group.title || "(unnamed group)" : "Not in a group";
    if (!byGroup.has(key)) {
      byGroup.set(key, []);
    }
    byGroup.get(key).push(entry);
  }
  for (const [title, group] of byGroup) {
    listEl.append(el("h2", { textContent: title }), el("ul", {}, group.map(row)));
  }
  undoButton.disabled = !lastCleanup;
  undoButton.textContent = lastCleanup
    ? `Undo last clean-up (${lastCleanup.count} tabs, ${new Date(lastCleanup.at).toLocaleTimeString()})`
    : "Undo last clean-up";
  reopenButton.disabled = !entries.some((entry) => entry.state === "parked");
}

async function act(type, extra = {}, describe) {
  try {
    const result = await call(type, extra);
    statusEl.textContent = describe ? describe(result) : "";
  } catch (error) {
    statusEl.textContent = String(error.message || error);
  }
  await render();
}

document.getElementById("cleanup-window").onclick = async () =>
  act("cleanup", { windowId: await currentWindowId() }, (r) => `Closed ${r.closed} tabs.`);
document.getElementById("cleanup-all").onclick = async () => {
  if (confirm("Close every tab that isn't kept or pinned, in all windows?")) {
    await act("cleanup", { allWindows: true }, (r) => `Closed ${r.closed} tabs.`);
  }
};
undoButton.onclick = async () => act("undo", { windowId: await currentWindowId() }, (r) => `Reopened ${r.reopened} tabs.`);
reopenButton.onclick = () => act("reopen-parked");

chrome.storage.onChanged.addListener(() => render());
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && render());
render();
