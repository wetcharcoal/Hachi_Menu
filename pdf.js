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
      try {
        sheets = paginate(stage);
        resolveSvgColors(stage);
      } catch (error) {
        stage.remove();
        throw error;
      }
      return rasterize(sheets).then(function () {
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
        currentSection = document.createElement("section");
        currentSection.className = "menu-section";
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
        currentSection.className = "menu-section pdf-continued";
        currentBand.appendChild(currentSection);
        created.push(currentSection);
        currentItems = document.createElement("div");
        currentItems.className = "items";
        currentSection.appendChild(currentItems);
        created.push(currentItems);
        currentRow = null;
      }

      if (!currentRow || currentRow.children.length >= 2) {
        currentRow = document.createElement("div");
        currentRow.className = "pdf-row";
        currentItems.appendChild(currentRow);
        created.push(currentRow);
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
    if (units[start].kind === "item") return group;
    var j = start + 1;
    while (j < units.length && units[j].kind !== "item") {
      group.push(units[j]);
      j += 1;
    }
    if (j < units.length) group.push(units[j]);
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
          note: section.querySelector(":scope > .note")
        });
        section.querySelectorAll(":scope > .items > .item").forEach(function (item) {
          units.push({ kind: "item", node: item });
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
