(function () {
  var button = document.querySelector(".download-menu");
  if (!button) return;

  var HTML2CANVAS = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
  var JSPDF = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

  button.addEventListener("click", function () {
    if (button.disabled) return;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    buildPdf().catch(function (error) {
      console.error(error);
      window.alert("Le menu n'a pas pu être téléchargé.");
    }).then(function () {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    });
  });

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) {
        resolve();
        return;
      }
      var script = document.createElement("script");
      script.src = src;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error("Chargement impossible : " + src)); };
      document.head.appendChild(script);
    });
  }

  function buildPdf() {
    var fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
    return Promise.all([
      loadScript(HTML2CANVAS),
      loadScript(JSPDF),
      fontsReady
    ]).then(function () {
      if (typeof window.html2canvas !== "function" || !window.jspdf || !window.jspdf.jsPDF) {
        throw new Error("Bibliothèques PDF indisponibles");
      }
      var stage = document.createElement("div");
      stage.className = "pdf-stage";
      stage.setAttribute("aria-hidden", "true");
      stage.inert = true;
      document.body.appendChild(stage);
      var sheets = [];
      return menuImages().then(function () {
        try {
          sheets = paginate(stage);
        } catch (error) {
          stage.remove();
          throw error;
        }
        placePlatsPhotos(sheets);
        placeYuzuPhoto(sheets);
        resolveSvgColors(stage);
        return rasterize(sheets);
      }).then(function () {
        stage.remove();
      }, function (error) {
        stage.remove();
        throw error;
      });
    });
  }

  function paginate(stage) {
    var page = document.querySelector(".style-page.is-active") || document.querySelector(".style-akebono");
    if (!page) throw new Error("Menu introuvable");
    var header = page.querySelector(".alt-brand");
    var footer = page.querySelector(".site-footer");
    if (!header || !footer) throw new Error("En-tête ou pied de page introuvable");

    var units = collectUnits(page);
    var sheets = [];
    var pageNumber = 0;
    var current = null;
    var currentBand = null;
    var currentSection = null;
    var currentItems = null;
    var currentRow = null;
    var currentPlats = false;

    function startPage(withHeader) {
      pageNumber += 1;
      currentBand = null;
      currentSection = null;
      currentItems = null;
      currentRow = null;

      var sheet = document.createElement("div");
      sheet.className = "pdf-sheet style-akebono";
      if (withHeader) sheet.appendChild(prepareClone(header));

      var body = document.createElement("div");
      body.className = "pdf-sheet-body";
      var menu = document.createElement("div");
      menu.className = "menu-body";
      body.appendChild(menu);
      sheet.appendChild(body);

      var foot = document.createElement("div");
      foot.className = "pdf-sheet-foot";
      foot.appendChild(prepareClone(footer));
      var number = document.createElement("p");
      number.className = "pdf-page-number";
      number.textContent = String(pageNumber);
      foot.appendChild(number);
      sheet.appendChild(foot);

      stage.appendChild(sheet);
      fitBody(sheet);
      sheets.push(sheet);
      current = { sheet: sheet, body: body, menu: menu };
    }

    function addUnit(unit, created) {
      if (unit.kind === "band-head") {
        currentBand = document.createElement("section");
        currentBand.className = "band";
        current.menu.appendChild(currentBand);
        created.push(currentBand);
        currentBand.appendChild(prepareClone(unit.node));
        currentSection = null;
        currentItems = null;
        currentRow = null;
        return;
      }

      if (unit.kind === "section-open") {
        if (!currentBand) {
          currentBand = document.createElement("section");
          currentBand.className = "band pdf-continued";
          current.menu.appendChild(currentBand);
          created.push(currentBand);
        }
        currentPlats = !!unit.plats;
        currentSection = document.createElement("section");
        currentSection.className = "menu-section" + (currentPlats ? " plats" : "");
        currentBand.appendChild(currentSection);
        created.push(currentSection);
        if (unit.head) currentSection.appendChild(prepareClone(unit.head));
        if (unit.note) currentSection.appendChild(prepareClone(unit.note));
        currentItems = document.createElement("div");
        currentItems.className = "items";
        currentSection.appendChild(currentItems);
        created.push(currentItems);
        currentRow = null;
        return;
      }

      if (!currentItems) {
        if (!currentBand) {
          currentBand = document.createElement("section");
          currentBand.className = "band pdf-continued";
          current.menu.appendChild(currentBand);
          created.push(currentBand);
        }
        currentSection = document.createElement("section");
        currentSection.className = "menu-section pdf-continued" + (currentPlats ? " plats" : "");
        currentBand.appendChild(currentSection);
        created.push(currentSection);
        currentItems = document.createElement("div");
        currentItems.className = "items";
        currentSection.appendChild(currentItems);
        created.push(currentItems);
        currentRow = null;
      }

      var keepBeerRow = unit.beer && currentRow && currentRow.classList.contains("beer-row");
      if (!keepBeerRow && (!currentRow || currentRow.children.length >= 2)) {
        currentRow = document.createElement("div");
        currentRow.className = "pdf-row";
        currentItems.appendChild(currentRow);
        created.push(currentRow);
      }
      if (unit.beer) {
        if (!currentRow.classList.contains("beer-row")) {
          currentRow.className = "pdf-row beer-row";
          var left = document.createElement("div");
          left.className = "item-slot beer-items";
          var right = document.createElement("div");
          right.className = "item-slot beer-photo-slot";
          currentRow.appendChild(left);
          currentRow.appendChild(right);
          created.push(left);
          created.push(right);
          fillBeerPhotos(right);
        }
        var beerLeft = currentRow.querySelector(".beer-items");
        var beerItem = prepareClone(unit.node);
        beerLeft.appendChild(beerItem);
        created.push(beerItem);
        sizeBeerPhotos(currentRow);
        return;
      }
      var slot = document.createElement("div");
      slot.className = "item-slot";
      slot.appendChild(prepareClone(unit.node));
      currentRow.appendChild(slot);
      created.push(slot);
    }

    function undo(created) {
      for (var i = created.length - 1; i >= 0; i--) {
        var el = created[i];
        if (el === currentBand) currentBand = null;
        if (el === currentSection) currentSection = null;
        if (el === currentItems) currentItems = null;
        if (el === currentRow) currentRow = null;
        if (el.parentNode) el.parentNode.removeChild(el);
      }
    }

    function overflows() {
      return current.body.scrollHeight > current.body.clientHeight + 1;
    }

    function isEmpty() {
      return current.menu.childElementCount === 0;
    }

    startPage(true);
    var index = 0;
    var guard = 0;
    while (index < units.length && guard < 500) {
      guard += 1;
      var group = groupAt(units, index);
      var created = [];
      group.forEach(function (unit) { addUnit(unit, created); });
      if (!overflows()) {
        index += group.length;
        continue;
      }
      undo(created);
      if (isEmpty()) {
        group.forEach(function (unit) { addUnit(unit, []); });
        index += group.length;
        continue;
      }
      startPage(false);
    }
    if (index < units.length) throw new Error("Pagination incomplète");
    return sheets;
  }

  function groupAt(units, start) {
    var group = [units[start]];
    if (units[start].kind === "item") {
      if (!units[start].beer) return group;
      var beerIndex = start + 1;
      while (beerIndex < units.length && units[beerIndex].kind === "item" && units[beerIndex].beer) {
        group.push(units[beerIndex]);
        beerIndex += 1;
      }
      return group;
    }
    var j = start + 1;
    while (j < units.length && units[j].kind !== "item") {
      group.push(units[j]);
      j += 1;
    }
    if (j < units.length) {
      group.push(units[j]);
      if (units[j].beer) {
        j += 1;
        while (j < units.length && units[j].kind === "item" && units[j].beer) {
          group.push(units[j]);
          j += 1;
        }
      }
    }
    return group;
  }

  function collectUnits(page) {
    var units = [];
    page.querySelectorAll(".menu-body > .band").forEach(function (band) {
      var head = band.querySelector(":scope > .band-head");
      if (head) units.push({ kind: "band-head", node: head });
      band.querySelectorAll(":scope > .menu-section").forEach(function (section) {
        units.push({
          kind: "section-open",
          head: section.querySelector(":scope > .section-head"),
          note: section.querySelector(":scope > .note"),
          plats: section.classList.contains("plats")
        });
        section.querySelectorAll(":scope > .items > .item").forEach(function (item) {
          units.push({
            kind: "item",
            node: item,
            beer: section.classList.contains("bieres")
          });
        });
      });
    });
    return units;
  }

  function prepareClone(node) {
    var copy = node.cloneNode(true);
    copy.removeAttribute("id");
    copy.querySelectorAll("[id]").forEach(function (el) {
      el.removeAttribute("id");
    });
    copyImagesFrom(node, copy);
    inlineSvgUses(copy);
    return copy;
  }

  function copyImagesFrom(source, copy) {
    if (!source.querySelectorAll) return;
    var originals = source.querySelectorAll("img");
    var clones = copy.querySelectorAll("img");
    for (var i = 0; i < clones.length; i++) {
      var original = originals[i];
      if (!original || !original.naturalWidth) continue;
      clones[i].setAttribute("width", String(original.naturalWidth));
      clones[i].setAttribute("height", String(original.naturalHeight));
    }
  }

  function inlineSvgUses(root) {
    var guard = 0;
    while (root.querySelector("use") && guard < 20) {
      guard += 1;
      root.querySelectorAll("use").forEach(function (use) {
        var href = use.getAttribute("href") || use.getAttribute("xlink:href") || "";
        var id = href.indexOf("#") === -1 ? "" : href.slice(href.indexOf("#"));
        var symbol = id ? document.querySelector(id) : null;
        var svg = use.ownerSVGElement;
        if (!symbol) {
          use.remove();
          return;
        }
        if (svg && symbol.getAttribute("viewBox")) {
          svg.setAttribute("viewBox", symbol.getAttribute("viewBox"));
        }
        var fragment = document.createDocumentFragment();
        Array.prototype.forEach.call(symbol.childNodes, function (child) {
          if (child.nodeType === 1) fragment.appendChild(child.cloneNode(true));
        });
        use.parentNode.replaceChild(fragment, use);
      });
    }
  }

  function resolveSvgColors(root) {
    root.querySelectorAll("svg.leaf, svg.gluten").forEach(function (svg) {
      var color = window.getComputedStyle(svg).color;
      svg.querySelectorAll("[fill='currentColor']").forEach(function (el) {
        el.setAttribute("fill", color);
      });
      svg.querySelectorAll("[stroke='currentColor']").forEach(function (el) {
        el.setAttribute("stroke", color);
      });
    });
  }

  function fitBody(sheet) {
    var body = sheet.querySelector(".pdf-sheet-body");
    var foot = sheet.querySelector(".pdf-sheet-foot");
    var sheetRect = sheet.getBoundingClientRect();
    var bodyRect = body.getBoundingClientRect();
    var footRect = foot.getBoundingClientRect();
    var gap = 14;
    var height = footRect.top - gap - bodyRect.top;
    body.style.height = Math.max(0, height) + "px";
    if (footRect.bottom > sheetRect.bottom + 1) {
      body.style.height = Math.max(0, height - (footRect.bottom - sheetRect.bottom)) + "px";
    }
  }

  function menuImages() {
    var nodes = document.querySelectorAll(".plats .plats-photos img, .bieres .beer-photos img, .sans-alcool .yuzu-photo img");
    return Promise.all(Array.prototype.map.call(nodes, function (img) {
      if (img.complete && img.naturalWidth) return Promise.resolve();
      if (img.decode) return img.decode();
      return new Promise(function (resolve, reject) {
        img.addEventListener("load", function () { resolve(); });
        img.addEventListener("error", function () { reject(new Error("Image du menu introuvable")); });
      });
    }));
  }

  function drawFitted(img, width, height) {
    var scale = 2;
    var canvas = document.createElement("canvas");
    var w = Math.max(1, Math.round(width));
    var h = Math.max(1, Math.round(height));
    canvas.width = w * scale;
    canvas.height = h * scale;
    canvas.style.display = "block";
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function fillBeerPhotos(slot) {
    var sources = document.querySelectorAll(".bieres .beer-photos img");
    if (sources.length < 2) return;
    var row = document.createElement("div");
    row.className = "pdf-beer-photos";
    Array.prototype.forEach.call(sources, function (img) {
      var height = 80;
      var width = height * (img.naturalWidth / img.naturalHeight);
      row.appendChild(drawFitted(img, width, height));
    });
    slot.appendChild(row);
  }

  function sizeBeerPhotos(row) {
    var left = row.querySelector(".beer-items");
    var right = row.querySelector(".beer-photo-slot");
    var photos = right && right.querySelector(".pdf-beer-photos");
    var sources = document.querySelectorAll(".bieres .beer-photos img");
    if (!left || !photos || sources.length < 2) return;
    var gap = parseFloat(window.getComputedStyle(photos).gap) || 0;
    var avail = right.clientWidth;
    var height = Math.round(left.getBoundingClientRect().height);
    if (height < 1 || avail < 1) return;
    function widthsFor(nextHeight) {
      return Array.prototype.map.call(sources, function (img) {
        return nextHeight * (img.naturalWidth / img.naturalHeight);
      });
    }
    var widths = widthsFor(height);
    var contentWidth = widths.reduce(function (sum, itemWidth) { return sum + itemWidth; }, 0);
    var total = contentWidth + gap * (sources.length - 1);
    if (total > avail && contentWidth > 0) {
      height = Math.floor(height * ((avail - gap * (sources.length - 1)) / contentWidth));
      widths = widthsFor(height);
    }
    if (height < 1) return;
    var next = document.createElement("div");
    next.className = "pdf-beer-photos";
    Array.prototype.forEach.call(sources, function (img, index) {
      next.appendChild(drawFitted(img, widths[index], height));
    });
    photos.replaceWith(next);
  }

  function coverCrop(img, width, height) {
    var scale = 2;
    var canvas = document.createElement("canvas");
    var w = Math.max(1, Math.round(width));
    var h = Math.max(1, Math.round(height));
    canvas.width = w * scale;
    canvas.height = h * scale;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = h + "px";
    var ctx = canvas.getContext("2d");
    var nw = img.naturalWidth;
    var nh = img.naturalHeight;
    var sourceRatio = nw / nh;
    var targetRatio = w / h;
    var sx = 0;
    var sy = 0;
    var sw = nw;
    var sh = nh;
    if (sourceRatio > targetRatio) {
      sw = nh * targetRatio;
      sx = (nw - sw) / 2;
    } else {
      sh = nw / targetRatio;
      sy = (nh - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function nextBlock(section) {
    var sibling = section.nextElementSibling;
    if (sibling) return sibling;
    var parent = section.parentElement;
    while (parent && !parent.classList.contains("menu-body")) {
      if (parent.nextElementSibling) return parent.nextElementSibling;
      parent = parent.parentElement;
    }
    return null;
  }

  function placePlatsPhotos(sheets) {
    var source = document.querySelector(".plats .plats-photos");
    if (!source) return;
    var sources = source.querySelectorAll("img");
    if (sources.length < 2 || !sources[0].naturalWidth || !sources[1].naturalWidth) return;

    var target = null;
    sheets.forEach(function (sheet) {
      if (sheet.querySelector(".menu-section.plats .items .item")) target = sheet;
    });
    if (!target) return;

    var sections = target.querySelectorAll(".menu-section.plats");
    var section = sections[sections.length - 1];
    var items = section && section.querySelector(".items");
    var body = target.querySelector(".pdf-sheet-body");
    if (!items || !body) return;

    var limit = body.getBoundingClientRect().bottom;
    var next = nextBlock(section);
    if (next) {
      var nextTop = next.getBoundingClientRect().top;
      if (nextTop < limit) limit = nextTop;
    }

    var bottoms = [0, 1].map(function (side) {
      var bottom = 0;
      items.querySelectorAll(":scope > .pdf-row > .item-slot").forEach(function (slot, index) {
        if (index % 2 !== side) return;
        var item = slot.querySelector(".item");
        if (!item) return;
        var edge = item.getBoundingClientRect().bottom;
        if (edge > bottom) bottom = edge;
      });
      return bottom;
    }).filter(function (bottom) { return bottom > 0; });
    if (!bottoms.length) return;

    var contentBottom = bottoms[0];
    bottoms.forEach(function (bottom) {
      if (bottom > contentBottom) contentBottom = bottom;
    });

    var captions = ["Mapo tofu", "Udon au kakiage"];
    var row = document.createElement("div");
    row.className = "pdf-row pdf-plats-photos";
    var figures = [];
    captions.forEach(function (text) {
      var slot = document.createElement("div");
      slot.className = "item-slot";
      var figure = document.createElement("figure");
      var caption = document.createElement("figcaption");
      caption.textContent = text;
      figure.appendChild(caption);
      slot.appendChild(figure);
      row.appendChild(slot);
      figures.push(figure);
    });
    items.appendChild(row);

    var rowMargin = parseFloat(window.getComputedStyle(row).marginTop) || 0;
    var captionGap = parseFloat(window.getComputedStyle(figures[0].querySelector("figcaption")).marginTop) || 0;
    var captionHeight = 0;
    figures.forEach(function (figure) {
      var height = figure.querySelector("figcaption").offsetHeight;
      if (height > captionHeight) captionHeight = height;
    });

    function paint(imageHeight) {
      figures.forEach(function (figure, index) {
        var existing = figure.querySelector("canvas");
        var canvas = coverCrop(sources[index], figure.clientWidth, imageHeight);
        if (existing) figure.replaceChild(canvas, existing);
        else figure.insertBefore(canvas, figure.firstChild);
      });
    }

    var safety = 2;
    var imageHeight = Math.floor(limit - contentBottom - rowMargin - captionGap - captionHeight - safety);
    if (imageHeight < 36) {
      row.remove();
      return;
    }
    paint(imageHeight);

    var overflow = body.scrollHeight - body.clientHeight;
    if (overflow > 1) {
      imageHeight = Math.floor(imageHeight - overflow);
      if (imageHeight < 36) {
        row.remove();
        return;
      }
      paint(imageHeight);
    }
  }

  function placeYuzuPhoto(sheets) {
    var source = document.querySelector(".sans-alcool .yuzu-photo img");
    if (!source || !source.naturalWidth) return;
    var aspect = source.naturalHeight / source.naturalWidth;
    var yuzu = null;
    var target = null;
    sheets.forEach(function (sheet) {
      var found = sheet.querySelector(".item-yuzu");
      if (found) {
        yuzu = found;
        target = sheet;
      }
    });
    if (!yuzu || !target) return;

    var yuzuRow = yuzu.closest(".pdf-row");
    var items = yuzu.closest(".items");
    var body = target.querySelector(".pdf-sheet-body");
    var menu = body && body.querySelector(".menu-body");
    if (!yuzuRow || !items || !body || !menu) return;

    var row = yuzuRow.nextElementSibling;
    if (!row || !row.classList.contains("pdf-row") || row.parentNode !== items) {
      row = document.createElement("div");
      row.className = "pdf-row";
      var spacer = document.createElement("div");
      spacer.className = "item-slot";
      row.appendChild(spacer);
      items.appendChild(row);
    }
    if (row.querySelector(".yuzu-photo-slot")) return;
    var slot = document.createElement("div");
    slot.className = "item-slot yuzu-photo-slot";
    row.appendChild(slot);

    var slack = body.clientHeight - menu.offsetHeight;
    var room = row.offsetHeight + Math.max(0, slack) - 8;
    var maxWidth = slot.clientWidth;
    if (maxWidth < 36 || room < 48) {
      slot.remove();
      return;
    }

    var height = Math.min(room, maxWidth * aspect) * 2 / 3;
    var width = height / aspect;

    function paint(nextWidth, nextHeight) {
      var existing = slot.querySelector("canvas");
      var canvas = drawFitted(source, nextWidth, nextHeight);
      canvas.className = "pdf-yuzu-photo";
      if (existing) slot.replaceChild(canvas, existing);
      else slot.appendChild(canvas);
    }

    paint(width, height);
    var guard = 0;
    while (body.scrollHeight > body.clientHeight + 1 && height > 48 && guard < 8) {
      var overflow = body.scrollHeight - body.clientHeight;
      height = Math.max(48, height - overflow - 1);
      width = height / aspect;
      if (width > maxWidth) {
        width = maxWidth;
        height = width * aspect;
      }
      paint(width, height);
      guard += 1;
    }
    if (body.scrollHeight > body.clientHeight + 1) slot.remove();
  }

  function createDocument() {
    var JsPDF = window.jspdf.jsPDF;
    var pdf = new JsPDF({
      orientation: "portrait",
      unit: "in",
      format: "letter"
    });
    var width = pdf.internal.pageSize.getWidth();
    var height = pdf.internal.pageSize.getHeight();
    if (Math.abs(width - 8.5) > 0.05 || Math.abs(height - 11) > 0.05) {
      throw new Error("Format de page inattendu : " + width + " x " + height);
    }
    return pdf;
  }

  function rasterize(sheets) {
    var pdf = createDocument();
    var width = pdf.internal.pageSize.getWidth();
    var height = pdf.internal.pageSize.getHeight();
    var chain = Promise.resolve();
    sheets.forEach(function (sheet, index) {
      chain = chain.then(function () {
        sheets.forEach(function (other, otherIndex) {
          other.hidden = otherIndex !== index;
        });
        return window.html2canvas(sheet, {
          scale: 2,
          backgroundColor: "#000000",
          useCORS: true,
          logging: false,
          width: sheet.offsetWidth,
          height: sheet.offsetHeight
        }).then(function (canvas) {
          if (index > 0) pdf.addPage();
          pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, width, height);
        });
      });
    });
    return chain.then(function () {
      pdf.save("hachi-maru-hachi-menu.pdf");
    });
  }
}());
