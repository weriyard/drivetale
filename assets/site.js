/* Drivetale – ustawienia strony.
 * DO UZUPEŁNIENIA po publikacji w Google Play: wpisz adres karty aplikacji, np.
 * "https://play.google.com/store/apps/details?id=…". Pusty = przycisk „Wkrótce w Google Play” (nieaktywny). */
var PLAY_STORE_URL = "";

(function () {
  "use strict";
  var cta = document.getElementById("play-cta");
  if (!cta || !PLAY_STORE_URL) return;
  cta.href = PLAY_STORE_URL;
  cta.removeAttribute("aria-disabled");
  cta.removeAttribute("role");
  cta.rel = "noopener";
  var label = document.getElementById("play-cta-label");
  if (label) label.textContent = "Pobierz z Google Play";
})();
