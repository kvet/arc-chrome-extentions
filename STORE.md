# Chrome Web Store listings

Copy-paste material for publishing both extensions on the Chrome Web Store, so people can install them without Developer mode and get updates automatically.

## Publishing checklist

1. Register a developer account at the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) (one-time $5 fee). To publish privately to a Google Workspace domain, register with an account in that domain.
2. Run `scripts/package.sh` and upload `dist/store/<extension>-<version>.zip` as a new item.
3. Fill in the listing from the sections below. Upload the 128×128 icon from `<extension>/icons/128.png` and the screenshots from `docs/screenshots/` (already 1280×800).
4. Under **Distribution → Visibility**, choose one:
   - **Private**: only people in your Google Workspace domain can find and install it.
   - **Unlisted**: anyone with the link can install it, and it doesn't show up in search.
5. Submit for review. Updates go the same way: bump `version` in the manifest, upload the new zip and submit.

The privacy tab asks for a privacy policy URL, which has to be publicly reachable. Publish the [Privacy policy](#privacy-policy) section somewhere public first, for example a GitHub Pages site or a public gist.

---

## Kept Tabs

**Name:** Kept Tabs

**Summary** (from the manifest, 132 characters max):
Arc-style pinned tabs that live anywhere, including tab groups: a home URL, and closing reopens them at home.

**Category:** Productivity → Tools

**Description:**

```
Chrome's pinned tabs are stuck at the far left and can't go in tab groups. Kept Tabs gives you Arc-style pinned tabs that live anywhere, and works best with Chrome's vertical tabs.

• Keep any tab, including tabs inside a tab group. The page it's on becomes its home.
• Close a kept tab and it reopens in the background, at home, in the same group and position.
• Browse away and the toolbar icon turns orange. One click takes you back home.
• Kept tabs survive restarts. They are matched to restored tabs, and missing ones are reopened.
• Clean up: close every tab in the window that isn't kept or pinned, with undo.
• Manager page listing kept tabs by group.

Shortcuts: Alt+Shift+K keep/unkeep, Alt+Shift+H go home, Alt+Shift+X close unkept tabs.

Everything stays on your computer. No accounts, no network requests, no tracking.
```

**Single purpose:**
Keeps chosen tabs open at a home URL: reopens kept tabs when they're closed and returns them to their home page on request.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `tabs` | Reads the URL, title, window and position of tabs the user keeps, so they can be reopened in the same place, matched after a browser restart and compared with their home URL. Also closes unkept tabs when the user asks for a clean-up. |
| `tabGroups` | Reads the name and color of a kept tab's group so the tab can be reopened in the same group, or in a recreated group with the same name and color. |
| `storage` | Stores the list of kept tabs and the tabs closed by the last clean-up (for undo) locally on the device. |
| `contextMenus` | Adds Keep, Set as home, Go home, Stop keeping and Clean up items to the page and toolbar icon menus. |

**Remote code:** No.

**Data usage:** The extension stores the URLs and titles of tabs the user chooses to keep (and of tabs closed by the last clean-up) in `chrome.storage.local`. This data never leaves the device. If the form requires it, declare **Web history** as handled, and certify that it isn't sold, isn't used for unrelated purposes and isn't used for creditworthiness.

---

## PR Live Groups

**Name:** PR Live Groups

**Summary:**
Keeps Chrome tab groups in sync with GitHub pull request searches.

**Category:** Productivity → Developer Tools

**Description:**

```
PR Live Groups keeps a tab group for each GitHub pull request search you care about, and works best with Chrome's vertical tabs.

• Out of the box: "PRs" (opened by you) and "Reviews" (review requested from you).
• New PRs that match a search open in their group, and PRs that drop out (merged, closed, reviewed) are closed.
• Add your own groups with any GitHub search query, for example team review requests.
• Syncs every minute by default. Click the toolbar icon to sync right away.
• Never closes the tab you're looking at, and leaves non-PR tabs in a group alone.

Needs a GitHub token with read access to pull requests. The token is stored locally and only sent to api.github.com.
```

**Single purpose:**
Opens and closes tabs in Chrome tab groups so that each group matches the results of a GitHub pull request search.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `tabs` | Opens tabs for pull requests that match a search, reads tab URLs to see which PRs are already open, and closes PR tabs that no longer match. |
| `tabGroups` | Finds, creates, names and colors the tab group for each configured search. |
| `storage` | Stores the user's settings (GitHub token, group definitions, sync interval) and the last sync result locally on the device. |
| `alarms` | Runs the sync on the interval the user chooses. |
| Host `https://api.github.com/*` | Calls the GitHub search API with the user's token to get the pull requests for each configured search. |

**Remote code:** No.

**Data usage:** Declare **Authentication information** (the GitHub token the user enters). It is stored in `chrome.storage.local` and sent only to `api.github.com`, to run the user's searches. Certify that it isn't sold, isn't used for unrelated purposes and isn't used for creditworthiness.

---

## Privacy policy

> **Kept Tabs and PR Live Groups: privacy policy**
>
> Neither extension collects, sells or shares personal data, and neither sends any data to the developer.
>
> **Kept Tabs** stores the URLs, titles and tab group names of the tabs you choose to keep, and of the tabs closed by your last clean-up, in your browser's local extension storage. It makes no network requests.
>
> **PR Live Groups** stores the GitHub token, search queries and settings you enter in your browser's local extension storage. It sends the token and your search queries only to the GitHub API (`api.github.com`) to fetch the matching pull requests. It sends nothing anywhere else.
>
> Removing an extension deletes everything it stored.
