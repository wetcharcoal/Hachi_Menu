(function () {
  var button = document.querySelector(".download-menu");
  if (!button) return;

  var HTML2CANVAS = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
  var JSPDF = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

  var choosing = false;

  button.addEventListener("click", function () {
    if (button.disabled || choosing) return;
    choosing = true;
    chooseVariant().then(function (variant) {
      choosing = false;
      if (!variant) return;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      buildPdf(variant).catch(function (error) {
        console.error(error);
        window.alert("Le menu n'a pas pu être téléchargé.");
      }).then(function () {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      });
    }, function (error) {
      choosing = false;
      console.error(error);
    });
  });

  function chooseVariant() {
    var root = document.querySelector(".menu-choice");
    var panel = root && root.querySelector(".menu-choice-panel");
    if (!root || !panel) return Promise.reject(new Error("Choix du menu introuvable"));
    var buttons = Array.prototype.slice.call(panel.querySelectorAll("button"));
    var track = document.querySelector(".style-track");
    return new Promise(function (resolve) {
      var done = false;
      function finish(value) {
        if (done) return;
        done = true;
        document.removeEventListener("keydown", onKey);
        root.removeEventListener("click", onBackdrop);
        buttons.forEach(function (choice) {
          choice.removeEventListener("click", onChoice);
        });
        if (track) track.inert = false;
        root.hidden = true;
        button.focus();
        resolve(value);
      }
      function onChoice(event) {
        finish(event.currentTarget.getAttribute("data-menu-variant"));
      }
      function onBackdrop(event) {
        if (event.target === root) finish(null);
      }
      function onKey(event) {
        if (event.key === "Escape") {
          event.preventDefault();
          finish(null);
          return;
        }
        if (event.key !== "Tab" || !buttons.length) return;
        var first = buttons[0];
        var last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
      buttons.forEach(function (choice) {
        choice.addEventListener("click", onChoice);
      });
      root.addEventListener("click", onBackdrop);
      document.addEventListener("keydown", onKey);
      if (track) track.inert = true;
      root.hidden = false;
      buttons[0].focus();
    });
  }

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

  function filenameFor(variant) {
    if (variant === "condensed") return "hachi-maru-hachi-menu-condensed.pdf";
    if (variant === "column") return "hachi-maru-hachi-menu-column.pdf";
    if (variant === "condensed-light") return "hachi-maru-hachi-menu-condensed-light.pdf";
    if (variant === "condensed-light-text") return "hachi-maru-hachi-menu-condensed-light-text.pdf";
    return "hachi-maru-hachi-menu.pdf";
  }

  function buildPdf(variant) {
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
      var ready = menuImages();
      if (variant === "column") ready = Promise.all([ready, loadImage("assets/ume.png")]);
      var light = variant === "condensed-light" || variant === "condensed-light-text";
      if (light) {
        var lightImages = [ready, loadImage("assets/logo_black.png")];
        if (variant === "condensed-light") {
          lightImages.push(
            loadImage("assets/karaage_black.png"),
            loadImage("assets/mapo_black.png"),
            loadImage("assets/udon_black.png"),
            loadImage("assets/sans_black.png")
          );
        }
        ready = Promise.all(lightImages);
      }
      return ready.then(function (loaded) {
        var ume = variant === "column" ? loaded[1] : null;
        var swaps = null;
        if (light) {
          swaps = { "assets/logo.png": loaded[1] };
          if (variant === "condensed-light") {
            swaps["assets/karaage.png"] = loaded[2];
            swaps["assets/Mapo.png"] = loaded[3];
            swaps["assets/Udon.png"] = loaded[4];
            swaps["assets/sans.png"] = loaded[5];
          }
        }
        var sheets = [];
        try {
          sheets = variant === "expanded" ? paginate(stage) : paginateFitting(stage, variant, ume, swaps);
        } catch (error) {
          stage.remove();
          throw error;
        }
        resolveSvgColors(stage);
        return rasterize(sheets, filenameFor(variant), light ? "#ffffff" : "#4d544d");
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

    function slotInnerWidth(slot) {
      var style = window.getComputedStyle(slot);
      var pad = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      return Math.max(1, slot.clientWidth - pad);
    }

    function captionChrome(figure) {
      var caption = figure.querySelector("figcaption");
      if (!caption) return 0;
      var gap = parseFloat(window.getComputedStyle(caption).marginTop) || 0;
      return caption.offsetHeight + gap;
    }

    function containedSize(img, maxWidth, maxHeight) {
      var aspect = img.naturalWidth / img.naturalHeight;
      var width = Math.max(1, maxWidth);
      var height = width / aspect;
      if (maxHeight && height > maxHeight) {
        height = maxHeight;
        width = height * aspect;
      }
      return {
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height))
      };
    }

    function paintFigure(figure, img, size, className) {
      var canvas = drawFitted(img, size.width, size.height);
      canvas.className = className;
      var existing = figure.querySelector("canvas");
      if (existing) figure.replaceChild(canvas, existing);
      else figure.insertBefore(canvas, figure.firstChild);
    }

    function photoPageOnly() {
      if (!current.menu || current.menu.childElementCount !== 1) return false;
      var band = current.menu.firstElementChild;
      if (!currentBand || band !== currentBand) return false;
      return currentBand.querySelectorAll(".item").length === 0;
    }

    function layoutPhoto(apply, preferred, floor) {
      var height = Math.max(1, Math.floor(preferred));
      var minHeight = Math.max(1, Math.floor(floor));
      apply(height);
      var guard = 0;
      while (overflows() && guard < 8) {
        var overflow = current.body.scrollHeight - current.body.clientHeight;
        var next = Math.floor(height - overflow - 2);
        if (next < minHeight) {
          if (height !== minHeight) apply(minHeight);
          break;
        }
        height = next;
        apply(height);
        guard += 1;
      }
      if (!overflows() || !photoPageOnly()) return;
      guard = 0;
      while (overflows() && height > 48 && guard < 12) {
        var extra = current.body.scrollHeight - current.body.clientHeight;
        var squeezed = Math.floor(height - extra - 2);
        if (squeezed >= height) squeezed = height - 8;
        height = Math.max(48, squeezed);
        apply(height);
        guard += 1;
      }
    }

    function ensurePhotoSection(unit, created) {
      if (currentItems) return;
      if (!currentBand) {
        currentBand = document.createElement("section");
        currentBand.className = "band pdf-continued";
        current.menu.appendChild(currentBand);
        created.push(currentBand);
      }
      currentSection = document.createElement("section");
      currentSection.className = "menu-section " + unit.sectionName + " pdf-continued";
      currentBand.appendChild(currentSection);
      created.push(currentSection);
      if (unit.head) {
        var head = prepareClone(unit.head);
        currentSection.appendChild(head);
        created.push(head);
      }
      currentItems = document.createElement("div");
      currentItems.className = "items";
      currentSection.appendChild(currentItems);
      created.push(currentItems);
      currentRow = null;
    }

    function appendFigure(slot, captionText) {
      var figure = document.createElement("figure");
      var caption = document.createElement("figcaption");
      caption.textContent = captionText;
      figure.appendChild(caption);
      slot.appendChild(figure);
      return figure;
    }

    function openPhotoRow(className, created) {
      var row = document.createElement("div");
      row.className = className;
      currentItems.appendChild(row);
      created.push(row);
      currentRow = row;
      return row;
    }

    function addMisoPhoto(unit, created) {
      var source = document.querySelector(".soupe .miso-photo img");
      if (!source || !source.naturalWidth) return;
      ensurePhotoSection(unit, created);

      var riz = current.sheet.querySelector(".item-riz");
      var rizRow = riz && riz.closest(".pdf-row");
      var beside = !!(rizRow && rizRow.parentNode === currentItems && rizRow.children.length === 1);
      var row = beside ? rizRow : openPhotoRow("pdf-row pdf-miso-photos", created);
      if (!beside) {
        var spacer = document.createElement("div");
        spacer.className = "item-slot";
        row.appendChild(spacer);
        created.push(spacer);
      }
      var slot = document.createElement("div");
      slot.className = "item-slot miso-photo-slot";
      row.appendChild(slot);
      created.push(slot);

      function apply(maxImageHeight) {
        var size = containedSize(source, slotInnerWidth(slot), maxImageHeight);
        var canvas = drawFitted(source, size.width, size.height);
        canvas.className = "pdf-miso-photo";
        var existing = slot.querySelector("canvas");
        if (existing) slot.replaceChild(canvas, existing);
        else slot.appendChild(canvas);
      }

      layoutPhoto(apply, 97, 72);
    }

    function addKaraagePhoto(unit, created) {
      var source = document.querySelector(".accompagnements .karaage-photo img");
      if (!source || !source.naturalWidth) return;
      ensurePhotoSection(unit, created);

      var rows = currentItems.querySelectorAll(":scope > .pdf-row");
      var last = rows.length ? rows[rows.length - 1] : null;
      var share = !!(last && last.children.length === 1 && last.querySelector(".item"));
      var row = share ? last : openPhotoRow("pdf-row pdf-karaage-photos", created);
      if (!share) {
        var spacer = document.createElement("div");
        spacer.className = "item-slot";
        row.appendChild(spacer);
        created.push(spacer);
      }
      var slot = document.createElement("div");
      slot.className = "item-slot karaage-photo-slot";
      row.appendChild(slot);
      created.push(slot);
      var figure = appendFigure(slot, "Poulet karaage");

      function apply(maxImageHeight) {
        var size = containedSize(source, slotInnerWidth(slot), maxImageHeight);
        paintFigure(figure, source, size, "pdf-karaage-photo");
      }

      var full = slotInnerWidth(slot) / (source.naturalWidth / source.naturalHeight);
      var preferred = full * 2 / 3;
      layoutPhoto(apply, preferred, Math.max(64, preferred * 0.85));
    }

    function addPlatsPhotos(unit, created) {
      var sources = document.querySelectorAll(".plats .plats-photos img");
      if (sources.length < 2 || !sources[0].naturalWidth || !sources[1].naturalWidth) return;
      ensurePhotoSection(unit, created);

      var row = openPhotoRow("pdf-row pdf-plats-photos", created);
      var captions = ["Mapo tofu", "Udon au kakiage"];
      var figures = [];
      var slots = [];
      captions.forEach(function (text) {
        var slot = document.createElement("div");
        slot.className = "item-slot";
        row.appendChild(slot);
        created.push(slot);
        slots.push(slot);
        figures.push(appendFigure(slot, text));
      });

      function apply(maxImageHeight) {
        figures.forEach(function (figure, index) {
          var size = containedSize(sources[index], slotInnerWidth(slots[index]), maxImageHeight);
          paintFigure(figure, sources[index], size, "pdf-plats-photo");
        });
      }

      var full = slotInnerWidth(slots[0]) / (sources[0].naturalWidth / sources[0].naturalHeight);
      var preferred = full * 2 / 3;
      layoutPhoto(apply, preferred, Math.max(64, preferred * 0.85));
    }

    function addSoftDrinks(unit, created) {
      if (!currentItems) return;
      var row = document.createElement("div");
      row.className = "pdf-row pdf-soft-row";
      currentItems.appendChild(row);
      created.push(row);
      currentRow = row;

      var left = document.createElement("div");
      left.className = "item-slot soft-items";
      unit.nodes.forEach(function (node) {
        left.appendChild(prepareClone(node));
      });
      row.appendChild(left);
      created.push(left);

      var right = document.createElement("div");
      right.className = "item-slot yuzu-photo-slot";
      row.appendChild(right);
      created.push(right);

      var source = document.querySelector(".sans-alcool .yuzu-photo img");
      if (!source || !source.naturalWidth) return;
      var aspect = source.naturalWidth / source.naturalHeight;
      var height = (slotInnerWidth(right) / aspect) * 0.75;
      var width = height * aspect;
      var canvas = drawFitted(source, width, height);
      canvas.className = "pdf-yuzu-photo";
      right.appendChild(canvas);
    }

    function addPhotoUnit(unit, created) {
      if (unit.photo === "miso") addMisoPhoto(unit, created);
      else if (unit.photo === "karaage") addKaraagePhoto(unit, created);
      else if (unit.photo === "plats") addPlatsPhotos(unit, created);
    }

    function addUnit(unit, created) {
      if (unit.kind === "soft-drinks") {
        addSoftDrinks(unit, created);
        return;
      }
      if (unit.kind === "photo") {
        addPhotoUnit(unit, created);
        return;
      }
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
    if (units[start].kind === "photo" || units[start].kind === "soft-drinks") return group;
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
    while (j < units.length && units[j].kind !== "item" && units[j].kind !== "soft-drinks" && units[j].kind !== "photo") {
      group.push(units[j]);
      j += 1;
    }
    if (j < units.length && (units[j].kind === "soft-drinks" || units[j].kind === "photo")) {
      group.push(units[j]);
      return group;
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
        if (section.classList.contains("sans-alcool")) {
          var drinkNodes = [];
          section.querySelectorAll(":scope > .items > .item").forEach(function (item) {
            drinkNodes.push(item);
          });
          units.push({ kind: "soft-drinks", nodes: drinkNodes });
        } else {
          section.querySelectorAll(":scope > .items > .item").forEach(function (item) {
            units.push({
              kind: "item",
              node: item,
              beer: section.classList.contains("bieres")
            });
          });
        }
        var photo = "";
        var sectionName = "";
        if (section.classList.contains("soupe") && section.querySelector(".miso-photo img")) {
          photo = "miso";
          sectionName = "soupe";
        } else if (section.classList.contains("accompagnements") && section.querySelector(".karaage-photo img")) {
          photo = "karaage";
          sectionName = "accompagnements";
        } else if (section.classList.contains("plats") && section.querySelector(".plats-photos img")) {
          photo = "plats";
          sectionName = "plats";
        }
        if (photo) {
          units.push({
            kind: "photo",
            photo: photo,
            sectionName: sectionName,
            head: section.querySelector(":scope > .section-head")
          });
        }
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
    var nodes = document.querySelectorAll(".plats .plats-photos img, .bieres .beer-photos img, .sans-alcool .yuzu-photo img, .soupe .miso-photo img, .accompagnements .karaage-photo img");
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

  function rasterize(sheets, filename, backgroundColor) {
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
          backgroundColor: backgroundColor || "#4d544d",
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
      pdf.save(filename || "hachi-maru-hachi-menu.pdf");
    });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("Image du menu introuvable")); };
      img.src = src;
      if (img.complete && img.naturalWidth) resolve(img);
    });
  }

  function fitCompactBody(sheet) {
    var body = sheet.querySelector(".pdf-sheet-body");
    var foot = sheet.querySelector(".pdf-sheet-foot");
    var sheetRect = sheet.getBoundingClientRect();
    var bodyRect = body.getBoundingClientRect();
    if (!foot) {
      var padBottom = parseFloat(window.getComputedStyle(sheet).paddingBottom) || 0;
      body.style.height = Math.max(0, sheetRect.bottom - padBottom - bodyRect.top) + "px";
      return;
    }
    var footRect = foot.getBoundingClientRect();
    var gap = 14;
    var height = footRect.top - gap - bodyRect.top;
    body.style.height = Math.max(0, height) + "px";
    if (footRect.bottom > sheetRect.bottom + 1) {
      body.style.height = Math.max(0, height - (footRect.bottom - sheetRect.bottom)) + "px";
    }
  }

  function compactHeader(header, swaps) {
    var brand = document.createElement("header");
    brand.className = "alt-brand pdf-compact-brand";
    var logo = header.querySelector(".alt-logo");
    var logoCopy = logo.cloneNode(true);
    var replacement = swaps && swaps[logo.getAttribute("src")];
    if (replacement) {
      logoCopy.src = replacement.src;
      logoCopy.setAttribute("width", String(replacement.naturalWidth));
      logoCopy.setAttribute("height", String(replacement.naturalHeight));
    } else if (logo.naturalWidth) {
      logoCopy.setAttribute("width", String(logo.naturalWidth));
      logoCopy.setAttribute("height", String(logo.naturalHeight));
    }
    var contact = document.createElement("div");
    contact.className = "pdf-brand-contact";
    contact.appendChild(prepareClone(header.querySelector(".alt-address")));
    contact.appendChild(prepareClone(header.querySelector(".alt-phone")));
    brand.appendChild(logoCopy);
    brand.appendChild(contact);
    return brand;
  }

  function appendCompactFoot(sheet, footer, pageNumber) {
    var foot = document.createElement("div");
    foot.className = "pdf-sheet-foot";
    foot.appendChild(prepareClone(footer));
    var number = document.createElement("p");
    number.className = "pdf-page-number";
    number.textContent = String(pageNumber);
    foot.appendChild(number);
    sheet.appendChild(foot);
  }

  function compactSteps() {
    return [
      { text: 0.96, bullets: true, imageScale: 0.78 },
      { text: 0.92, bullets: true, imageScale: 0.78 },
      { text: 0.88, bullets: true, imageScale: 0.78 },
      { text: 0.88, bullets: false, imageScale: 0.78 },
      { text: 0.84, bullets: false, imageScale: 0.62 },
      { text: 0.8, bullets: false, imageScale: 0.52 }
    ];
  }

  function foodOnFirstPage(sheets) {
    var page = sheets[0];
    if (!page) return false;
    var text = page.textContent || "";
    return text.indexOf("SOUPE ET SUPPLÉMENT") !== -1
      && text.indexOf("ACCOMPAGNEMENTS") !== -1
      && text.indexOf("PLATS PRINCIPAUX") !== -1
      && text.indexOf("Oyakodon") !== -1;
  }

  function paginateFitting(stage, variant, ume, swaps) {
    var steps = compactSteps();
    var logoWidths = ["2.15in", "1.85in", "1.6in", "1.4in", "1.2in"];
    var textOnly = variant === "condensed-light-text";
    var sheets = [];
    for (var step = 0; step < steps.length; step += 1) {
      var widthCount = textOnly ? logoWidths.length : 1;
      for (var widthIndex = 0; widthIndex < widthCount; widthIndex += 1) {
        while (stage.firstChild) stage.removeChild(stage.firstChild);
        var stepOptions = {
          text: steps[step].text,
          bullets: steps[step].bullets,
          imageScale: steps[step].imageScale,
          logoWidth: logoWidths[widthIndex]
        };
        sheets = variant === "column"
          ? paginateColumn(stage, steps[step], ume)
          : paginateCompact(stage, textOnly ? stepOptions : steps[step], swaps, textOnly);
        if (textOnly) {
          if (sheets.length <= 2 && foodOnFirstPage(sheets)) {
            assertCompactImages(sheets, variant);
            return sheets;
          }
        } else if (sheets.length <= 2) {
          assertCompactImages(sheets, variant);
          return sheets;
        }
      }
    }
    assertCompactImages(sheets, variant);
    return sheets;
  }

  function assertCompactImages(sheets, variant) {
    if (variant === "condensed-light-text") {
      var photos = sheets.reduce(function (sum, sheet) {
        return sum + sheet.querySelectorAll(".pdf-miso-photo, .pdf-karaage-photo, .pdf-plats-photo, .pdf-beer-photo, .pdf-sans-photo, .pdf-ume-photo").length;
      }, 0);
      if (photos !== 0) throw new Error("Image inattendue");
      var logo = sheets[0] && sheets[0].querySelector(".alt-logo");
      var logoSrc = logo ? (logo.getAttribute("src") || "") : "";
      if (logoSrc.indexOf("logo_black.png") === -1) throw new Error("Logo manquant");
      return;
    }
    var expect = {
      ".pdf-miso-photo": 1,
      ".pdf-karaage-photo": 1,
      ".pdf-plats-photo": 2,
      ".pdf-beer-photo": 2
    };
    expect[variant === "column" ? ".pdf-ume-photo" : ".pdf-sans-photo"] = 1;
    Object.keys(expect).forEach(function (selector) {
      var found = sheets.reduce(function (sum, sheet) {
        return sum + sheet.querySelectorAll(selector).length;
      }, 0);
      if (found !== expect[selector]) {
        throw new Error("Image manquante (" + selector + " : " + found + ")");
      }
    });
  }

  function containedSizeOf(img, maxWidth, maxHeight) {
    var aspect = img.naturalWidth / img.naturalHeight;
    var width = Math.max(1, maxWidth);
    var height = width / aspect;
    if (maxHeight && height > maxHeight) {
      height = maxHeight;
      width = height * aspect;
    }
    return {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height))
    };
  }

  function slotInnerWidthOf(slot) {
    var style = window.getComputedStyle(slot);
    var pad = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    return Math.max(1, slot.clientWidth - pad);
  }

  function paginateCompact(stage, options, swaps, omitPhotos) {
    var page = document.querySelector(".style-page.is-active") || document.querySelector(".style-akebono");
    if (!page) throw new Error("Menu introuvable");
    var header = page.querySelector(".alt-brand");
    var footer = page.querySelector(".site-footer");
    if (!header || !footer) throw new Error("En-tête ou pied de page introuvable");

    var imageScale = options.imageScale;

    function photoSource(img) {
      if (!img) return img;
      var src = img.getAttribute("src");
      if (swaps && src && swaps[src]) return swaps[src];
      return img;
    }
    var units = collectUnits(page);
    var sheets = [];
    var pageNumber = 0;
    var current = null;
    var currentBand = null;
    var currentSection = null;
    var currentItems = null;
    var currentRow = null;
    var currentPlats = false;

    function textHeader(logoWidth, withLegend) {
      var brand = document.createElement("header");
      brand.className = "alt-brand pdf-compact-brand pdf-text-brand";
      if (!withLegend) brand.classList.add("pdf-text-follow");
      var logo = header.querySelector(".alt-logo");
      var logoCopy = logo.cloneNode(true);
      var replacement = swaps && swaps[logo.getAttribute("src")];
      if (replacement) {
        logoCopy.src = replacement.src;
        logoCopy.setAttribute("width", String(replacement.naturalWidth));
        logoCopy.setAttribute("height", String(replacement.naturalHeight));
      } else if (logo.naturalWidth) {
        logoCopy.setAttribute("width", String(logo.naturalWidth));
        logoCopy.setAttribute("height", String(logo.naturalHeight));
      }
      if (logoWidth) logoCopy.style.width = logoWidth;
      brand.appendChild(logoCopy);
      if (withLegend) {
        var legend = prepareClone(page.querySelector(".band-legend"));
        legend.classList.add("pdf-header-legend");
        brand.appendChild(legend);
      }
      return brand;
    }

    function startPage(withHeader) {
      pageNumber += 1;
      currentBand = null;
      currentSection = null;
      currentItems = null;
      currentRow = null;

      var sheet = document.createElement("div");
      sheet.className = "pdf-sheet style-akebono pdf-compact";
      if (swaps) sheet.classList.add("pdf-light");
      if (omitPhotos) sheet.classList.add("pdf-text");
      if (!options.bullets) sheet.classList.add("pdf-no-bullets");
      sheet.style.setProperty("--text", String(options.text));
      if (omitPhotos) {
        sheet.appendChild(textHeader(options.logoWidth, pageNumber === 1));
      } else if (withHeader) {
        sheet.appendChild(compactHeader(header, swaps));
      }

      var body = document.createElement("div");
      body.className = "pdf-sheet-body";
      var menu = document.createElement("div");
      menu.className = "menu-body";
      body.appendChild(menu);
      sheet.appendChild(body);

      if (pageNumber > 1) appendCompactFoot(sheet, footer, pageNumber);

      stage.appendChild(sheet);
      fitCompactBody(sheet);
      sheets.push(sheet);
      current = { sheet: sheet, body: body, menu: menu };
    }

    function paintFigure(figure, img, size, className) {
      var canvas = drawFitted(img, size.width, size.height);
      canvas.className = className;
      var existing = figure.querySelector("canvas");
      if (existing) figure.replaceChild(canvas, existing);
      else figure.insertBefore(canvas, figure.firstChild);
    }

    function photoPageOnly() {
      if (!current.menu || current.menu.childElementCount !== 1) return false;
      var band = current.menu.firstElementChild;
      if (!currentBand || band !== currentBand) return false;
      return currentBand.querySelectorAll(".item").length === 0;
    }

    function overflows() {
      return current.body.scrollHeight > current.body.clientHeight + 1;
    }

    function layoutPhoto(apply, preferred, floor) {
      var height = Math.max(1, Math.floor(preferred));
      var minHeight = Math.max(1, Math.floor(floor));
      apply(height);
      var guard = 0;
      while (overflows() && guard < 8) {
        var overflow = current.body.scrollHeight - current.body.clientHeight;
        var next = Math.floor(height - overflow - 2);
        if (next < minHeight) {
          if (height !== minHeight) apply(minHeight);
          break;
        }
        height = next;
        apply(height);
        guard += 1;
      }
      if (!overflows() || !photoPageOnly()) return;
      guard = 0;
      while (overflows() && height > 48 && guard < 12) {
        var extra = current.body.scrollHeight - current.body.clientHeight;
        var squeezed = Math.floor(height - extra - 2);
        if (squeezed >= height) squeezed = height - 8;
        height = Math.max(48, squeezed);
        apply(height);
        guard += 1;
      }
    }

    function ensurePhotoSection(unit, created) {
      if (currentItems) return;
      if (!currentBand) {
        currentBand = document.createElement("section");
        currentBand.className = "band pdf-continued";
        current.menu.appendChild(currentBand);
        created.push(currentBand);
      }
      currentSection = document.createElement("section");
      currentSection.className = "menu-section " + unit.sectionName + " pdf-continued";
      currentBand.appendChild(currentSection);
      created.push(currentSection);
      if (unit.head) {
        var head = prepareClone(unit.head);
        currentSection.appendChild(head);
        created.push(head);
      }
      currentItems = document.createElement("div");
      currentItems.className = "items";
      currentSection.appendChild(currentItems);
      created.push(currentItems);
      currentRow = null;
    }

    function appendFigure(slot, captionText) {
      var figure = document.createElement("figure");
      var caption = document.createElement("figcaption");
      caption.textContent = captionText;
      figure.appendChild(caption);
      slot.appendChild(figure);
      return figure;
    }

    function openPhotoRow(className, created) {
      var row = document.createElement("div");
      row.className = className;
      currentItems.appendChild(row);
      created.push(row);
      currentRow = row;
      return row;
    }

    function requireImage(img) {
      if (!img || !img.naturalWidth) throw new Error("Image du menu introuvable");
      return img;
    }

    function addMisoPhoto(unit, created) {
      var source = requireImage(document.querySelector(".soupe .miso-photo img"));
      ensurePhotoSection(unit, created);

      var riz = current.sheet.querySelector(".item-riz");
      var rizRow = riz && riz.closest(".pdf-row");
      var beside = !!(rizRow && rizRow.parentNode === currentItems && rizRow.children.length === 1);
      var row = beside ? rizRow : openPhotoRow("pdf-row pdf-miso-photos", created);
      if (!beside) {
        var spacer = document.createElement("div");
        spacer.className = "item-slot";
        row.appendChild(spacer);
        created.push(spacer);
      }
      var slot = document.createElement("div");
      slot.className = "item-slot miso-photo-slot";
      row.appendChild(slot);
      created.push(slot);

      function apply(maxImageHeight) {
        var size = containedSizeOf(source, slotInnerWidthOf(slot), maxImageHeight);
        var canvas = drawFitted(source, size.width, size.height);
        canvas.className = "pdf-miso-photo";
        var existing = slot.querySelector("canvas");
        if (existing) slot.replaceChild(canvas, existing);
        else slot.appendChild(canvas);
      }

      layoutPhoto(apply, 97 * imageScale, Math.max(48, 72 * imageScale));
    }

    function addKaraagePhoto(unit, created) {
      var source = requireImage(photoSource(document.querySelector(".accompagnements .karaage-photo img")));
      ensurePhotoSection(unit, created);

      var rows = currentItems.querySelectorAll(":scope > .pdf-row");
      var last = rows.length ? rows[rows.length - 1] : null;
      var share = !!(last && last.children.length === 1 && last.querySelector(".item"));
      var row = share ? last : openPhotoRow("pdf-row pdf-karaage-photos", created);
      if (!share) {
        var spacer = document.createElement("div");
        spacer.className = "item-slot";
        row.appendChild(spacer);
        created.push(spacer);
      }
      var slot = document.createElement("div");
      slot.className = "item-slot karaage-photo-slot";
      row.appendChild(slot);
      created.push(slot);
      var figure = appendFigure(slot, "Poulet karaage");

      function apply(maxImageHeight) {
        var size = containedSizeOf(source, slotInnerWidthOf(slot), maxImageHeight);
        paintFigure(figure, source, size, "pdf-karaage-photo");
      }

      var full = slotInnerWidthOf(slot) / (source.naturalWidth / source.naturalHeight);
      var preferred = full * (2 / 3) * imageScale;
      layoutPhoto(apply, preferred, Math.max(48, preferred * 0.85));
    }

    function addPlatsPhotos(unit, created) {
      var nodes = document.querySelectorAll(".plats .plats-photos img");
      if (nodes.length < 2) throw new Error("Image du menu introuvable");
      var sources = [photoSource(nodes[0]), photoSource(nodes[1])];
      requireImage(sources[0]);
      requireImage(sources[1]);
      ensurePhotoSection(unit, created);

      var row = openPhotoRow("pdf-row pdf-plats-photos", created);
      var captions = ["Mapo tofu", "Udon au kakiage"];
      var figures = [];
      var slots = [];
      captions.forEach(function (text) {
        var slot = document.createElement("div");
        slot.className = "item-slot";
        row.appendChild(slot);
        created.push(slot);
        slots.push(slot);
        figures.push(appendFigure(slot, text));
      });

      function apply(maxImageHeight) {
        figures.forEach(function (figure, index) {
          var size = containedSizeOf(sources[index], slotInnerWidthOf(slots[index]), maxImageHeight);
          paintFigure(figure, sources[index], size, "pdf-plats-photo");
        });
      }

      var full = slotInnerWidthOf(slots[0]) / (sources[0].naturalWidth / sources[0].naturalHeight);
      var preferred = full * (2 / 3) * imageScale;
      layoutPhoto(apply, preferred, Math.max(48, preferred * 0.85));
    }

    function addSoftDrinks(unit, created) {
      if (!currentItems) return;
      var row = document.createElement("div");
      row.className = "pdf-row pdf-soft-row";
      currentItems.appendChild(row);
      created.push(row);
      currentRow = row;

      var left = document.createElement("div");
      left.className = "item-slot soft-items";
      unit.nodes.forEach(function (node) {
        left.appendChild(prepareClone(node));
      });
      row.appendChild(left);
      created.push(left);

      var right = document.createElement("div");
      right.className = "item-slot yuzu-photo-slot pdf-photo-sans";
      row.appendChild(right);
      created.push(right);

      var source = requireImage(photoSource(document.querySelector(".sans-alcool .yuzu-photo img")));
      function applySans(maxImageHeight) {
        var size = containedSizeOf(source, slotInnerWidthOf(right), maxImageHeight);
        var canvas = drawFitted(source, size.width, size.height);
        canvas.className = "pdf-sans-photo";
        var existing = right.querySelector("canvas");
        if (existing) right.replaceChild(canvas, existing);
        else right.appendChild(canvas);
      }
      var full = slotInnerWidthOf(right) / (source.naturalWidth / source.naturalHeight);
      var textHeight = left.getBoundingClientRect().height;
      var height = textHeight > 1 ? Math.min(full, textHeight) : full * 0.75;
      applySans(height);
    }

    function fillCompactBeerPhotos(slot) {
      var sources = document.querySelectorAll(".bieres .beer-photos img");
      if (sources.length < 2) throw new Error("Image du menu introuvable");
      var row = document.createElement("div");
      row.className = "pdf-beer-photos";
      Array.prototype.forEach.call(sources, function (img) {
        requireImage(img);
        var height = Math.round(80 * imageScale);
        var width = height * (img.naturalWidth / img.naturalHeight);
        var canvas = drawFitted(img, width, height);
        canvas.className = "pdf-beer-photo";
        row.appendChild(canvas);
      });
      slot.appendChild(row);
    }

    function sizeCompactBeerPhotos(row) {
      var left = row.querySelector(".beer-items");
      var right = row.querySelector(".beer-photo-slot");
      var photos = right && right.querySelector(".pdf-beer-photos");
      var sources = document.querySelectorAll(".bieres .beer-photos img");
      if (!left || !photos || sources.length < 2) return;
      var gap = parseFloat(window.getComputedStyle(photos).gap) || 0;
      var avail = right.clientWidth;
      if (avail < 1) return;
      function paint(nextHeight) {
        var widths = Array.prototype.map.call(sources, function (img) {
          return nextHeight * (img.naturalWidth / img.naturalHeight);
        });
        var contentWidth = widths.reduce(function (sum, itemWidth) { return sum + itemWidth; }, 0);
        var height = nextHeight;
        if (contentWidth + gap * (sources.length - 1) > avail && contentWidth > 0) {
          height = Math.floor(nextHeight * ((avail - gap * (sources.length - 1)) / contentWidth));
          widths = Array.prototype.map.call(sources, function (img) {
            return height * (img.naturalWidth / img.naturalHeight);
          });
        }
        if (height < 1) return nextHeight;
        var next = document.createElement("div");
        next.className = "pdf-beer-photos";
        Array.prototype.forEach.call(sources, function (img, index) {
          var canvas = drawFitted(img, widths[index], height);
          canvas.className = "pdf-beer-photo";
          next.appendChild(canvas);
        });
        var currentPhotos = right.querySelector(".pdf-beer-photos");
        if (currentPhotos) currentPhotos.replaceWith(next);
        return height;
      }
      var textHeight = Math.round(left.getBoundingClientRect().height);
      if (textHeight < 1) return;
      paint(textHeight);
    }

    function addPhotoUnit(unit, created) {
      if (unit.photo === "miso") addMisoPhoto(unit, created);
      else if (unit.photo === "karaage") addKaraagePhoto(unit, created);
      else if (unit.photo === "plats") addPlatsPhotos(unit, created);
    }

    function addUnit(unit, created) {
      if (unit.kind === "soft-drinks") {
        if (omitPhotos) {
          unit.nodes.forEach(function (node) {
            addUnit({ kind: "item", node: node }, created);
          });
        } else {
          addSoftDrinks(unit, created);
        }
        return;
      }
      if (unit.kind === "photo") {
        if (!omitPhotos) addPhotoUnit(unit, created);
        return;
      }
      if (unit.kind === "band-head") {
        if (omitPhotos) return;
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
      if (unit.beer && !omitPhotos) {
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
          fillCompactBeerPhotos(right);
        }
        var beerLeft = currentRow.querySelector(".beer-items");
        var beerItem = prepareClone(unit.node);
        beerLeft.appendChild(beerItem);
        created.push(beerItem);
        sizeCompactBeerPhotos(currentRow);
        return;
      }
      var slot = document.createElement("div");
      slot.className = "item-slot";
      slot.appendChild(prepareClone(unit.node));
      currentRow.appendChild(slot);
      created.push(slot);
    }

    function undo(created) {
      for (var i = created.length - 1; i >= 0; i -= 1) {
        var el = created[i];
        if (el === currentBand) currentBand = null;
        if (el === currentSection) currentSection = null;
        if (el === currentItems) currentItems = null;
        if (el === currentRow) currentRow = null;
        if (el.parentNode) el.parentNode.removeChild(el);
      }
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

  function unitsForColumn(units) {
    var out = [];
    units.forEach(function (unit, index) {
      if (unit.kind === "soft-drinks") {
        unit.nodes.forEach(function (node) {
          out.push({ kind: "item", node: node, beer: false });
        });
        out.push({ kind: "photo", photo: "ume", sectionName: "sans-alcool" });
        return;
      }
      out.push(unit);
      if (unit.kind === "item" && unit.beer) {
        var next = units[index + 1];
        if (!(next && next.kind === "item" && next.beer)) {
          out.push({ kind: "photo", photo: "beers", sectionName: "bieres" });
        }
      }
    });
    return out;
  }

  function columnGroupAt(units, start) {
    var unit = units[start];
    if (unit.kind === "section-open" && start + 1 < units.length && units[start + 1].kind === "item") {
      return [unit, units[start + 1]];
    }
    return [unit];
  }

  function paginateColumn(stage, options, ume) {
    var page = document.querySelector(".style-page.is-active") || document.querySelector(".style-akebono");
    if (!page) throw new Error("Menu introuvable");
    var header = page.querySelector(".alt-brand");
    var footer = page.querySelector(".site-footer");
    if (!header || !footer) throw new Error("En-tête ou pied de page introuvable");
    if (!ume || !ume.naturalWidth) throw new Error("Image du menu introuvable");

    var imageScale = options.imageScale;
    var units = unitsForColumn(collectUnits(page));
    var sheets = [];
    var pageNumber = 0;
    var sheet = null;
    var body = null;
    var menu = null;
    var columnsWrap = null;
    var cols = [];
    var colIndex = 0;
    var currentCol = null;
    var currentBand = null;
    var currentSection = null;
    var currentItems = null;

    function refreshColumnHeight() {
      var used = 0;
      Array.prototype.forEach.call(menu.children, function (child) {
        if (child === columnsWrap) return;
        var style = window.getComputedStyle(child);
        used += child.offsetHeight
          + (parseFloat(style.marginTop) || 0)
          + (parseFloat(style.marginBottom) || 0);
      });
      var colStyle = window.getComputedStyle(columnsWrap);
      var colMargin = (parseFloat(colStyle.marginTop) || 0) + (parseFloat(colStyle.marginBottom) || 0);
      columnsWrap.style.height = Math.max(40, Math.floor(body.clientHeight - used - colMargin)) + "px";
    }

    function startPage() {
      pageNumber += 1;
      currentBand = null;
      currentSection = null;
      currentItems = null;

      sheet = document.createElement("div");
      sheet.className = "pdf-sheet style-akebono pdf-compact pdf-column";
      if (!options.bullets) sheet.classList.add("pdf-no-bullets");
      sheet.style.setProperty("--text", String(options.text));
      if (pageNumber === 1) sheet.appendChild(compactHeader(header));

      body = document.createElement("div");
      body.className = "pdf-sheet-body";
      menu = document.createElement("div");
      menu.className = "menu-body";
      body.appendChild(menu);
      sheet.appendChild(body);

      columnsWrap = document.createElement("div");
      columnsWrap.className = "pdf-columns";
      cols = [0, 1].map(function () {
        var col = document.createElement("div");
        col.className = "pdf-col";
        columnsWrap.appendChild(col);
        return col;
      });
      menu.appendChild(columnsWrap);
      if (pageNumber > 1) appendCompactFoot(sheet, footer, pageNumber);

      stage.appendChild(sheet);
      fitCompactBody(sheet);
      refreshColumnHeight();
      sheets.push(sheet);
      colIndex = 0;
      currentCol = cols[0];
    }

    function nextColumn() {
      colIndex += 1;
      currentBand = null;
      currentSection = null;
      currentItems = null;
      if (colIndex > 1) {
        startPage();
        return;
      }
      currentCol = cols[colIndex];
    }

    function overflowsCol() {
      return currentCol.scrollHeight > currentCol.clientHeight + 2;
    }

    function columnIsEmpty() {
      return currentCol.childElementCount === 0;
    }

    function ensureItems(created) {
      if (currentItems) return;
      if (!currentBand) {
        currentBand = document.createElement("section");
        currentBand.className = "band pdf-continued";
        currentCol.appendChild(currentBand);
        created.push(currentBand);
      }
      currentSection = document.createElement("section");
      currentSection.className = "menu-section pdf-continued";
      currentBand.appendChild(currentSection);
      created.push(currentSection);
      currentItems = document.createElement("div");
      currentItems.className = "items";
      currentSection.appendChild(currentItems);
      created.push(currentItems);
    }

    function requireImage(img) {
      if (!img || !img.naturalWidth) throw new Error("Image du menu introuvable");
      return img;
    }

    function layoutColumnPhoto(apply, preferred, floor) {
      var height = Math.max(1, Math.floor(preferred));
      var minHeight = Math.max(1, Math.floor(floor));
      apply(height);
      var guard = 0;
      while (overflowsCol() && guard < 8) {
        var overflow = currentCol.scrollHeight - currentCol.clientHeight;
        var next = Math.floor(height - overflow - 2);
        if (next < minHeight) {
          if (height !== minHeight) apply(minHeight);
          break;
        }
        height = next;
        apply(height);
        guard += 1;
      }
      if (!overflowsCol() || currentCol.querySelector(".item")) return;
      guard = 0;
      while (overflowsCol() && height > 40 && guard < 12) {
        var extra = currentCol.scrollHeight - currentCol.clientHeight;
        var squeezed = Math.floor(height - extra - 2);
        if (squeezed >= height) squeezed = height - 8;
        height = Math.max(40, squeezed);
        apply(height);
        guard += 1;
      }
    }

    function paintFigure(figure, img, size, className) {
      var canvas = drawFitted(img, size.width, size.height);
      canvas.className = className;
      var existing = figure.querySelector("canvas");
      if (existing) figure.replaceChild(canvas, existing);
      else figure.insertBefore(canvas, figure.firstChild);
    }

    function appendFigure(slot, captionText) {
      var figure = document.createElement("figure");
      var caption = document.createElement("figcaption");
      caption.textContent = captionText;
      figure.appendChild(caption);
      slot.appendChild(figure);
      return figure;
    }

    function addMisoPhoto(created) {
      var source = requireImage(document.querySelector(".soupe .miso-photo img"));
      ensureItems(created);
      var slot = document.createElement("div");
      slot.className = "pdf-photo-block miso-photo-slot";
      currentItems.appendChild(slot);
      created.push(slot);
      function apply(maxImageHeight) {
        var size = containedSizeOf(source, slotInnerWidthOf(slot), maxImageHeight);
        var canvas = drawFitted(source, size.width, size.height);
        canvas.className = "pdf-miso-photo";
        var existing = slot.querySelector("canvas");
        if (existing) slot.replaceChild(canvas, existing);
        else slot.appendChild(canvas);
      }
      var full = slotInnerWidthOf(slot) / (source.naturalWidth / source.naturalHeight);
      layoutColumnPhoto(apply, Math.min(full, 97) * imageScale, Math.max(48, 64 * imageScale));
    }

    function addKaraagePhoto(created) {
      var source = requireImage(document.querySelector(".accompagnements .karaage-photo img"));
      ensureItems(created);
      var slot = document.createElement("div");
      slot.className = "pdf-photo-block karaage-photo-slot";
      currentItems.appendChild(slot);
      created.push(slot);
      var figure = appendFigure(slot, "Poulet karaage");
      function apply(maxImageHeight) {
        var size = containedSizeOf(source, slotInnerWidthOf(slot), maxImageHeight);
        paintFigure(figure, source, size, "pdf-karaage-photo");
      }
      var full = slotInnerWidthOf(slot) / (source.naturalWidth / source.naturalHeight);
      var preferred = full * (2 / 3) * imageScale;
      layoutColumnPhoto(apply, preferred, Math.max(48, preferred * 0.85));
    }

    function addPlatsPhotos(created) {
      var sources = document.querySelectorAll(".plats .plats-photos img");
      if (sources.length < 2) throw new Error("Image du menu introuvable");
      requireImage(sources[0]);
      requireImage(sources[1]);
      ensureItems(created);
      var row = document.createElement("div");
      row.className = "pdf-row pdf-plats-photos pdf-photo-block";
      currentItems.appendChild(row);
      created.push(row);
      var figures = [];
      var slots = [];
      ["Mapo tofu", "Udon au kakiage"].forEach(function (text) {
        var slot = document.createElement("div");
        slot.className = "item-slot";
        row.appendChild(slot);
        slots.push(slot);
        figures.push(appendFigure(slot, text));
      });
      function apply(maxImageHeight) {
        figures.forEach(function (figure, index) {
          var size = containedSizeOf(sources[index], slotInnerWidthOf(slots[index]), maxImageHeight);
          paintFigure(figure, sources[index], size, "pdf-plats-photo");
        });
      }
      var full = slotInnerWidthOf(slots[0]) / (sources[0].naturalWidth / sources[0].naturalHeight);
      var preferred = full * imageScale;
      layoutColumnPhoto(apply, preferred, Math.max(48, preferred * 0.8));
    }

    function addBeerPhotos(created) {
      var sources = document.querySelectorAll(".bieres .beer-photos img");
      if (sources.length < 2) throw new Error("Image du menu introuvable");
      Array.prototype.forEach.call(sources, requireImage);
      ensureItems(created);
      var row = document.createElement("div");
      row.className = "pdf-beer-photos pdf-photo-block";
      currentItems.appendChild(row);
      created.push(row);
      function apply(maxImageHeight) {
        var gap = 6;
        var avail = Math.max(1, currentCol.clientWidth);
        var height = maxImageHeight;
        function widthsFor(nextHeight) {
          return Array.prototype.map.call(sources, function (img) {
            return nextHeight * (img.naturalWidth / img.naturalHeight);
          });
        }
        var widths = widthsFor(height);
        var contentWidth = widths.reduce(function (sum, itemWidth) { return sum + itemWidth; }, 0);
        if (contentWidth + gap > avail && contentWidth > 0) {
          height = Math.floor(height * ((avail - gap) / contentWidth));
          widths = widthsFor(height);
        }
        row.textContent = "";
        Array.prototype.forEach.call(sources, function (img, index) {
          var canvas = drawFitted(img, widths[index], height);
          canvas.className = "pdf-beer-photo";
          row.appendChild(canvas);
        });
      }
      layoutColumnPhoto(apply, Math.round(108 * imageScale), Math.max(48, Math.round(72 * imageScale)));
    }

    function addUmePhoto(created) {
      ensureItems(created);
      var slot = document.createElement("div");
      slot.className = "yuzu-photo-slot pdf-photo-ume pdf-photo-block";
      currentItems.appendChild(slot);
      created.push(slot);
      function apply(maxImageHeight) {
        var size = containedSizeOf(ume, slotInnerWidthOf(slot), maxImageHeight);
        var canvas = drawFitted(ume, size.width, size.height);
        canvas.className = "pdf-ume-photo";
        var existing = slot.querySelector("canvas");
        if (existing) slot.replaceChild(canvas, existing);
        else slot.appendChild(canvas);
      }
      var full = slotInnerWidthOf(slot) / (ume.naturalWidth / ume.naturalHeight);
      layoutColumnPhoto(apply, full * 0.72 * imageScale, Math.max(48, full * 0.5 * imageScale));
    }

    function addPhoto(unit, created) {
      if (unit.photo === "miso") addMisoPhoto(created);
      else if (unit.photo === "karaage") addKaraagePhoto(created);
      else if (unit.photo === "plats") addPlatsPhotos(created);
      else if (unit.photo === "beers") addBeerPhotos(created);
      else if (unit.photo === "ume") addUmePhoto(created);
      else throw new Error("Image du menu introuvable");
    }

    function addUnit(unit, created) {
      if (unit.kind === "band-head") {
        var band = document.createElement("section");
        band.className = "band";
        band.appendChild(prepareClone(unit.node));
        menu.insertBefore(band, columnsWrap);
        created.push(band);
        refreshColumnHeight();
        return;
      }
      if (unit.kind === "photo") {
        addPhoto(unit, created);
        return;
      }
      if (unit.kind === "section-open") {
        currentSection = null;
        currentItems = null;
        if (!currentBand) {
          currentBand = document.createElement("section");
          currentBand.className = "band";
          currentCol.appendChild(currentBand);
          created.push(currentBand);
        }
        currentSection = document.createElement("section");
        currentSection.className = "menu-section" + (unit.plats ? " plats" : "");
        currentBand.appendChild(currentSection);
        created.push(currentSection);
        if (unit.head) currentSection.appendChild(prepareClone(unit.head));
        if (unit.note) currentSection.appendChild(prepareClone(unit.note));
        currentItems = document.createElement("div");
        currentItems.className = "items";
        currentSection.appendChild(currentItems);
        created.push(currentItems);
        return;
      }
      ensureItems(created);
      var item = prepareClone(unit.node);
      currentItems.appendChild(item);
      created.push(item);
    }

    function undo(created) {
      for (var i = created.length - 1; i >= 0; i -= 1) {
        var el = created[i];
        if (el === currentBand) currentBand = null;
        if (el === currentSection) currentSection = null;
        if (el === currentItems) currentItems = null;
        if (el.parentNode) el.parentNode.removeChild(el);
      }
    }

    startPage();
    var index = 0;
    var guard = 0;
    while (index < units.length && guard < 500) {
      guard += 1;
      var group = columnGroupAt(units, index);
      var created = [];
      var emptyBefore = columnIsEmpty() && group[0].kind !== "band-head";
      group.forEach(function (unit) { addUnit(unit, created); });
      var overflow = group[0].kind === "band-head" ? false : overflowsCol();
      if (!overflow) {
        index += group.length;
        continue;
      }
      undo(created);
      if (group[0].kind === "band-head") refreshColumnHeight();
      if (emptyBefore) {
        group.forEach(function (unit) { addUnit(unit, []); });
        index += group.length;
        continue;
      }
      nextColumn();
    }
    if (index < units.length) throw new Error("Pagination incomplète");
    return sheets;
  }
}());
