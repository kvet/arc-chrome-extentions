// Offscreen documents never have focus, so navigator.clipboard.writeText() rejects here.
// execCommand("copy") on a selected textarea is the supported way to copy from one.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen" || message.type !== "copy") return;
  const textarea = document.getElementById("clipboard");
  textarea.value = message.text;
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.value = "";
  sendResponse(ok);
});
