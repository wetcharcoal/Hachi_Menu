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

  function textEdge(el, edge) {
    if (!el) return 0;
    var range = document.createRange();
    range.selectNodeContents(el);
    var rects = range.getClientRects();
    var value = 0;
    for (var i = 0; i < rects.length; i++) {
      if (rects[i][edge] > value) value = rects[i][edge];
    }
    return value;
  }

  function placeYuzu() {
    var section = document.querySelector(".style-page .sans-alcool");
    if (!section) return;
    var items = section.querySelector(":scope > .items");
    var ume = section.querySelector(".item-ume");
    var yuzu = section.querySelector(".item-yuzu");
    var photo = section.querySelector(".yuzu-photo");
    if (!items || !ume || !yuzu || !photo) return;
    if (!wideQuery.matches) {
      photo.style.top = "";
      photo.style.width = "";
      items.style.paddingBottom = "";
      return;
    }
    if (items.style.paddingBottom) items.style.paddingBottom = "";

    var img = photo.querySelector("img");
    var itemsRect = items.getBoundingClientRect();
    var rightItem = ume.getBoundingClientRect().right >= yuzu.getBoundingClientRect().right ? ume : yuzu;
    var desc = rightItem.querySelector(".desc-fr");
    var descEn = rightItem.querySelector(".desc-en");
    var descTop = desc.getBoundingClientRect().top;
    var descBottom = Math.max(textEdge(desc, "bottom"), textEdge(descEn, "bottom"));
    var contentBottom = itemsRect.top;
    items.querySelectorAll(":scope > .item").forEach(function (item) {
      var bottom = item.getBoundingClientRect().bottom;
      if (bottom > contentBottom) contentBottom = bottom;
    });
    var aspect = img && img.naturalWidth ? img.naturalWidth / img.naturalHeight : 1080 / 932;
    var maxWidth = rightItem.getBoundingClientRect().width;
    var textLimit = Math.max(textEdge(desc, "right"), textEdge(descEn, "right"));
    var priceBox = rightItem.querySelector(".price").getBoundingClientRect();

    function fit(topEdge) {
      var nextHeight = contentBottom - topEdge;
      if (nextHeight < 1) return null;
      var nextWidth = nextHeight * aspect;
      if (nextWidth > maxWidth) {
        nextWidth = maxWidth;
        nextHeight = nextWidth / aspect;
      }
      return { top: topEdge - itemsRect.top, width: nextWidth, height: nextHeight };
    }

    function coversText(box) {
      var left = itemsRect.right - box.width;
      var top = itemsRect.top + box.top;
      var hitsDesc = left < textLimit - 1 && top < descBottom - 1;
      var hitsPrice = left < priceBox.right - 1 && top < priceBox.bottom - 1;
      return hitsDesc || hitsPrice;
    }

    var placed = fit(descTop);
    if (!placed || coversText(placed)) placed = fit(descBottom + 6);
    if (!placed) return;
    var top = placed.top;
    var width = placed.width;
    var nextWidth = Math.round(width) + "px";
    var nextTop = Math.round(top) + "px";
    if (photo.style.width !== nextWidth) photo.style.width = nextWidth;
    if (photo.style.top !== nextTop) photo.style.top = nextTop;
  }

  placeYuzu();
  window.addEventListener("resize", placeYuzu);
  if (typeof wideQuery.addEventListener === "function") {
    wideQuery.addEventListener("change", placeYuzu);
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(placeYuzu);
  }
  var yuzuImg = document.querySelector(".yuzu-photo img");
  if (yuzuImg && !yuzuImg.complete) yuzuImg.addEventListener("load", placeYuzu);
  var yuzuSection = document.querySelector(".sans-alcool");
  if (yuzuSection && window.ResizeObserver) {
    new ResizeObserver(placeYuzu).observe(yuzuSection);
  }
}());
