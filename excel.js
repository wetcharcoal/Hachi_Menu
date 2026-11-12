(function () {
  var EXCELJS = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";

  var optionsByName = {
    "Udon au curry": "vegan; chicken (+$2)",
    "Udon au kakiage": "vegan; squid and shrimp (+$2)",
    "Curry japonais": "vegan; chicken",
    "Frites/Frites Okonomi": "vegan fries; Japanese-style fries (+$2)"
  };

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.ExcelJS) {
        resolve();
        return;
      }
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        existing.addEventListener("load", function () { resolve(); });
        existing.addEventListener("error", function () {
          reject(new Error("Chargement impossible : " + src));
        });
        return;
      }
      var script = document.createElement("script");
      script.src = src;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error("Chargement impossible : " + src)); };
      document.head.appendChild(script);
    });
  }

  function textOf(node) {
    return (node && node.textContent || "").replace(/\s+/g, " ").trim();
  }

  function itemName(item) {
    var name = item.querySelector(".item-name");
    if (!name) return "";
    var clone = name.cloneNode(true);
    clone.querySelectorAll("svg").forEach(function (icon) {
      icon.remove();
    });
    return textOf(clone);
  }

  function yesNo(flag) {
    return flag ? "Yes" : "No";
  }

  function menuRows() {
    var rows = [["Name", "Description", "Price", "Options", "Vegan", "Gluten free", "Category"]];
    document.querySelectorAll(".style-page .item").forEach(function (item) {
      var name = itemName(item);
      var french = textOf(item.querySelector(".desc-fr"));
      var english = textOf(item.querySelector(".desc-en"));
      var description = french && english ? french + "\n" + english : french || english;
      var section = item.closest(".menu-section");
      var heading = section && section.querySelector(".section-head h2");
      rows.push([
        name,
        description,
        textOf(item.querySelector(".price")),
        optionsByName[name] || "",
        yesNo(!!item.querySelector(".item-name .leaf")),
        yesNo(!!item.querySelector(".item-name .gluten")),
        textOf(heading)
      ]);
    });
    return rows;
  }

  function saveWorkbook(buffer) {
    var blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "hachi-maru-hachi-menu.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  function downloadMenuExcel() {
    return loadScript(EXCELJS).then(function () {
      if (!window.ExcelJS) throw new Error("Bibliothèque Excel indisponible");
      var rows = menuRows();
      var workbook = new window.ExcelJS.Workbook();
      var sheet = workbook.addWorksheet("Menu", {
        views: [{ state: "frozen", ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft" }]
      });
      sheet.columns = [
        { width: 28 },
        { width: 72 },
        { width: 14 },
        { width: 46 },
        { width: 12 },
        { width: 14 },
        { width: 32 }
      ];
      rows.forEach(function (values, index) {
        var row = sheet.addRow(values);
        var header = index === 0;
        row.height = header ? 18 : 36;
        row.font = { name: "Calibri", size: 11, bold: header };
        row.alignment = { vertical: "top" };
        row.getCell(2).alignment = { vertical: "top", wrapText: true };
      });
      return workbook.xlsx.writeBuffer().then(saveWorkbook);
    });
  }

  window.downloadMenuExcel = downloadMenuExcel;
}());
