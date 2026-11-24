#!/usr/bin/env node
// Stages demo scenes in a throwaway Chrome profile (vertical tabs on, both extensions loaded)
// and captures the browser window into docs/screenshots/ at 1280x800 (Chrome Web Store size).
//
// Requirements: macOS, Google Chrome, Node 22+, Xcode command line tools (swift), and Screen
// Recording permission for the terminal you run this from. PR Live Groups needs a GitHub token:
// GITHUB_TOKEN, or whatever `gh auth token` prints. It stays in the throwaway profile, which is
// deleted at the end.
//
//   node scripts/screenshots.mjs [kept|pr ...]

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "screenshots");
const WIDTH = 1280;
const HEIGHT = 800;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Chrome's ID for an unpacked extension: sha256 of its path, first 32 hex digits mapped to a-p.
function extensionId(path) {
  const hex = createHash("sha256").update(path).digest("hex").slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
}

const EXT = {
  kept: { path: join(ROOT, "kept-tabs") },
  pr: { path: join(ROOT, "pr-live-groups") },
};
for (const ext of Object.values(EXT)) {
  ext.id = extensionId(ext.path);
}

async function launch(pinned) {
  const profile = mkdtempSync(join(tmpdir(), "ext-screenshots-"));
  mkdirSync(join(profile, "Default"));
  writeFileSync(
    join(profile, "Default", "Preferences"),
    JSON.stringify({
      vertical_tabs: { enabled: true, enabled_first_time: true, uncollapsed_width: 260 },
      extensions: { pinned_extensions: [pinned.id], ui: { developer_mode: true } },
      browser: { has_seen_welcome_page: true },
    }),
  );
  const proc = spawn(
    CHROME,
    [
      "--remote-debugging-pipe",
      "--enable-unsafe-extension-debugging",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-search-engine-choice-screen",
      "--hide-crash-restore-bubble",
      "--disable-features=SigninInterceptBubble,ChromeWhatsNewUI",
      `--window-size=${WIDTH},${HEIGHT}`,
      "--window-position=60,60",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] },
  );

  let nextId = 0;
  const pending = new Map();
  let buffer = "";
  proc.stdio[4].on("data", (chunk) => {
    buffer += chunk.toString();
    let end;
    while ((end = buffer.indexOf("\0")) >= 0) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      const waiter = pending.get(message.id);
      if (waiter) {
        pending.delete(message.id);
        message.error ? waiter.reject(new Error(`${waiter.method}: ${message.error.message}`)) : waiter.resolve(message.result);
      }
    }
  });
  const send = (method, params = {}, sessionId) => {
    const id = ++nextId;
    proc.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }) + "\0");
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method }));
  };

  await sleep(1500);
  const { id: loadedId } = await send("Extensions.loadUnpacked", { path: pinned.path });
  if (loadedId !== pinned.id) {
    throw new Error(`Expected extension ID ${pinned.id}, Chrome assigned ${loadedId}`);
  }

  async function attach(match) {
    for (let attempt = 0; attempt < 50; attempt++) {
      const { targetInfos } = await send("Target.getTargets");
      const target = targetInfos.find(match);
      if (target) {
        const { sessionId } = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
        return sessionId;
      }
      await sleep(200);
    }
    throw new Error("Target not found");
  }

  // Runs an async function body inside the extension's service worker, with its chrome.* APIs.
  const inExtension = (ext, body) =>
    evaluate((t) => t.type === "service_worker" && t.url.startsWith(`chrome-extension://${ext.id}/`), body);

  // Runs an async function body inside one of the extension's own pages.
  const inPage = (ext, page, body) =>
    evaluate((t) => t.type === "page" && t.url.startsWith(`chrome-extension://${ext.id}/${page}`), body);

  async function evaluate(match, body) {
    const sessionId = await attach(match);
    const result = await send(
      "Runtime.evaluate",
      { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result.value;
  }

  async function capture(name) {
    await sleep(1500);
    const swift = `
      import CoreGraphics
      let pid = Int(CommandLine.arguments[1])!
      let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as! [[String: Any]]
      for w in windows where (w[kCGWindowOwnerPID as String] as? Int) == pid && (w[kCGWindowLayer as String] as? Int) == 0 {
        print(w[kCGWindowNumber as String]!)
        break
      }`;
    const swiftFile = join(profile, "window.swift");
    writeFileSync(swiftFile, swift);
    const windowId = execFileSync("swift", [swiftFile, String(proc.pid)]).toString().trim();
    if (!windowId) {
      throw new Error("Chrome window not found");
    }
    const file = join(OUT, `${name}.png`);
    execFileSync("screencapture", ["-x", "-o", "-l", windowId, file]);
    execFileSync("sips", ["-z", String(HEIGHT), String(WIDTH), file], { stdio: "ignore" });
    console.log(file);
  }

  async function close() {
    proc.kill();
    await new Promise((r) => proc.once("exit", r));
    rmSync(profile, { recursive: true, force: true });
  }

  return { inExtension, inPage, capture, close };
}

async function keptScene() {
  const chrome = await launch(EXT.kept);
  try {
    await chrome.inExtension(
      EXT.kept,
      `
      const [win] = await chrome.windows.getAll({ windowTypes: ["normal"] });
      const [blank] = await chrome.tabs.query({ windowId: win.id });
      const open = (url) => chrome.tabs.create({ windowId: win.id, url, active: false });
      const group = async (tabs, title, color) => {
        const id = await chrome.tabs.group({ tabIds: tabs.map((t) => t.id), createProperties: { windowId: win.id } });
        await chrome.tabGroups.update(id, { title, color });
      };
      const settle = () => new Promise((r) => setTimeout(r, 4000));

      const hn = await open("https://news.ycombinator.com/");
      const docs = [
        await open("https://developer.chrome.com/docs/extensions"),
        await open("https://developer.mozilla.org/en-US/"),
        await open("https://developer.chrome.com/docs/extensions/reference/api/tabGroups"),
      ];
      const team = [
        await open("https://github.com/cli/cli"),
        await open("https://github.com/cli/cli/issues"),
        await open("https://github.com/cli/cli/releases"),
      ];
      await open("https://en.wikipedia.org/wiki/Tab_(interface)");
      await open("https://en.wikipedia.org/wiki/Web_browser");
      await chrome.tabs.remove(blank.id);
      await group(docs, "Docs", "blue");
      await group(team, "Team", "green");
      await settle();

      for (const tab of [hn, docs[0], docs[1], team[0], team[1]]) {
        await keep(await chrome.tabs.get(tab.id));
      }
      // Let one kept tab wander off its home page, and look at it.
      await chrome.tabs.update(docs[1].id, { url: "https://developer.mozilla.org/en-US/docs/Web/API/Window", active: true });
      await settle();
      `,
    );
    await chrome.capture("kept-tabs");

    await chrome.inExtension(EXT.kept, `await chrome.runtime.openOptionsPage();`);
    await chrome.capture("kept-tabs-manager");
  } finally {
    await chrome.close();
  }
}

async function prScene() {
  const token = process.env.GITHUB_TOKEN || execFileSync("gh", ["auth", "token"]).toString().trim();
  const groups = [
    { title: "Needs changes", color: "purple", query: "is:pr is:open archived:false repo:cli/cli review:changes_requested" },
    { title: "Needs review", color: "orange", query: "is:pr is:open archived:false repo:cli/cli review:required" },
  ];
  const chrome = await launch(EXT.pr);
  try {
    await chrome.inExtension(EXT.pr, `await chrome.runtime.openOptionsPage();`);
    await new Promise((r) => setTimeout(r, 1000));
    // Fill in the options page and press "Save and sync", like a user would.
    const lastSync = await chrome.inPage(
      EXT.pr,
      "options.html",
      `
      await chrome.storage.local.remove("lastSync");
      document.getElementById("token").value = ${JSON.stringify(token)};
      document.getElementById("groups").value = ${JSON.stringify(groups.map((g) => `${g.title} | ${g.color} | ${g.query}`).join("\n"))};
      document.getElementById("interval").value = "30";
      document.getElementById("save").click();
      for (let i = 0; i < 100; i++) {
        const { lastSync } = await chrome.storage.local.get("lastSync");
        if (lastSync) return lastSync;
        await new Promise((r) => setTimeout(r, 300));
      }
      `,
    );
    if (!lastSync || lastSync.error) {
      throw new Error(`Sync failed: ${lastSync ? lastSync.error : "timed out"}`);
    }

    await chrome.inExtension(
      EXT.pr,
      `
      const [win] = await chrome.windows.getAll({ windowTypes: ["normal"] });
      const open = (url) => chrome.tabs.create({ windowId: win.id, url, active: false });
      for (const tab of await chrome.tabs.query({ windowId: win.id, url: "about:blank" })) {
        await chrome.tabs.remove(tab.id);
      }
      await open("https://github.com/cli/cli");
      await open("https://en.wikipedia.org/wiki/Code_review");
      // Synced groups start collapsed; open the short one and look at one of its PRs.
      const [changes] = await chrome.tabGroups.query({ title: "Needs changes" });
      await chrome.tabGroups.update(changes.id, { collapsed: false });
      const [first] = await chrome.tabs.query({ groupId: changes.id });
      await chrome.tabs.update(first.id, { active: true });
      await new Promise((r) => setTimeout(r, 5000));
      `,
    );
    await chrome.capture("pr-live-groups");

    await chrome.inExtension(
      EXT.pr,
      `
      const [options] = await chrome.tabs.query({ url: chrome.runtime.getURL("options.html") });
      await chrome.tabs.update(options.id, { active: true });
      `,
    );
    await chrome.capture("pr-live-groups-options");
  } finally {
    await chrome.close();
  }
}

mkdirSync(OUT, { recursive: true });
const scenes = { kept: keptScene, pr: prScene };
const wanted = process.argv.slice(2);
for (const name of wanted.length ? wanted : Object.keys(scenes)) {
  await scenes[name]();
}
