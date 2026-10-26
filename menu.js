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
}());
