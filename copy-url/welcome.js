const isMac = navigator.userAgentData?.platform === "macOS" || /Mac/.test(navigator.platform);
if (!isMac) {
  for (const key of document.querySelectorAll(".key")) key.textContent = "Ctrl+Shift+C";
}

document.getElementById("open").addEventListener("click", () => {
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});
