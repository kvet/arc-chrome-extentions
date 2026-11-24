# Changelog

## v0.2.0 (unreleased)

### Copy URL 0.1.0

- New extension. `Cmd+Shift+C` (`Ctrl+Shift+C` on Windows and Linux) or a toolbar icon click copies the current tab's URL.
- Shows a "Copied URL" toast on the page and a green ✓ on the toolbar icon. Works on `chrome://` pages too, with the badge only.
- Chrome won't auto-assign a shortcut that DevTools already uses, so on install a welcome page explains how to set it on `chrome://extensions/shortcuts`.

## v0.1.0 (2026-11-24)

First release.

### Kept Tabs 0.1.0

- Keep any tab, including tabs inside tab groups. A kept tab has a home URL, and closing it reopens it at home in the same window, group and position.
- Toolbar badge shows whether a kept tab is at home (green) or has wandered off (orange). Clicking the icon keeps the tab or sends it home.
- Context menu: keep, set current page as home, go home, stop keeping, close unkept tabs, open the manager.
- Shortcuts: `Alt+Shift+K` keep/unkeep, `Alt+Shift+H` go home, `Alt+Shift+X` close unkept tabs in the window.
- Manager page that lists kept tabs by group, closes unkept tabs in one or all windows, undoes the last clean-up and reopens kept tabs closed with their window.
- Kept tabs are matched to restored tabs on browser startup, and missing ones are reopened.

### PR Live Groups 0.1.0

- Syncs tab groups with GitHub pull request searches on a timer (default every minute), up to 15 PRs per group.
- Default groups: **PRs** (authored by you) and **Reviews** (review requested from you).
- Options page for the GitHub token, groups (`Title | color | query`) and sync interval.
- Toolbar icon syncs immediately and shows a red `!` when the last sync failed.
