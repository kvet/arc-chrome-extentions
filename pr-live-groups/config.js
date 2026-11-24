export const DEFAULT_GROUPS = [
  { title: "PRs", color: "purple", query: "is:pr is:open archived:false author:@me" },
  { title: "Reviews", color: "orange", query: "is:pr is:open archived:false user-review-requested:@me" },
];

export const MAX_TABS_PER_GROUP = 15;

export const COLORS = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];

export async function loadSettings() {
  const { token = "", groups = DEFAULT_GROUPS, intervalMinutes = 1 } = await chrome.storage.local.get([
    "token",
    "groups",
    "intervalMinutes",
  ]);
  return { token, groups, intervalMinutes };
}
