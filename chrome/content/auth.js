function elsevierPDFAuthLoad() {
  const params = new URLSearchParams(window.location.search);
  const target = params.get("url") || "https://www.stpaper.cn/microapp/widget/tools/database";
  const status = document.getElementById("auth-status");
  if (status) {
    status.value = `Ready: ${target}`;
  }
}

function elsevierPDFAuthCopy(target) {
  const status = document.getElementById("auth-status");
  try {
    Components.classes["@mozilla.org/widget/clipboardhelper;1"]
      .getService(Components.interfaces.nsIClipboardHelper)
      .copyString(target);
    if (status) {
      status.value = `Copied: ${target}`;
    }
  } catch (e) {
    if (status) {
      status.value = `Copy failed: ${target}`;
    }
  }
}
