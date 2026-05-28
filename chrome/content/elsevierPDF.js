if (typeof elsevierPDF === "undefined") {
  var elsevierPDF = {};
}

(function() {
  const TAG_SUCCESS = "PDF/Elsevier已下载";
  const TAG_FAILED = "PDF/Elsevier下载失败";
  const TAG_NO_ACCESS = "PDF/无合法访问权限";
  const TAG_NOT_ELSEVIER = "PDF/非Elsevier";
  const USER_AGENT = "Zotero Elsevier PDF Helper/0.2.3";
  const STPAPER_DATABASE_URL = "https://www.stpaper.cn/microapp/widget/tools/database";
  const ELSEVIER_AUTH_URL = "https://auth.elsevier.com/ShibAuth/institutionLogin?entityID=https%3A%2F%2Fpassport.escience.cn%2Fidp%2Fshibboleth&appReturnURL=https%3A%2F%2Fwww.sciencedirect.com%2Fuser%2Frouter%2Fshib%3FtargetURL%3Dhttps%253A%252F%252Fwww.sciencedirect.com%252Fuser%252Frouter%252Flogin%253FtargetURL%253Dhttp%25253A%25252F%25252Fwww.sciencedirect.com%25252F";
  const BATCH_CONFIRM_THRESHOLD = 20;
  const BATCH_DELAY_MIN_MS = 25000;
  const BATCH_DELAY_MAX_MS = 55000;

  let config = {};

  elsevierPDF.init = async function(addonData) {
    config = addonData;
    this.registerScienceDirectBrowserRequest();
    Zotero.debug(`Elsevier PDF Helper ${config.version} initialized`);
  };

  elsevierPDF.shutdown = function() {};

  elsevierPDF.registerScienceDirectBrowserRequest = function() {
    if (!Zotero.BrowserRequest) {
      Zotero.debug("Elsevier PDF Helper: BrowserRequest is unavailable");
      return;
    }

    const challengeURLs = Zotero.BrowserRequest.CHALLENGE_URLS || [];
    if (!challengeURLs.some(entry => String(entry.match || "").includes("sciencedirect.com"))) {
      challengeURLs.push({
        match: "://www.sciencedirect.com",
        captchaLocator: "#captcha-box",
        detectBlock: (status, body) => {
          return status === 403
            || /cf-mitigated|cloudflare|captcha|challenge/i.test(String(body || ""));
        },
      });
      Zotero.BrowserRequest.CHALLENGE_URLS = challengeURLs;
    }

    for (const host of ["www.sciencedirect.com", "pdf.sciencedirectassets.com"]) {
      try {
        Zotero.VersionHeader?.registerPlainUAHost?.(host);
      } catch (e) {
        Zotero.debug(`Elsevier PDF Helper: could not register plain UA for ${host}: ${e}`);
      }
    }
  };

  elsevierPDF.authorizeElsevier = function() {
    return this.openSTPaperAuthorization();
  };

  elsevierPDF.openSTPaperAuthorization = function() {
    return this.openZoteroViewer(STPAPER_DATABASE_URL, "STPaper authorization page");
  };

  elsevierPDF.openElsevierDirectAuthorization = function() {
    return this.openZoteroViewer(ELSEVIER_AUTH_URL, "Elsevier direct authorization page");
  };

  elsevierPDF.openZoteroViewer = function(url, label) {
    try {
      const options = {};
      const plainUA = Zotero.VersionHeader?.getPlainFirefoxUA?.();
      if (plainUA) {
        options.customUserAgent = plainUA;
      }
      Zotero.debug(`Elsevier PDF Helper opening Zotero viewer URL: ${url}`);
      const win = Zotero.openInViewer(url, options);
      try {
        Zotero.Utilities.Internal.activate(win);
      } catch (e) {}
      return true;
    } catch (e) {
      Zotero.debug(`Elsevier PDF Helper Zotero viewer failed for ${label || url}: ${e}`);
      Zotero.alert(
        null,
        "Elsevier PDF Helper",
        `Could not open ${label || "authorization page"} inside Zotero.\n\n${url}\n\n${e && e.message ? e.message : e}`
      );
      return false;
    }
  };

  elsevierPDF.openAuthorizationHelp = function() {
    try {
      Services.ww.openWindow(
        null,
        `chrome://elsevier-pdf-helper/content/auth.xhtml?url=${encodeURIComponent(STPAPER_DATABASE_URL)}`,
        "elsevier_pdf_helper_auth",
        "chrome,resizable,centerscreen,width=1180,height=820",
        null
      );
      return;
    } catch (e) {
      Zotero.debug(`Elsevier PDF Helper internal auth window failed: ${e}`);
      Zotero.alert(null, "Elsevier PDF Helper", "Could not open the internal authorization window.");
    }
  };

  elsevierPDF.openExternalURL = function(url, label) {
    let lastError = null;
    if (Zotero.isWin) {
      try {
        const sysDir = Services.dirsvc.get("SysD", Components.interfaces.nsIFile).path;
        const rundll = PathUtils.join(sysDir, "rundll32.exe");
        Zotero.debug(`Elsevier PDF Helper opening external URL via rundll32: ${url}`);
        Zotero.Utilities.Internal.exec(rundll, ["url.dll,FileProtocolHandler", url]);
        return true;
      } catch (e0) {
        lastError = e0;
        Zotero.debug(`Elsevier PDF Helper rundll32 first attempt failed: ${e0}`);
      }
    }

    try {
      Zotero.debug(`Elsevier PDF Helper opening external URL: ${url}`);
      Zotero.launchURL(url);
      return true;
    } catch (e) {
      lastError = e;
      Zotero.debug(`Elsevier PDF Helper Zotero.launchURL failed: ${e}`);
    }

    try {
      const uri = Services.io.newURI(url);
      const handler = Components.classes["@mozilla.org/uriloader/external-protocol-service;1"]
        .getService(Components.interfaces.nsIExternalProtocolService)
        .getProtocolHandlerInfo("https");
      handler.preferredAction = Components.interfaces.nsIHandlerInfo.useSystemDefault;
      handler.launchWithURI(uri, null);
      return true;
    } catch (e2) {
      lastError = e2;
      Zotero.debug(`Elsevier PDF Helper handler.launchWithURI failed: ${e2}`);
    }

    Zotero.alert(
      null,
      "Elsevier PDF Helper",
      `Could not open ${label || "authorization page"}.\n\n${url}\n\n${lastError && lastError.message ? lastError.message : lastError}`
    );
    return false;
  };

  elsevierPDF.copyAuthorizationURL = async function(url) {
    try {
      Components.classes["@mozilla.org/widget/clipboardhelper;1"]
        .getService(Components.interfaces.nsIClipboardHelper)
        .copyString(url);
      return true;
    } catch (e) {
      Zotero.debug(`Elsevier PDF Helper clipboard failed: ${e}`);
      return false;
    }
  };

  elsevierPDF.downloadSelectedItems = async function() {
    const pane = Zotero.getActiveZoteroPane();
    const items = this.getRegularItems(pane.getSelectedItems());
    if (!items.length) {
      Zotero.alert(null, "Elsevier PDF Helper", "Select one or more regular Zotero items first.");
      return;
    }
    await this.processItems(items);
  };

  elsevierPDF.downloadVisibleItems = async function() {
    const pane = Zotero.getActiveZoteroPane();
    let items = this.getRegularItems(pane.getSortedItems ? pane.getSortedItems() : []);
    if (!items.length) {
      Zotero.alert(null, "Elsevier PDF Helper", "No processable items were found in the current view.");
      return;
    }
    if (!this.confirmLargeBatch(items.length)) {
      return;
    }
    await this.processItems(items);
  };

  elsevierPDF.processItems = async function(items) {
    const progress = new Zotero.ProgressWindow();
    progress.changeHeadline("Elsevier PDF Helper");
    progress.show();

    let ok = 0, skipped = 0, failed = 0;
    for (const item of items) {
      const title = item.getField("title") || "(Untitled)";
      try {
        progress.addLines(`Processing: ${title.substring(0, 80)}`);
        const result = await this.processItem(item, progress);
        if (result.status === "ok") ok++;
        else if (result.status === "skipped") skipped++;
        else failed++;
        if (result.triedDownload && ok + skipped + failed < items.length) {
          const waitMS = this.nextBatchDelayMS();
          progress.addLines(`  Waiting ${Math.round(waitMS / 1000)} seconds before the next download attempt`);
          await Zotero.Promise.delay(waitMS);
        }
      } catch (e) {
        failed++;
        progress.addLines(`  Failed: ${e.message || e}`);
        Zotero.logError(e);
        await this.addTags(item, [TAG_FAILED]);
        if (ok + skipped + failed < items.length) {
          const waitMS = this.nextBatchDelayMS();
          progress.addLines(`  Waiting ${Math.round(waitMS / 1000)} seconds before the next download attempt`);
          await Zotero.Promise.delay(waitMS);
        }
      }
    }

    progress.addLines(`\nDone: ${ok} succeeded, ${skipped} skipped, ${failed} failed`);
    progress.startCloseTimer(8000);
  };

  elsevierPDF.processItem = async function(item, progress) {
    if (await this.hasPDF(item)) {
      progress.addLines("  Existing PDF found; skipped");
      return { status: "skipped", reason: "has-pdf", triedDownload: false };
    }

    if (!this.looksElsevier(item)) {
      progress.addLines("  Not an Elsevier/ScienceDirect item; skipped");
      await this.addTags(item, [TAG_NOT_ELSEVIER]);
      return { status: "skipped", reason: "not-elsevier", triedDownload: false };
    }

    const landingURL = await this.resolveLandingURL(item);
    if (!landingURL) {
      progress.addLines("  Could not resolve a ScienceDirect landing page");
      await this.addTags(item, [TAG_FAILED]);
      return { status: "failed", reason: "no-landing-url", triedDownload: false };
    }
    progress.addLines(`  Page: ${landingURL}`);

    const pdfURLs = await this.findPDFURLs(landingURL);
    if (!pdfURLs.length) {
      progress.addLines("  No legally accessible PDF link was detected from Zotero");
      await this.addTags(item, [TAG_NO_ACCESS, TAG_FAILED]);
      return { status: "failed", reason: "no-pdf-url", triedDownload: false };
    }

    let tmpPath = null;
    for (let i = 0; i < pdfURLs.length; i++) {
      const pdfURL = pdfURLs[i];
      progress.addLines(`  PDF candidate ${i + 1}/${pdfURLs.length}: ${pdfURL}`);
      tmpPath = await this.downloadPDF(pdfURL, landingURL);
      if (tmpPath) {
        break;
      }
      Zotero.debug(`Elsevier PDF Helper candidate failed: ${pdfURL}`);
    }

    if (!tmpPath) {
      progress.addLines("  Download failed. Open Elsevier PDF -> STPaper/Elsevier authorization inside Zotero, finish login, then retry.");
      await this.addTags(item, [TAG_NO_ACCESS, TAG_FAILED]);
      return { status: "failed", reason: "not-pdf", triedDownload: true };
    }

    await this.attachPDF(item, tmpPath);
    await this.addTags(item, [TAG_SUCCESS]);
    progress.addLines("  PDF attached");
    return { status: "ok", triedDownload: true };
  };

  elsevierPDF.confirmLargeBatch = function(count) {
    if (count < BATCH_CONFIRM_THRESHOLD) {
      return true;
    }
    const text = `This will scan ${count} items in the current view and may try multiple ScienceDirect PDF downloads.\n\nTo reduce blocking risk, the helper waits ${Math.round(BATCH_DELAY_MIN_MS / 1000)}-${Math.round(BATCH_DELAY_MAX_MS / 1000)} seconds between real download attempts.\n\nContinue?`;
    try {
      return Services.prompt.confirm(null, "Elsevier PDF Helper", text);
    } catch (e) {
      Zotero.debug(`Elsevier PDF Helper batch confirmation failed: ${e}`);
      return false;
    }
  };

  elsevierPDF.nextBatchDelayMS = function() {
    return BATCH_DELAY_MIN_MS + Math.floor(Math.random() * (BATCH_DELAY_MAX_MS - BATCH_DELAY_MIN_MS + 1));
  };

  elsevierPDF.getRegularItems = function(items) {
    const seen = new Set();
    return (items || []).filter(item => {
      if (!item || !item.isRegularItem || !item.isRegularItem() || item.isFeedItem) return false;
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  };

  elsevierPDF.hasPDF = async function(item) {
    const attachments = await item.getAttachments();
    for (const id of attachments) {
      const att = Zotero.Items.get(id);
      const type = att?.attachmentContentType;
      if (type === "application/pdf") {
        return true;
      }
    }
    return false;
  };

  elsevierPDF.looksElsevier = function(item) {
    const haystack = [
      item.getField("url"),
      item.getField("DOI"),
      item.getField("publicationTitle"),
      item.getField("extra"),
    ].join(" ").toLowerCase();
    return /sciencedirect|elsevier|linkinghub\.elsevier|10\.1016\//.test(haystack);
  };

  elsevierPDF.resolveLandingURL = async function(item) {
    const url = item.getField("url");
    if (url && /sciencedirect\.com|linkinghub\.elsevier\.com/i.test(url)) {
      return await this.normalizeElsevierURL(url);
    }

    const doi = this.cleanDOI(item.getField("DOI"));
    if (doi && doi.toLowerCase().startsWith("10.1016/")) {
      const doiURL = `https://doi.org/${encodeURIComponent(doi)}`;
      try {
        const resp = await Zotero.HTTP.request("GET", doiURL, {
          followRedirects: true,
          headers: { "User-Agent": USER_AGENT },
          successCodes: [200, 301, 302, 303, 307, 308],
        });
        return await this.normalizeElsevierURL(resp.responseURL || doiURL);
      } catch (e) {
        Zotero.debug(`Elsevier PDF Helper DOI resolve failed: ${e}`);
        return this.piiFromDOI(doi) ? `https://www.sciencedirect.com/science/article/pii/${this.piiFromDOI(doi)}` : null;
      }
    }
    return null;
  };

  elsevierPDF.normalizeElsevierURL = async function(url) {
    if (!url) return null;
    if (/sciencedirect\.com\/science\/article\/pii\//i.test(url)) {
      return url;
    }
    if (/linkinghub\.elsevier\.com\/retrieve\/pii\//i.test(url)) {
      const pii = this.extractPII(url);
      try {
        const resp = await Zotero.HTTP.request("GET", url, {
          followRedirects: true,
          headers: { "User-Agent": USER_AGENT, "Accept": "text/html,*/*" },
          successCodes: [200, 301, 302, 303, 307, 308],
        });
        const finalURL = resp.responseURL || "";
        if (/sciencedirect\.com\/science\/article\/pii\//i.test(finalURL)) {
          return finalURL;
        }
        const html = resp.response || "";
        const redirect = this.extractRedirectURL(html);
        if (redirect) {
          return redirect;
        }
      } catch (e) {
        Zotero.debug(`Elsevier PDF Helper normalize linkinghub failed: ${e}`);
      }
      if (pii) return `https://www.sciencedirect.com/science/article/pii/${pii}`;
    }
    return url;
  };

  elsevierPDF.findPDFURL = async function(landingURL) {
    const urls = await this.findPDFURLs(landingURL);
    return urls[0] || null;
  };

  elsevierPDF.findPDFURLs = async function(landingURL) {
    const candidates = [];
    const pushCandidate = value => {
      if (!value) return;
      value = this.decodeHTML(value).replace(/\\\//g, "/");
      if (!/pdf|download/i.test(value)) return;
      try {
        candidates.push(new URL(value, landingURL).toString());
      } catch (e) {}
    };

    const landingPII = this.extractPII(landingURL);
    if (landingPII) {
      candidates.push(`https://www.sciencedirect.com/science/article/pii/${landingPII}/pdf?download=true`);
      candidates.push(`https://www.sciencedirect.com/science/article/pii/${landingPII}/pdfft?isDTMRedir=true&download=true`);
    }

    let html = "";
    try {
      const resp = await Zotero.HTTP.request("GET", landingURL, {
        followRedirects: true,
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "text/html,application/xhtml+xml",
        },
        successCodes: [200, 403, 404],
      });
      const contentType = String(resp.getResponseHeader?.("Content-Type") || "").toLowerCase();
      Zotero.debug(`Elsevier PDF Helper landing status=${resp.status} contentType=${contentType} responseURL=${resp.responseURL || ""}`);
      if (resp.status === 200 && resp.response && contentType.includes("html")) {
        html = resp.response;
      }
    } catch (e) {
      Zotero.debug(`Elsevier PDF Helper landing request failed: ${e}`);
    }

    for (const re of [
      /href=["']([^"']*(?:pdfft|pdfurl|download)[^"']*)["']/gi,
      /data-aa-region=["']PDF[^>]+href=["']([^"']+)["']/gi,
      /"pdfurl"\s*:\s*"([^"]+)"/gi,
      /"downloadUrl"\s*:\s*"([^"]+)"/gi,
      /"url"\s*:\s*"([^"]*\/science\/article\/pii\/[^"]*\/pdfft[^"]*)"/gi,
    ]) {
      let m;
      while ((m = re.exec(html))) pushCandidate(m[1]);
    }

    const htmlPII = this.extractPII(html);
    if (htmlPII && htmlPII !== landingPII) {
      candidates.push(`https://www.sciencedirect.com/science/article/pii/${htmlPII}/pdf?download=true`);
      candidates.push(`https://www.sciencedirect.com/science/article/pii/${htmlPII}/pdfft?isDTMRedir=true&download=true`);
    }

    const unique = [...new Set(candidates)];
    Zotero.debug(`Elsevier PDF Helper PDF candidates=${unique.length}`);
    const probed = [];
    for (const url of unique) {
      if (await this.probePDF(url)) {
        probed.push(url);
      }
    }
    if (probed.length) {
      return probed.concat(unique.filter(url => !probed.includes(url)));
    }
    return unique.filter(url => this.canBrowserRequestURL(url));
  };

  elsevierPDF.probePDF = async function(url) {
    if (this.canBrowserRequestURL(url)) {
      Zotero.debug(`Elsevier PDF Helper probe skipped for browser-mediated URL: ${url}`);
      return false;
    }
    try {
      const resp = await Zotero.HTTP.request("GET", url, {
        followRedirects: true,
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "application/pdf,*/*",
        },
        successCodes: [200, 401, 403, 404],
        responseType: "arraybuffer",
      });
      const contentType = String(resp.getResponseHeader?.("Content-Type") || "").toLowerCase();
      Zotero.debug(`Elsevier PDF Helper probe status=${resp.status} contentType=${contentType} url=${url}`);
      if (resp.status !== 200) return false;
      const bytes = new Uint8Array(resp.response || []);
      const header = String.fromCharCode(...bytes.slice(0, 5));
      return contentType.includes("pdf") || header === "%PDF-";
    } catch (e) {
      Zotero.debug(`Elsevier PDF Helper probe failed: ${e}`);
      return false;
    }
  };

  elsevierPDF.downloadPDF = async function(url, referrer) {
    const tmpPath = PathUtils.join(PathUtils.tempDir, `elsevier-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`);
    try {
      if (this.canBrowserRequestURL(url)) {
        Zotero.debug(`Elsevier PDF Helper downloading through Zotero.Attachments.downloadFile: ${url}`);
        try {
          await Zotero.Attachments.downloadFile(url, tmpPath, {
            referrer,
            enforceFileType: true,
            shouldDisplayCaptcha: true,
          });
          return tmpPath;
        } catch (browserError) {
          Zotero.debug(`Elsevier PDF Helper hidden browser download failed, trying Zotero viewer: ${browserError}`);
          if (Zotero.BrowserRequest?.downloadPDFViaViewer) {
            await Zotero.BrowserRequest.downloadPDFViaViewer(url, tmpPath, { referrer });
            return tmpPath;
          }
          throw browserError;
        }
      }

      const resp = await Zotero.HTTP.request("GET", url, {
        followRedirects: true,
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "application/pdf,*/*",
        },
        successCodes: [200, 401, 403, 404],
        responseType: "arraybuffer",
      });
      if (resp.status !== 200) return null;
      const bytes = new Uint8Array(resp.response || []);
      const header = String.fromCharCode(...bytes.slice(0, 5));
      const contentType = String(resp.getResponseHeader?.("Content-Type") || "").toLowerCase();
      if (!contentType.includes("pdf") && header !== "%PDF-") return null;

      await IOUtils.write(tmpPath, bytes);
      return tmpPath;
    } catch (e) {
      Zotero.debug(`Elsevier PDF Helper download failed: ${e}`);
      try {
        await IOUtils.remove(tmpPath, { ignoreAbsent: true });
      } catch (removeError) {
        Zotero.debug(`Elsevier PDF Helper temp cleanup failed: ${removeError}`);
      }
      return null;
    }
  };

  elsevierPDF.canBrowserRequestURL = function(url) {
    return !!(url && Zotero.BrowserRequest?.getEntryForURL?.(url) && Zotero.Attachments?.downloadFile);
  };

  elsevierPDF.firstBrowserRequestCandidate = function(candidates) {
    for (const url of [...new Set(candidates || [])]) {
      if (this.canBrowserRequestURL(url)) {
        Zotero.debug(`Elsevier PDF Helper will try browser-mediated PDF URL: ${url}`);
        return url;
      }
    }
    return null;
  };

  elsevierPDF.attachPDF = async function(item, tmpPath, attachmentTitle) {
    const title = item.getField("title") || "Elsevier PDF";
    const safeTitle = title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
    let finalPath = PathUtils.join(PathUtils.tempDir, `${safeTitle || "Elsevier PDF"}.pdf`);
    try {
      if (tmpPath !== finalPath) {
        await IOUtils.move(tmpPath, finalPath);
      }
    } catch (e) {
      // If a same-name temp file exists, keep the generated temp path.
      finalPath = tmpPath;
    }

    if (Zotero.Attachments.importFromFile) {
      return await Zotero.Attachments.importFromFile({
        file: finalPath,
        parentItemID: item.id,
        contentType: "application/pdf",
        title: attachmentTitle || "Elsevier PDF",
      });
    }
    throw new Error("当前 Zotero 版本没有可用的附件导入 API");
  };

  elsevierPDF.addTags = async function(item, tags) {
    for (const tag of tags) {
      item.addTag(tag);
    }
    await item.saveTx();
  };

  elsevierPDF.cleanDOI = function(doi) {
    return String(doi || "")
      .trim()
      .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
      .replace(/^doi:\s*/i, "");
  };

  elsevierPDF.extractPII = function(text) {
    text = String(text || "");
    let m = text.match(/\/pii\/([A-Z0-9]{16,})/i);
    if (m) return m[1];
    m = text.match(/\b(S\d{15,}[A-Z0-9]*)\b/i);
    return m ? m[1] : "";
  };

  elsevierPDF.piiFromDOI = function(doi) {
    doi = this.cleanDOI(doi);
    const m = doi.match(/10\.1016\/(S[0-9A-Z]+|[A-Z][0-9A-Z]{12,})/i);
    return m ? m[1] : "";
  };

  elsevierPDF.extractRedirectURL = function(html) {
    html = this.decodeHTML(String(html || ""));
    let m = html.match(/id=["']redirectURL["'][^>]*value=["']([^"']+)["']/i)
      || html.match(/value=["']([^"']+)["'][^>]*id=["']redirectURL["']/i)
      || html.match(/url=['"]?([^'">\s]+sciencedirect\.com[^'">\s]+)/i);
    if (!m) return "";
    try {
      return decodeURIComponent(m[1]);
    } catch (e) {
      return m[1];
    }
  };

  elsevierPDF.decodeHTML = function(value) {
    return String(value || "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  };
})();
