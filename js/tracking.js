(function (window, document) {
  "use strict";

  if (window.AppTracking && window.AppTracking.__initialized) {
    return;
  }

  var DEFAULT_CONFIG = {
    destination: "",
    autoRedirect: false,
    autoRedirectDelay: 0,
    storageKey: "app_tracking_params",
    ttlDays: 30,
    cookieDomain: "",
    syncUrl: true,
    propagateAll: true,
    trackingKeys: [
      "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
      "utm_id", "utm_source_platform", "utm_creative_format", "utm_marketing_tactic",
      "xcod", "sck", "src", "ref", "aff", "affiliate", "affid", "subid", "sub_id",
      "gclid", "wbraid", "gbraid", "dclid", "gad_source", "gad_campaignid",
      "fbclid", "ttclid", "twclid", "msclkid", "li_fat_id", "epik", "igshid",
      "ScCid", "sccid", "rdt_cid", "irclickid", "yclid", "vmcid", "obclid", "ml_subscriber",
      "campaign_id", "adset_id", "ad_id", "adgroup_id", "creative", "keyword",
      "placement", "device", "network", "matchtype", "adposition", "target",
      "site_source_name", "campaignid", "adgroupid", "creativeid",
      "_gl", "_ga",
      "_fbp", "_fbc"
    ],
    attributionKeys: [
      "utm_source", "utm_campaign", "xcod", "sck", "src",
      "gclid", "wbraid", "gbraid", "fbclid", "ttclid", "msclkid", "twclid", "li_fat_id"
    ],
    blockedKeys: ["tracking_debug"],
    organic: {
      enabled: true,
      sourcePrefix: "organic",
      idLength: 8,
      medium: "direct",
      campaign: "organic-campaign",
      content: "organic-traffic",
      term: "organic",
      inferFromClickIds: true
    },
    utmify: {
      enabled: true,
      utmSeparator: "jLj",
      xcodSeparator: "hQwK21wXxR",
      storageKeys: { FB: "lead", google: "lead-google" },
      pollInterval: 500,
      pollTimeout: 30000,
      waitBeforeRedirect: 1500
    },
    decorateLinks: true,
    ignoredHosts: [
      "fonts.googleapis.com",
      "fonts.gstatic.com",
      "static.cloudflareinsights.com",
      "cdn.utmify.com.br",
      "www.googletagmanager.com",
      "connect.facebook.net"
    ],
    captureFacebookCookies: true,
    debug: false
  };

  var PREFIX = "[tracking]";
  var hasOwn = Object.prototype.hasOwnProperty;

  function isObject(value) {
    return value !== null && typeof value === "object" && !isArray(value);
  }

  function isArray(value) {
    return Object.prototype.toString.call(value) === "[object Array]";
  }

  function log() {
    if (!config.debug || !window.console || !window.console.log) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift(PREFIX);
    window.console.log.apply(window.console, args);
  }

  function warn() {
    if (!window.console || !window.console.warn) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift(PREFIX);
    window.console.warn.apply(window.console, args);
  }

  function mergeConfig(base, override) {
    var result = {};
    var key;
    for (key in base) {
      if (!hasOwn.call(base, key)) continue;
      result[key] = isObject(base[key]) ? mergeConfig(base[key], {}) : base[key];
    }
    if (!isObject(override)) return result;
    for (key in override) {
      if (!hasOwn.call(override, key)) continue;
      if (isObject(result[key]) && isObject(override[key])) {
        result[key] = mergeConfig(result[key], override[key]);
      } else {
        result[key] = override[key];
      }
    }
    return result;
  }

  function decodeComponent(value) {
    try {
      return decodeURIComponent(String(value).replace(/\+/g, " "));
    } catch (error) {
      return String(value);
    }
  }

  function encodeComponent(value) {
    try {
      return encodeURIComponent(String(value));
    } catch (error) {
      return String(value);
    }
  }

  function parseQuery(query) {
    var map = {};
    if (!query) return map;
    var raw = String(query).replace(/^[?#]+/, "");
    if (!raw) return map;

    var pairs = raw.split("&");
    for (var i = 0; i < pairs.length; i++) {
      var pair = pairs[i];
      if (!pair) continue;

      var separator = pair.indexOf("=");
      var key = separator === -1 ? pair : pair.slice(0, separator);
      var value = separator === -1 ? "" : pair.slice(separator + 1);

      key = decodeComponent(key);
      if (!key) continue;

      if (!map[key]) map[key] = [];
      map[key].push(decodeComponent(value));
    }
    return map;
  }

  function stringifyQuery(map) {
    var parts = [];
    for (var key in map) {
      if (!hasOwn.call(map, key)) continue;
      var values = map[key];
      if (!isArray(values)) values = [values];
      for (var i = 0; i < values.length; i++) {
        parts.push(encodeComponent(key) + "=" + encodeComponent(values[i]));
      }
    }
    return parts.join("&");
  }

  function cloneMap(map) {
    var copy = {};
    for (var key in map) {
      if (!hasOwn.call(map, key)) continue;
      copy[key] = map[key].slice();
    }
    return copy;
  }

  function countKeys(map) {
    var total = 0;
    for (var key in map) {
      if (hasOwn.call(map, key)) total++;
    }
    return total;
  }

  function splitUrl(href) {
    var value = String(href);
    var hash = "";
    var query = "";

    var hashIndex = value.indexOf("#");
    if (hashIndex !== -1) {
      hash = value.slice(hashIndex);
      value = value.slice(0, hashIndex);
    }

    var queryIndex = value.indexOf("?");
    if (queryIndex !== -1) {
      query = value.slice(queryIndex + 1);
      value = value.slice(0, queryIndex);
    }

    return { base: value, query: query, hash: hash };
  }

  var resolverAnchor = null;

  function absolutize(href) {
    try {
      if (typeof window.URL === "function") {
        return new window.URL(href, window.location.href).href;
      }
    } catch (error) {}

    try {
      if (!resolverAnchor) resolverAnchor = document.createElement("a");
      resolverAnchor.href = href;
      return resolverAnchor.href;
    } catch (error) {
      return String(href);
    }
  }

  function hostOf(href) {
    try {
      if (!resolverAnchor) resolverAnchor = document.createElement("a");
      resolverAnchor.href = href;
      return (resolverAnchor.host || "").toLowerCase();
    } catch (error) {
      return "";
    }
  }

  function indexOfValue(list, value) {
    if (!isArray(list)) return -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i] === value) return i;
    }
    return -1;
  }

  var memoryStore = {};

  function storageGet(area, key) {
    try {
      var store = window[area];
      if (!store) return null;
      return store.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function storageSet(area, key, value) {
    try {
      var store = window[area];
      if (!store) return false;
      store.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function storageRemove(area, key) {
    try {
      var store = window[area];
      if (store) store.removeItem(key);
    } catch (error) {}
  }

  function cookieGet(name) {
    try {
      var target = encodeComponent(name) + "=";
      var parts = String(document.cookie || "").split(";");
      for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        while (part.charAt(0) === " ") part = part.slice(1);
        if (part.indexOf(target) === 0) {
          return decodeComponent(part.slice(target.length));
        }
      }
    } catch (error) {}
    return null;
  }

  function cookieSet(name, value, days) {
    try {
      if (String(value).length > 3500) return false;

      var expires = new Date();
      expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);

      var cookie = encodeComponent(name) + "=" + encodeComponent(value) +
        ";expires=" + expires.toUTCString() +
        ";path=/;SameSite=Lax";

      if (config.cookieDomain) cookie += ";domain=" + config.cookieDomain;
      if (window.location.protocol === "https:") cookie += ";Secure";

      document.cookie = cookie;
      return true;
    } catch (error) {
      return false;
    }
  }

  function saveState() {
    var payload;
    try {
      payload = JSON.stringify({ v: 1, t: nowMs(), p: state });
    } catch (error) {
      return;
    }

    memoryStore[config.storageKey] = payload;
    storageSet("sessionStorage", config.storageKey, payload);
    storageSet("localStorage", config.storageKey, payload);
    cookieSet(config.storageKey, payload, config.ttlDays);
  }

  function loadState() {
    var raw = memoryStore[config.storageKey] ||
      storageGet("sessionStorage", config.storageKey) ||
      storageGet("localStorage", config.storageKey) ||
      cookieGet(config.storageKey);

    if (!raw) return {};

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return {};
    }

    if (!parsed || !isObject(parsed.p)) return {};

    var maxAge = config.ttlDays * 24 * 60 * 60 * 1000;
    if (parsed.t && nowMs() - parsed.t > maxAge) {
      log("Parâmetros salvos expiraram — descartando.");
      clearStoredState();
      return {};
    }

    var map = {};
    for (var key in parsed.p) {
      if (!hasOwn.call(parsed.p, key)) continue;
      var values = parsed.p[key];
      if (!isArray(values)) values = [values];
      map[key] = [];
      for (var i = 0; i < values.length; i++) {
        map[key].push(String(values[i]));
      }
    }
    return map;
  }

  function clearStoredState() {
    delete memoryStore[config.storageKey];
    storageRemove("sessionStorage", config.storageKey);
    storageRemove("localStorage", config.storageKey);
    cookieSet(config.storageKey, "", -1);
  }

  function nowMs() {
    return new Date().getTime();
  }

  var config = DEFAULT_CONFIG;
  var state = {};
  var utmifyOrigin = null;
  var utmifyLeadId = null;
  var utmifyTimer = null;
  var readyCallbacks = [];
  var readyFired = false;

  function getValue(key) {
    var values = state[key];
    return values && values.length ? values[0] : null;
  }

  function hasValue(key) {
    var value = getValue(key);
    return value !== null && value !== "";
  }

  function setValue(key, value) {
    state[key] = [String(value)];
  }

  function isBlocked(key) {
    return indexOfValue(config.blockedKeys, key) !== -1;
  }

  function isPropagatable(key) {
    if (isBlocked(key)) return false;
    if (config.propagateAll) return true;
    return indexOfValue(config.trackingKeys, key) !== -1;
  }

  function captureParams() {
    var urlParams = parseQuery(window.location.search);
    var stored = loadState();

    var newAttribution = false;
    for (var i = 0; i < config.attributionKeys.length; i++) {
      var key = config.attributionKeys[i];
      if (hasOwn.call(urlParams, key) && urlParams[key].length && urlParams[key][0] !== "") {
        newAttribution = true;
        break;
      }
    }

    if (newAttribution || !countKeys(stored)) {
      state = cloneMap(urlParams);
      if (newAttribution && countKeys(stored)) {
        log("Nova atribuição detectada na URL — parâmetros anteriores descartados.");
      }
    } else {
      state = cloneMap(stored);
      for (var urlKey in urlParams) {
        if (!hasOwn.call(urlParams, urlKey)) continue;
        state[urlKey] = urlParams[urlKey].slice();
      }
      log("Parâmetros restaurados do armazenamento.");
    }

    for (var stateKey in state) {
      if (hasOwn.call(state, stateKey) && isBlocked(stateKey)) {
        delete state[stateKey];
      }
    }

    if (config.captureFacebookCookies) captureFacebookCookies();
  }

  function captureFacebookCookies() {
    var fbp = cookieGet("_fbp");
    if (fbp && !hasValue("_fbp")) setValue("_fbp", fbp);

    if (hasValue("_fbc")) return;

    var fbc = cookieGet("_fbc");
    var fbclid = getValue("fbclid");

    if (fbclid) {
      if (fbc && endsWith(String(fbc), "." + fbclid)) {
        setValue("_fbc", fbc);
      } else {
        setValue("_fbc", "fb.1." + nowMs() + "." + fbclid);
      }
      return;
    }

    if (fbc) setValue("_fbc", fbc);
  }

  function randomId(length) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    var result = "";
    for (var i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  function inferSourceFromClickIds() {
    if (hasValue("gclid") || hasValue("wbraid") || hasValue("gbraid") ||
        hasValue("dclid") || hasValue("gad_source")) {
      return { source: "google", medium: "cpc" };
    }
    if (hasValue("fbclid")) return { source: "FB", medium: "paid" };
    if (hasValue("ttclid")) return { source: "tiktok", medium: "cpc" };
    if (hasValue("msclkid")) return { source: "bing", medium: "cpc" };
    if (hasValue("twclid")) return { source: "twitter", medium: "cpc" };
    if (hasValue("li_fat_id")) return { source: "linkedin", medium: "cpc" };
    if (hasValue("epik")) return { source: "pinterest", medium: "cpc" };
    return null;
  }

  function setIfEmpty(key, value) {
    if (!hasValue(key) && value) setValue(key, value);
  }

  function ensureUtmSource() {
    if (!config.organic.enabled) return;
    if (hasValue("utm_source")) {
      log("utm_source recebido:", getValue("utm_source"));
      return;
    }

    var inferred = config.organic.inferFromClickIds ? inferSourceFromClickIds() : null;

    if (inferred) {
      log("Sem utm_source, mas há click ID — origem deduzida:", inferred.source);
      setValue("utm_source", inferred.source);
      setIfEmpty("utm_medium", inferred.medium);
      setIfEmpty("utm_campaign", config.organic.campaign);
      return;
    }

    log("Nenhum utm_source encontrado — gerando UTMs de tráfego orgânico.");
    setValue("utm_source", config.organic.sourcePrefix + randomId(config.organic.idLength));
    setIfEmpty("utm_medium", config.organic.medium);
    setIfEmpty("utm_campaign", config.organic.campaign);
    setIfEmpty("utm_content", config.organic.content);
    setIfEmpty("utm_term", config.organic.term);
  }

  function resolveOrigin(utmSource) {
    if (!utmSource) return null;
    var base = String(utmSource).split(config.utmify.utmSeparator)[0];
    return hasOwn.call(config.utmify.storageKeys, base) ? base : null;
  }

  function readLeadFromStorage(origin) {
    var key = config.utmify.storageKeys[origin];
    if (!key) return null;

    var raw = storageGet("localStorage", key) || storageGet("sessionStorage", key);
    if (!raw) return null;

    try {
      var parsed = JSON.parse(raw);
      return parsed && parsed._id ? String(parsed._id) : null;
    } catch (error) {
      return null;
    }
  }

  function resolveLeadId(utmSource, origin) {
    var prefix = origin + config.utmify.utmSeparator;

    if (utmSource && utmSource.indexOf(prefix) === 0) {
      var embedded = utmSource.slice(prefix.length);
      if (embedded) return embedded;
    }

    return readLeadFromStorage(origin);
  }

  function applyUtmifyLead() {
    if (!config.utmify.enabled) return true;

    var currentSource = getValue("utm_source");
    var origin = resolveOrigin(currentSource);

    utmifyOrigin = origin;
    if (!origin) return true;

    var leadId = resolveLeadId(currentSource, origin);
    if (!leadId) return false;

    utmifyLeadId = leadId;
    var desired = origin + config.utmify.utmSeparator + leadId;
    var changed = false;

    if (currentSource !== desired) {
      setValue("utm_source", desired);
      changed = true;
    }

    var currentXcod = getValue("xcod");
    if (currentXcod) {
      var segments = String(currentXcod).split(config.utmify.xcodSeparator);
      if (segments[0] !== desired) {
        segments[0] = desired;
        setValue("xcod", segments.join(config.utmify.xcodSeparator));
        changed = true;
      }
    }

    if (changed) {
      log("Lead da UTMify aplicado:", desired);
      saveState();
      syncUrl();
      decorateAll();
    }

    return true;
  }

  function startUtmifyWatcher() {
    if (!config.utmify.enabled) {
      fireReady();
      return;
    }

    if (applyUtmifyLead()) {
      fireReady();
      return;
    }

    log("Aguardando o pixel da UTMify gravar o lead...");
    var startedAt = nowMs();

    utmifyTimer = window.setInterval(function () {
      if (applyUtmifyLead()) {
        stopUtmifyWatcher();
        fireReady();
        return;
      }
      if (nowMs() - startedAt >= config.utmify.pollTimeout) {
        log("Tempo limite atingido sem lead da UTMify — seguindo sem ele.");
        stopUtmifyWatcher();
        fireReady();
      }
    }, config.utmify.pollInterval);
  }

  function stopUtmifyWatcher() {
    if (utmifyTimer) {
      window.clearInterval(utmifyTimer);
      utmifyTimer = null;
    }
  }

  function isLeadPending() {
    return !!(config.utmify.enabled && utmifyOrigin && !utmifyLeadId);
  }

  function fireReady() {
    if (readyFired) return;
    readyFired = true;
    var callbacks = readyCallbacks.slice();
    readyCallbacks = [];
    for (var i = 0; i < callbacks.length; i++) {
      try {
        callbacks[i](publicApi);
      } catch (error) {
        warn("Erro em callback de onReady:", error);
      }
    }
  }

  function onReady(callback) {
    if (typeof callback !== "function") return;
    if (readyFired) {
      try { callback(publicApi); } catch (error) { warn("Erro em callback de onReady:", error); }
      return;
    }
    readyCallbacks.push(callback);
  }

  function syncUrl() {
    if (!config.syncUrl) return;
    if (!window.history || typeof window.history.replaceState !== "function") return;

    try {
      var current = splitUrl(window.location.href);
      var merged = parseQuery(current.query);

      for (var key in state) {
        if (!hasOwn.call(state, key)) continue;
        if (isBlocked(key)) continue;
        merged[key] = state[key].slice();
      }

      var query = stringifyQuery(merged);
      var next = current.base + (query ? "?" + query : "") + current.hash;

      if (next !== window.location.href) {
        window.history.replaceState(window.history.state, document.title, next);
        log("URL sincronizada:", next);
      }
    } catch (error) {
      warn("Não foi possível sincronizar a URL:", error);
    }
  }

  function buildUrl(destination) {
    var target = destination || config.destination;
    if (!target) {
      warn("Nenhum destino configurado. Defina window.APP_TRACKING_CONFIG.destination.");
      return null;
    }

    var absolute = absolutize(target);
    var parts = splitUrl(absolute);
    var merged = parseQuery(parts.query);

    for (var key in state) {
      if (!hasOwn.call(state, key)) continue;
      if (!isPropagatable(key)) continue;
      if (!state[key].length) continue;
      merged[key] = state[key].slice();
    }

    var query = stringifyQuery(merged);
    return parts.base + (query ? "?" + query : "") + parts.hash;
  }

  var navigating = false;

  function navigate(destination, options) {
    options = options || {};

    var target = destination || config.destination;
    if (!target) {
      warn("navigate() chamado sem destino. Configure 'destination' antes de usar.");
      return false;
    }

    if (navigating) return true;
    navigating = true;

    var wait = typeof options.wait === "number"
      ? options.wait
      : config.utmify.waitBeforeRedirect;

    function perform() {
      try { applyUtmifyLead(); } catch (error) {}

      var url = buildUrl(target);
      if (!url) { navigating = false; return; }

      log("Redirecionando para:", url);
      try {
        if (options.replace === true) {
          window.location.replace(url);
        } else {
          window.location.href = url;
        }
      } catch (error) {
        window.location.href = url;
      }
    }

    if (isLeadPending() && wait > 0) {
      var done = false;
      var finish = function () {
        if (done) return;
        done = true;
        perform();
      };

      log("Aguardando até " + wait + "ms pelo lead da UTMify antes de redirecionar.");
      onReady(finish);
      window.setTimeout(finish, wait);
    } else {
      perform();
    }

    return true;
  }

  function go(options) {
    return navigate(config.destination, options);
  }

  var SKIP_PROTOCOLS = ["mailto:", "tel:", "sms:", "javascript:", "whatsapp:", "data:", "blob:", "file:"];

  function shouldSkipHref(href) {
    if (!href) return true;
    var value = String(href).replace(/^\s+/, "");
    if (!value || value.charAt(0) === "#") return true;

    var lower = value.toLowerCase();
    for (var i = 0; i < SKIP_PROTOCOLS.length; i++) {
      if (lower.indexOf(SKIP_PROTOCOLS[i]) === 0) return true;
    }
    return false;
  }

  function endsWith(value, suffix) {
    if (value.length < suffix.length) return false;
    return value.slice(value.length - suffix.length) === suffix;
  }

  function isIgnoredHost(host) {
    if (!host) return false;
    for (var i = 0; i < config.ignoredHosts.length; i++) {
      var ignored = String(config.ignoredHosts[i]).toLowerCase();
      if (!ignored) continue;

      if (host === ignored || endsWith(host, "." + ignored)) return true;
    }
    return false;
  }

  function decorate(element) {
    if (!element) return;

    var href = element.getAttribute ? element.getAttribute("href") : null;
    if (href === null && element.href) href = element.href;
    if (shouldSkipHref(href)) return;
    if (element.getAttribute && element.getAttribute("data-tracking-skip") !== null) return;

    var absolute = absolutize(href);
    if (isIgnoredHost(hostOf(absolute))) return;

    var decorated = buildUrl(absolute);
    if (!decorated) return;

    try {
      if (element.href !== decorated) element.href = decorated;
    } catch (error) {}
  }

  function decorateAll() {
    if (!config.decorateLinks) return;
    try {
      var links = document.querySelectorAll ? document.querySelectorAll("a[href]") : [];
      for (var i = 0; i < links.length; i++) decorate(links[i]);
      log("Links atualizados:", links.length);
    } catch (error) {
      warn("Falha ao atualizar os links:", error);
    }
  }

  function watchDomLinks() {
    if (!config.decorateLinks) return;
    if (typeof window.MutationObserver !== "function") return;

    try {
      var observer = new window.MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var added = mutations[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var node = added[j];
            if (!node || node.nodeType !== 1) continue;
            if (node.tagName === "A") decorate(node);
            if (node.querySelectorAll) {
              var inner = node.querySelectorAll("a[href]");
              for (var k = 0; k < inner.length; k++) decorate(inner[k]);
            }
          }
        }
      });

      observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true
      });
    } catch (error) {
      warn("Não foi possível observar novos links:", error);
    }
  }

  function watchClicks() {
    if (!document.addEventListener) return;

    document.addEventListener("click", function (event) {
      var node = event.target;

      while (node && node !== document) {
        if (node.getAttribute) {
          var manual = node.getAttribute("data-tracking-href");
          if (manual !== null) {
            if (event.preventDefault) event.preventDefault();
            navigate(manual || config.destination);
            return;
          }
          if (node.getAttribute("data-tracking-go") !== null) {
            if (event.preventDefault) event.preventDefault();
            go();
            return;
          }
        }

        if (node.tagName === "A") {
          decorate(node);
          return;
        }

        node = node.parentNode;
      }
    }, true);
  }

  function getParams() {
    var result = {};
    for (var key in state) {
      if (!hasOwn.call(state, key)) continue;
      if (!isPropagatable(key)) continue;
      result[key] = state[key].length ? state[key][0] : "";
    }
    return result;
  }

  function getAllParams() {
    var result = {};
    for (var key in state) {
      if (!hasOwn.call(state, key)) continue;
      if (!isPropagatable(key)) continue;
      result[key] = state[key].slice();
    }
    return result;
  }

  function getQuery() {
    return stringifyQuery(getAllParams());
  }

  function appendQuery(url) {
    var result = buildUrl(url);
    return result || url;
  }

  function refresh() {
    captureParams();
    ensureUtmSource();
    saveState();
    syncUrl();
    decorateAll();
    return getParams();
  }

  function reset() {
    clearStoredState();
    state = {};
    utmifyOrigin = null;
    utmifyLeadId = null;
    log("Parâmetros de rastreamento apagados.");
  }

  function debugDump() {
    var known = {};
    var extra = {};

    for (var key in state) {
      if (!hasOwn.call(state, key)) continue;
      if (indexOfValue(config.trackingKeys, key) !== -1) {
        known[key] = state[key].join(", ");
      } else {
        extra[key] = state[key].join(", ");
      }
    }

    var report = {
      "Destino": config.destination || "(não configurado)",
      "Parâmetros de rastreamento": known,
      "Outros parâmetros preservados": extra,
      "Origem UTMify": utmifyOrigin || "(nenhuma)",
      "Lead UTMify": utmifyLeadId || "(não resolvido)",
      "Query final": getQuery(),
      "URL de destino": buildUrl(config.destination) || "(sem destino)"
    };

    if (window.console && window.console.log) window.console.log(PREFIX, report);
    return report;
  }

  var publicApi = {
    __initialized: true,
    getConfig: function () { return mergeConfig(config, {}); },
    getParams: getParams,
    getAllParams: getAllParams,
    getQuery: getQuery,
    getValue: getValue,
    buildUrl: buildUrl,
    appendQuery: appendQuery,
    navigate: navigate,
    go: go,
    decorate: decorate,
    decorateAll: decorateAll,
    onReady: onReady,
    isLeadPending: isLeadPending,
    getLeadId: function () { return utmifyLeadId; },
    getOrigin: function () { return utmifyOrigin; },
    refresh: refresh,
    reset: reset,
    debug: debugDump
  };

  function readScriptConfig() {
    var overrides = {};
    try {
      var scripts = document.getElementsByTagName("script");
      var current = document.currentScript;

      if (!current) {
        for (var i = scripts.length - 1; i >= 0; i--) {
          if (scripts[i].src && scripts[i].src.indexOf("tracking.js") !== -1) {
            current = scripts[i];
            break;
          }
        }
      }
      if (!current || !current.getAttribute) return overrides;

      var destination = current.getAttribute("data-destination");
      if (destination) overrides.destination = destination;

      var autoRedirect = current.getAttribute("data-auto-redirect");
      if (autoRedirect !== null) overrides.autoRedirect = autoRedirect !== "false";

      var delay = current.getAttribute("data-auto-redirect-delay");
      if (delay !== null && delay !== "") overrides.autoRedirectDelay = parseInt(delay, 10) || 0;

      var debug = current.getAttribute("data-debug");
      if (debug !== null) overrides.debug = debug !== "false";
    } catch (error) {}

    return overrides;
  }

  function onDomReady(callback) {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      window.setTimeout(callback, 0);
      return;
    }
    if (document.addEventListener) {
      document.addEventListener("DOMContentLoaded", callback);
    } else {
      window.setTimeout(function () { onDomReady(callback); }, 50);
    }
  }

  function init() {
    config = mergeConfig(DEFAULT_CONFIG, window.APP_TRACKING_CONFIG);
    config = mergeConfig(config, readScriptConfig());

    if (window.location.search.indexOf("tracking_debug=1") !== -1) config.debug = true;

    if (config.destination && config.destination.indexOf("SEU-DOMINIO-DE-DESTINO") !== -1) {
      warn(
        "O destino ainda é o valor de exemplo. Edite 'destination' em " +
        "window.APP_TRACKING_CONFIG (no <head> do index.html) com a URL real."
      );
    }

    captureParams();
    ensureUtmSource();
    saveState();
    syncUrl();

    log("Parâmetros capturados:", getParams());

    startUtmifyWatcher();

    onDomReady(function () {
      decorateAll();
      watchDomLinks();
      watchClicks();

      if (config.autoRedirect && config.destination) {
        log("Redirecionamento automático em " + config.autoRedirectDelay + "ms.");
        window.setTimeout(function () { go({ replace: true }); }, config.autoRedirectDelay);
      }
    });
  }

  window.AppTracking = publicApi;

  window.appAppendQuery = appendQuery;

  init();
})(window, document);
