# Drivetale – strona aplikacji

Statyczna strona publiczna aplikacji na Androida **Drivetale – dziennik jazd** (wydanie Google Play projektu
DailyCarTracker). Adres docelowy: https://weriyard.github.io/drivetale/

Bez kroku budowania, bez trackerów, analityki i ciasteczek. Jedyny zewnętrzny zasób to czcionki z Google Fonts.

## Zawartość

| Plik | Opis |
|---|---|
| `index.html` | Strona główna (PL): zrzuty ekranu, ekran jazdy, funkcje, OBD, o projekcie, prywatność |
| `polityka-prywatnosci.html` | Polityka prywatności (PL, potem EN – kotwica `#en`) |
| `404.html` | Strona błędu (style wbudowane, link do `/drivetale/`) |
| `favicon.svg` | Ikona – wektor z ikony aplikacji |
| `assets/style.css`, `assets/gallery.css` | Style (galeria zrzutów w ramce telefonu) |
| `assets/site.js` | Ustawienia strony, m.in. `PLAY_STORE_URL` |
| `assets/shots/*.jpg` | Prawdziwe zrzuty ekranu aplikacji (tryb demo, emulator Android 16), zmniejszone do 720 px |
| `.nojekyll` | Wyłącza Jekyll w GitHub Pages |

Wszystkie odnośniki są względne, więc strona działa pod `/drivetale/` i lokalnie
(np. `python3 -m http.server` w katalogu repozytorium).

## Do uzupełnienia przed publikacją

- `assets/site.js` → `PLAY_STORE_URL` – adres karty w Google Play (pusty = przycisk „Wkrótce w Google Play”).
- `polityka-prywatnosci.html` i stopki → `[imię i nazwisko / nazwa]`, `[adres e-mail kontaktowy]`, `[data publikacji]`
  (oznaczone na stronie czerwoną ramką, klasa `placeholder`).

## Publikacja w GitHub Pages

1. Utwórz publiczne repozytorium `weriyard/drivetale` i wypchnij gałąź `main`.
2. Settings → Pages → Build and deployment → Source: **Deploy from a branch**.
3. Branch: **`main`**, folder: **`/ (root)`** → Save.
4. Po chwili strona jest pod https://weriyard.github.io/drivetale/

## Źródła treści

Opis funkcji: `docs/play/store-listing.md`, polityka: `docs/play/privacy-policy.md` (gałąź `play-release`
repozytorium DailyCarTracker). Zrzuty ekranu: test `StoreScreenshotsTest` na emulatorze w CI, pliki PNG na gałęzi
`ci-screenshots` repozytorium DailyCarTracker (mapy © OpenStreetMap contributors).
