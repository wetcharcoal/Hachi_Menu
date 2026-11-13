(function () {
  var header = document.querySelector(".site-header");
  var slider = document.querySelector(".lang-slider");
  var aboutScroll = document.querySelector(".about-scroll");
  var panels = aboutScroll ? Array.prototype.slice.call(aboutScroll.querySelectorAll(".about-panel")) : [];
  var promo = document.querySelector(".menu-promo");
  var motionQuery = window.matchMedia("(min-width: 800px) and (prefers-reduced-motion: no-preference)");

  function setHeaderHeight() {
    if (!header) return;
    document.documentElement.style.setProperty("--site-header", header.offsetHeight + "px");
  }

  var catalog = null;
  var activeLang = document.documentElement.getAttribute("data-lang") || "fr";

  function applyCopy(lang) {
    if (!catalog) return;
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n]"), function (node) {
      var entry = catalog[node.getAttribute("data-i18n")];
      if (!entry || !entry[lang]) return;
      node.textContent = entry[lang];
    });
  }

  function setLanguage(lang) {
    activeLang = lang === "en" ? "en" : "fr";
    document.documentElement.lang = activeLang;
    document.documentElement.setAttribute("data-lang", activeLang);
    applyCopy(activeLang);
    if (!slider) return;
    slider.setAttribute("data-lang", activeLang);
    Array.prototype.forEach.call(slider.querySelectorAll("button"), function (button) {
      var selected = button.getAttribute("data-lang") === activeLang;
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  }

  fetch("i18n/home.json")
    .then(function (response) {
      if (!response.ok) throw new Error("translations");
      return response.json();
    })
    .then(function (data) {
      catalog = data;
      applyCopy(activeLang);
    });

  if (slider) {
    slider.addEventListener("click", function (event) {
      var button = event.target.closest("button");
      if (!button || !slider.contains(button)) return;
      setLanguage(button.getAttribute("data-lang") || "fr");
    });
  }

  var leaveDialog = document.querySelector(".leave-dialog");
  var leaveConfirm = leaveDialog ? leaveDialog.querySelector("[data-leave='confirm']") : null;
  var leaveCancel = leaveDialog ? leaveDialog.querySelector("[data-leave='cancel']") : null;
  var pendingHref = "";
  var pendingTrigger = null;

  function isExternal(anchor) {
    var href = anchor.getAttribute("href");
    if (!href || href.charAt(0) === "#") return false;
    if (href.indexOf("tel:") === 0 || href.indexOf("mailto:") === 0) return true;
    var url;
    try {
      url = new URL(anchor.href, window.location.href);
    } catch (error) {
      return false;
    }
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin !== window.location.origin;
  }

  function closeLeave() {
    if (!leaveDialog) return;
    leaveDialog.hidden = true;
    document.body.classList.remove("has-leave-dialog");
    pendingHref = "";
    if (pendingTrigger) pendingTrigger.focus();
    pendingTrigger = null;
  }

  function openLeave(href, trigger) {
    if (!leaveDialog || !leaveConfirm) return;
    pendingHref = href;
    pendingTrigger = trigger;
    leaveDialog.hidden = false;
    document.body.classList.add("has-leave-dialog");
    leaveConfirm.focus();
  }

  document.addEventListener("click", function (event) {
    var anchor = event.target.closest("a");
    if (!anchor || !isExternal(anchor)) return;
    event.preventDefault();
    openLeave(anchor.href, anchor);
  });

  if (leaveConfirm) {
    leaveConfirm.addEventListener("click", function () {
      var href = pendingHref;
      if (leaveDialog) leaveDialog.hidden = true;
      document.body.classList.remove("has-leave-dialog");
      pendingHref = "";
      pendingTrigger = null;
      if (href) window.location.href = href;
    });
  }

  if (leaveCancel) leaveCancel.addEventListener("click", closeLeave);

  if (leaveDialog) {
    leaveDialog.addEventListener("click", function (event) {
      if (event.target === leaveDialog) closeLeave();
    });
    leaveDialog.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLeave();
        return;
      }
      if (event.key !== "Tab" || !leaveConfirm || !leaveCancel) return;
      var nodes = [leaveConfirm, leaveCancel];
      var index = nodes.indexOf(document.activeElement);
      if (index === -1) return;
      event.preventDefault();
      var next = event.shiftKey ? (index + nodes.length - 1) % nodes.length : (index + 1) % nodes.length;
      nodes[next].focus();
    });
  }

  function opacityFor(progress, index, count) {
    if (count < 2) return 1;
    var fade = 0.025;
    var hold = (1 - (count - 1) * fade * 2) / count;
    var holdStart = index * (hold + fade * 2);
    var holdEnd = holdStart + hold;
    if (index === count - 1) holdEnd = 1;
    if (index > 0 && progress < holdStart) {
      var fadeInStart = holdStart - fade;
      if (progress <= fadeInStart) return 0;
      return (progress - fadeInStart) / fade;
    }
    if (progress <= holdEnd) return 1;
    if (index === count - 1) return 1;
    var fadeOutEnd = holdEnd + fade;
    if (progress >= fadeOutEnd) return 0;
    return 1 - (progress - holdEnd) / fade;
  }

  function updateAbout() {
    if (!aboutScroll || !panels.length) return;
    if (!motionQuery.matches) {
      panels.forEach(function (panel) {
        panel.style.opacity = "";
        panel.removeAttribute("aria-hidden");
      });
      return;
    }
    var total = aboutScroll.offsetHeight - window.innerHeight;
    var progress = total > 0 ? Math.min(1, Math.max(0, -aboutScroll.getBoundingClientRect().top / total)) : 0;
    var opacities = panels.map(function (panel, index) {
      return opacityFor(progress, index, panels.length);
    });
    var best = 0;
    opacities.forEach(function (opacity, index) {
      if (opacity > opacities[best]) best = index;
    });
    panels.forEach(function (panel, index) {
      panel.style.opacity = String(opacities[index]);
      if (index === best) panel.removeAttribute("aria-hidden");
      else panel.setAttribute("aria-hidden", "true");
    });
  }

  var ticking = false;
  function requestUpdate() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      updateAbout();
    });
  }

  setHeaderHeight();
  setLanguage(document.documentElement.getAttribute("data-lang") || "fr");
  updateAbout();

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", function () {
    setHeaderHeight();
    requestUpdate();
  });
  if (typeof motionQuery.addEventListener === "function") {
    motionQuery.addEventListener("change", function () {
      setHeaderHeight();
      requestUpdate();
    });
  }

  if (promo && "IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        promo.classList.add("is-inview");
        observer.disconnect();
      });
    }, { threshold: 0.45 });
    observer.observe(promo);
  } else if (promo) {
    promo.classList.add("is-inview");
  }
})();
