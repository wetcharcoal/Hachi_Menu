(function () {
  var slot = document.querySelector("[data-site-footer]");
  if (!slot) return;

  fetch("/footer.html?v=shared1")
    .then(function (response) {
      if (!response.ok) throw new Error("footer");
      return response.text();
    })
    .then(function (html) {
      var template = document.createElement("template");
      template.innerHTML = html.trim();
      var footer = template.content.querySelector(".home-footer");
      if (!footer) return;
      slot.replaceWith(footer);
      document.dispatchEvent(new CustomEvent("site-footer-ready"));
    });
})();
