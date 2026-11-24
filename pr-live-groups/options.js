import { COLORS, loadSettings } from "./config.js";

const tokenInput = document.getElementById("token");
const groupsInput = document.getElementById("groups");
const intervalInput = document.getElementById("interval");
const status = document.getElementById("status");

function parseGroups(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [title, color, ...rest] = line.split("|").map((part) => part.trim());
      const query = rest.join("|").trim();
      if (!title || !query) {
        throw new Error(`Line ${index + 1}: expected "Title | color | query"`);
      }
      if (!COLORS.includes(color)) {
        throw new Error(`Line ${index + 1}: unknown color "${color}"`);
      }
      return { title, color, query };
    });
}

async function showLastSync() {
  const { lastSync } = await chrome.storage.local.get("lastSync");
  if (lastSync) {
    const when = new Date(lastSync.at).toLocaleTimeString();
    status.textContent = lastSync.error ? `Last sync ${when} failed: ${lastSync.error}` : `Last sync ${when} OK`;
  }
}

const settings = await loadSettings();
tokenInput.value = settings.token;
groupsInput.value = settings.groups.map((g) => `${g.title} | ${g.color} | ${g.query}`).join("\n");
intervalInput.value = settings.intervalMinutes;
await showLastSync();

document.getElementById("save").addEventListener("click", async () => {
  try {
    const groups = parseGroups(groupsInput.value);
    await chrome.storage.local.set({
      token: tokenInput.value.trim(),
      groups,
      intervalMinutes: Number(intervalInput.value) || 1,
    });
    status.textContent = "Saved, syncing…";
    await chrome.runtime.sendMessage("settings-changed");
    await showLastSync();
  } catch (error) {
    status.textContent = String(error.message || error);
  }
});
