(function () {
  var slot = document.querySelector("[data-site-header]");
  if (!slot) return;

  fetch("/header.html?v=shared1")
    .then(function (response) {
      if (!response.ok) throw new Error("header");
      return response.text();
    })
    .then(function (html) {
      var template = document.createElement("template");
      template.innerHTML = html.trim();
      var header = template.content.querySelector(".site-header");
      if (!header) return;
      slot.replaceWith(header);
      document.dispatchEvent(new CustomEvent("site-header-ready"));
    });
})();
