(function () {
  var glowClass = {
    meal: "glow-meal",
    salad: "glow-salad",
    beer: "glow-beer",
    drink: "glow-drink"
  };

  function playGlow(button) {
    var className = glowClass[button.getAttribute("data-glow")];
    if (!className) return;
    button.classList.remove("glow-meal", "glow-salad", "glow-beer", "glow-drink");
    void button.offsetWidth;
    button.classList.add(className);
  }

  document.querySelectorAll(".item").forEach(function (button) {
    button.addEventListener("click", function () {
      playGlow(button);
    });
  });

  var beerQuery = window.matchMedia("(max-width: 799px)");

  function capBeerCans() {
    var section = document.querySelector(".style-page .bieres");
    if (!section) return;
    var items = section.querySelectorAll(":scope > .items > .item");
    if (items.length < 2 || !beerQuery.matches) {
      section.style.removeProperty("--beer-can-cap");
      return;
    }
    var top = items[0].getBoundingClientRect().top;
    var bottom = items[items.length - 1].getBoundingClientRect().bottom;
    section.style.setProperty("--beer-can-cap", Math.max(0, bottom - top) + "px");
  }

  capBeerCans();
  window.addEventListener("resize", capBeerCans);
  if (typeof beerQuery.addEventListener === "function") {
    beerQuery.addEventListener("change", capBeerCans);
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(capBeerCans);
  }
  var beerItems = document.querySelector(".bieres .items");
  if (beerItems && window.ResizeObserver) {
    new ResizeObserver(capBeerCans).observe(beerItems);
  }

  var wideQuery = window.matchMedia("(min-width: 800px)");

  function placeMiso() {
    var section = document.querySelector(".style-page .soupe");
    if (!section) return;
    var photo = section.querySelector(".miso-photo");
    var img = photo && photo.querySelector("img");
    var riz = section.querySelector(".item-riz");
    var items = section.querySelector(":scope > .items");
    if (!photo || !img || !riz || !items) return;

    var height = Math.floor(riz.getBoundingClientRect().height) + 10;
    if (height < 1) return;
    var aspect = img.naturalWidth ? img.naturalWidth / img.naturalHeight : 570 / 547;
    var width = Math.round(height * aspect);

    var styles = window.getComputedStyle(items);
    var gap = parseFloat(styles.columnGap) || 0;
    var columns = wideQuery.matches ? 2 : 1;
    var maxWidth = columns > 1 ? (items.clientWidth - gap) / columns : items.clientWidth;
    if (maxWidth > 0 && width > maxWidth) {
      width = Math.floor(maxWidth);
      height = Math.floor(width / aspect);
    }
    if (height < 1 || width < 1) return;

    var nextWidth = width + "px";
    var nextHeight = height + "px";
    if (img.style.width !== nextWidth) img.style.width = nextWidth;
    if (img.style.height !== nextHeight) img.style.height = nextHeight;
    if (img.style.maxHeight !== "none") img.style.maxHeight = "none";
  }

  placeMiso();
  window.addEventListener("resize", placeMiso);
  if (typeof wideQuery.addEventListener === "function") {
    wideQuery.addEventListener("change", placeMiso);
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(placeMiso);
  }
  var misoImg = document.querySelector(".miso-photo img");
  if (misoImg && !misoImg.complete) misoImg.addEventListener("load", placeMiso);
  var misoSection = document.querySelector(".soupe");
  if (misoSection && window.ResizeObserver) {
    new ResizeObserver(placeMiso).observe(misoSection);
  }
}());
