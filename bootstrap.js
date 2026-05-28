var addonData = null;
var elsevierPDF = {};
var toolMenuID = "elsevier-pdf-helper-tools-menu";
var topMenuID = "elsevier-pdf-helper-top-menu";
var chromeHandle = null;

var labels = {
  en: {
    rootMenu: "Elsevier PDF Helper",
    topMenu: "Elsevier PDF",
    openElsevierDirect: "Authorize Elsevier in Zotero",
    downloadSelected: "Download PDF for Selected Items",
    downloadVisible: "Batch Download PDFs for Current View",
    downloadVisibleTools: "Batch Download Elsevier PDFs for Current View",
  },
  zh: {
    rootMenu: "Elsevier PDF 助手",
    topMenu: "Elsevier PDF",
    openSTPaper: "在 Zotero 内打开 STPaper 授权",
    openElsevierDirect: "在 Zotero 内打开 Elsevier 直连授权",
    downloadSelected: "下载所选条目的 PDF",
    downloadVisible: "批量下载当前视图 PDF",
    downloadVisibleTools: "批量下载当前视图 Elsevier PDF",
  },
};

function install(data, reason) {}

async function startup({ id, version, rootURI }, reason) {
  addonData = { id, version, rootURI };
  try {
    let aomStartup = Components.classes[
      "@mozilla.org/addons/addon-manager-startup;1"
    ].getService(Components.interfaces.amIAddonManagerStartup);
    let manifestURI = Services.io.newURI(rootURI + "manifest.json");
    chromeHandle = aomStartup.registerChrome(manifestURI, [
      ["content", "elsevier-pdf-helper", rootURI + "chrome/content/"],
      ["locale", "elsevier-pdf-helper", "en-US", rootURI + "locale/en-US/"],
      ["locale", "elsevier-pdf-helper", "zh-CN", rootURI + "locale/zh-CN/"],
    ]);

    let sandbox = {
      elsevierPDF,
      Zotero,
      Services,
      Components,
      URL,
      URLSearchParams,
    };
    if (typeof PathUtils !== "undefined") {
      sandbox.PathUtils = PathUtils;
    }
    if (typeof IOUtils !== "undefined") {
      sandbox.IOUtils = IOUtils;
    }
    if (typeof TextEncoder !== "undefined") {
      sandbox.TextEncoder = TextEncoder;
    }
    if (typeof TextDecoder !== "undefined") {
      sandbox.TextDecoder = TextDecoder;
    }

    Services.scriptloader.loadSubScript("chrome://elsevier-pdf-helper/content/elsevierPDF.js", sandbox);
    Zotero.ElsevierPDFHelper = elsevierPDF;
    await elsevierPDF.init(addonData);
    loadFTLIntoOpenWindows();
    registerMenus();
    Services.tm.dispatchToMainThread(() => {
      for (let win of Zotero.getMainWindows()) {
        registerDOMMenus(win);
      }
    });
  } catch (e) {
    Zotero.debug("Elsevier PDF Helper startup error: " + e);
    Zotero.logError(e);
  }
}

function shutdown(data, reason) {
  unregisterMenus();
  try {
    if (Zotero.ElsevierPDFHelper === elsevierPDF) {
      delete Zotero.ElsevierPDFHelper;
    }
  } catch (e) {}
  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
  if (elsevierPDF.shutdown) {
    elsevierPDF.shutdown();
  }
  addonData = null;
}

function uninstall(data, reason) {}

function onMainWindowLoad({ window }, reason) {
  loadFTL(window);
  registerDOMMenus(window);
  window.setTimeout(() => registerDOMMenus(window), 1000);
}

function onMainWindowUnload({ window }, reason) {
  if (!hasMenuManager()) {
    unregisterDOMMenus(window);
  }
}

function registerMenus() {
  for (let win of Zotero.getMainWindows()) {
    registerDOMMenus(win);
    win.setTimeout(() => registerDOMMenus(win), 1000);
  }
}

function unregisterMenus() {
  for (let win of Zotero.getMainWindows()) {
    unregisterDOMMenus(win);
  }
}

async function runCommand(methodName) {
  try {
    await elsevierPDF[methodName]();
  } catch (e) {
    Zotero.debug(`Elsevier PDF Helper ${methodName} error: ${e}`);
    Zotero.logError(e);
    Zotero.alert(null, "Elsevier PDF Helper", String(e && e.message ? e.message : e));
  }
}

function registerDOMMenus(win) {
  loadFTL(win);
  let doc = win.document;
  let l10n = getLabels();
  let itemMenu =
    doc.getElementById("zotero-itemmenu") ||
    doc.getElementById("zotero-itemmenu-popup") ||
    doc.getElementById("item-menu") ||
    doc.querySelector("menupopup#zotero-itemmenu, menupopup[id*='item'][id*='menu']");
  if (itemMenu && !doc.getElementById("elsevier-pdf-helper-root-menu")) {
    let sep = createMenuElement(doc, "menuseparator");
    sep.id = "elsevier-pdf-helper-separator";
    itemMenu.appendChild(sep);

    let root = createMenuElement(doc, "menu");
    root.id = "elsevier-pdf-helper-root-menu";
    root.setAttribute("label", l10n.rootMenu);
    let popup = createMenuElement(doc, "menupopup");
    popup.appendChild(createDOMMenuItem(doc, "elsevier-pdf-helper-authorize-direct", l10n.openElsevierDirect, "openElsevierDirectAuthorization"));
    popup.appendChild(createMenuElement(doc, "menuseparator"));
    popup.appendChild(createDOMMenuItem(doc, "elsevier-pdf-helper-selected", l10n.downloadSelected, "downloadSelectedItems"));
    popup.appendChild(createDOMMenuItem(doc, "elsevier-pdf-helper-visible", l10n.downloadVisible, "downloadVisibleItems"));
    root.appendChild(popup);
    itemMenu.appendChild(root);
  }

  let toolsMenu =
    doc.getElementById("menu_ToolsPopup") ||
    doc.getElementById("menu-tools-popup") ||
    doc.querySelector("menupopup#menu_ToolsPopup, menupopup[id*='Tools']");
  if (toolsMenu && !doc.getElementById(toolMenuID)) {
    toolsMenu.appendChild(createDOMMenuItem(doc, toolMenuID + "-authorize-direct", l10n.openElsevierDirect, "openElsevierDirectAuthorization"));
    toolsMenu.appendChild(createDOMMenuItem(doc, toolMenuID, l10n.downloadVisibleTools, "downloadVisibleItems"));
  }

  let mainMenubar =
    doc.getElementById("main-menubar") ||
    doc.getElementById("zotero-menubar") ||
    doc.querySelector("menubar");
  if (mainMenubar && !doc.getElementById(topMenuID)) {
    let top = createMenuElement(doc, "menu");
    top.id = topMenuID;
    top.setAttribute("label", l10n.topMenu);
    let popup = createMenuElement(doc, "menupopup");
    popup.appendChild(createDOMMenuItem(doc, "elsevier-pdf-helper-top-authorize-direct", l10n.openElsevierDirect, "openElsevierDirectAuthorization"));
    popup.appendChild(createMenuElement(doc, "menuseparator"));
    popup.appendChild(createDOMMenuItem(doc, "elsevier-pdf-helper-top-selected", l10n.downloadSelected, "downloadSelectedItems"));
    popup.appendChild(createDOMMenuItem(doc, "elsevier-pdf-helper-top-visible", l10n.downloadVisible, "downloadVisibleItems"));
    top.appendChild(popup);
    mainMenubar.appendChild(top);
  }
}

function unregisterDOMMenus(win) {
  let doc = win.document;
  for (let id of [
    "elsevier-pdf-helper-separator",
    "elsevier-pdf-helper-root-menu",
    "elsevier-pdf-helper-selected",
    "elsevier-pdf-helper-visible",
    toolMenuID,
    toolMenuID + "-authorize",
    toolMenuID + "-authorize-direct",
    topMenuID,
    "elsevier-pdf-helper-authorize",
    "elsevier-pdf-helper-authorize-direct",
    "elsevier-pdf-helper-top-authorize",
    "elsevier-pdf-helper-top-authorize-direct",
    "elsevier-pdf-helper-top-selected",
    "elsevier-pdf-helper-top-visible",
  ]) {
    doc.getElementById(id)?.remove();
  }
}

function createDOMMenuItem(doc, id, label, methodName) {
  let item = createMenuElement(doc, "menuitem");
  item.id = id;
  item.setAttribute("label", label);
  item.addEventListener("command", () => runCommand(methodName));
  return item;
}

function createMenuElement(doc, tagName) {
  if (doc.createXULElement) {
    return doc.createXULElement(tagName);
  }
  return doc.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", tagName);
}

function getLabels() {
  let locale = "";
  try {
    locale = Services.locale.appLocaleAsBCP47 || "";
  } catch (e) {}
  if (!locale) {
    try {
      locale = (Services.locale.requestedLocales || [])[0] || "";
    } catch (e2) {}
  }
  return /^zh\b/i.test(locale) ? labels.zh : labels.en;
}

function loadFTLIntoOpenWindows() {
  for (let win of Zotero.getMainWindows()) {
    loadFTL(win);
  }
}

function loadFTL(win) {
  if (win.MozXULElement) {
    win.MozXULElement.insertFTLIfNeeded("elsevier-pdf-helper.ftl");
  }
}
