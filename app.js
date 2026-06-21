(function () {
  "use strict";

  const SIGNER_IMAGES = {
    esign: ["icons/esign.jpg", "icons/esign.svg"],
    ksign: ["icons/ksign.jpg", "icons/ksign.svg"],
    feather: ["icons/feather.jpg", "icons/feather.svg"],
    gbox: ["icons/gbox.jpg", "icons/gbox.svg"],
    scarlet: ["icons/scarlet.jpg", "icons/scarlet.svg"],
  };

  const SIGNER_FALLBACK_LETTERS = {
    esign: "E",
    ksign: "K",
    feather: "F",
    gbox: "G",
    scarlet: "S",
  };

  const I18N = {
    ru: {
      loading: "Подготовка установки…",
      ready: "Готово к установке",
      opening: "Открываем Safari…",
      install: "Установить",
      errorLink: "Ссылка недействительна. Получите сертификат заново в боте.",
      errorNoUrl: "Ссылка установки не найдена.",
      errorInit: "Не удалось открыть страницу. Обновите Mini App.",
    },
    en: {
      loading: "Preparing install…",
      ready: "Ready to install",
      opening: "Opening Safari…",
      install: "Install",
      errorLink: "Invalid link. Get the certificate again from the bot.",
      errorNoUrl: "Install link not found.",
      errorInit: "Failed to load. Refresh the Mini App.",
    },
  };

  const tg = window.Telegram && window.Telegram.WebApp;
  const params = new URLSearchParams(window.location.search);

  const card = document.getElementById("card");
  const iconEl = document.getElementById("icon");
  const iconImg = document.getElementById("icon-img");
  const iconFallback = document.getElementById("icon-fallback");
  const appNameEl = document.getElementById("app-name");
  const subtitleEl = document.getElementById("subtitle");
  const bundleEl = document.getElementById("bundle-id");
  const loaderEl = document.getElementById("loader");
  const installBtn = document.getElementById("install-btn");
  const errorEl = document.getElementById("error");

  let installUrl = "";

  function lang() {
    const code =
      (tg &&
        tg.initDataUnsafe &&
        tg.initDataUnsafe.user &&
        tg.initDataUnsafe.user.language_code) ||
      "ru";
    return code.startsWith("en") ? "en" : "ru";
  }

  function t(key) {
    const dict = I18N[lang()] || I18N.ru;
    return dict[key] || I18N.ru[key] || key;
  }

  function setError(message) {
    if (card) card.classList.add("error-state");
    if (loaderEl) loaderEl.hidden = true;
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = message;
    }
    if (installBtn) installBtn.hidden = true;
  }

  function showReady() {
    if (card) card.classList.add("ready");
    if (loaderEl) loaderEl.hidden = true;
    if (subtitleEl) subtitleEl.textContent = t("ready");
    if (installBtn) installBtn.hidden = false;
  }

  function absUrl(rel) {
    try {
      return new URL(rel, window.location.href).href;
    } catch (_err) {
      return rel;
    }
  }

  function showIconFallback(signerId, name) {
    if (!iconEl) return;
    if (iconImg) {
      iconImg.hidden = true;
      iconImg.removeAttribute("src");
    }
    if (iconFallback) {
      iconFallback.hidden = false;
      iconFallback.textContent =
        SIGNER_FALLBACK_LETTERS[signerId] || name.charAt(0).toUpperCase() || "?";
    }
    iconEl.classList.add("has-fallback");
  }

  function loadSignerIcon(signerId, name) {
    if (!iconEl) return;

    iconEl.className = "icon " + signerId;
    iconEl.classList.remove("has-fallback");

    const candidates = SIGNER_IMAGES[signerId] || ["icons/unknown.svg"];
    let index = 0;

    function tryNext() {
      if (!iconImg) {
        showIconFallback(signerId, name);
        return;
      }
      if (index >= candidates.length) {
        showIconFallback(signerId, name);
        return;
      }
      iconImg.onload = function () {
        iconEl.classList.remove("has-fallback");
        if (iconFallback) iconFallback.hidden = true;
        iconImg.hidden = false;
      };
      iconImg.onerror = function () {
        index += 1;
        tryNext();
      };
      iconImg.hidden = false;
      iconImg.alt = name;
      iconImg.src = absUrl(candidates[index]);
    }

    if (iconFallback) iconFallback.hidden = true;
    tryNext();
  }

  function applySignerUi(data) {
    const signerId = (data.signer_id || "unknown").toLowerCase();
    const name = data.app_name || "App";
    const bundle = data.bundle_id || "";

    if (appNameEl) appNameEl.textContent = name;
    loadSignerIcon(signerId, name);

    if (bundleEl) {
      bundleEl.textContent = bundle ? bundle : "";
      bundleEl.style.display = bundle ? "block" : "none";
    }
  }

  function openInSafari(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!installUrl) return;

    if (subtitleEl) subtitleEl.textContent = t("opening");

    if (tg && typeof tg.openLink === "function") {
      tg.openLink(installUrl, { try_instant_view: false });
      return;
    }

    const link = document.createElement("a");
    link.href = installUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function b64urlToBytes(value) {
    let b64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    if (pad) b64 += "=".repeat(4 - pad);
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function decodeEmbeddedUrl(encoded) {
    if (!encoded) return "";
    try {
      return new TextDecoder().decode(b64urlToBytes(encoded));
    } catch (_err) {
      return "";
    }
  }

  function readDirectParams() {
    const encoded = (params.get("u") || "").trim();
    const plain = (params.get("url") || "").trim();
    const install = encoded ? decodeEmbeddedUrl(encoded) : plain;
    if (!install) return null;

    return {
      install_url: install,
      signer_id: (params.get("s") || "unknown").trim(),
      app_name: (params.get("n") || "App").trim(),
      bundle_id: (params.get("b") || "").trim(),
    };
  }

  function init() {
    try {
      if (tg) {
        tg.ready();
        tg.expand();
        if (tg.setHeaderColor) tg.setHeaderColor("secondary_bg_color");
        if (tg.setBackgroundColor) tg.setBackgroundColor("bg_color");
      }

      if (subtitleEl) subtitleEl.textContent = t("loading");
      if (installBtn) {
        installBtn.textContent = t("install");
        installBtn.addEventListener("click", openInSafari, { passive: false });
      }

      const data = readDirectParams();
      if (!data) {
        setError(t("errorLink"));
        return;
      }

      installUrl = (data.install_url || "").trim();
      if (!installUrl) {
        setError(t("errorNoUrl"));
        return;
      }

      applySignerUi(data);
      showReady();
    } catch (_err) {
      setError(t("errorInit"));
    }
  }

  init();
})();
