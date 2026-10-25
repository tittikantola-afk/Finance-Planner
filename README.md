# Talous – oma talousennuste

Kevyt, ilmainen web-sovellus (PWA), joka pyörii GitHub Pagesissa ja asentuu iPhonen kotivalikkoon kuin oikea appi.

- **Saldo nyt** ja **saldoennuste** päivä päivältä (3–24 kk eteenpäin)
- **Toistuvat tulot ja menot**: kuukausittain, viikoittain / joka toinen viikko, vuosittain tai kerran. Viikonloppusiirto (palkka edellisenä arkipäivänä, eräpäivä seuraavana).
- **Kuukausibudjetit** (ruoka, polttoaine…): kirjatut ostot vähentävät jäljellä olevaa budjettia, loput jaetaan kuun loppupäiville.
- **Korjaukset toteuman mukaan**: merkitse erä toteutuneeksi oikealla summalla/päivällä, siirrä sitä, muuta summaa tai ohita kerta.
- **Päivitä saldo pankista**: ennuste lasketaan aina viimeisimmästä oikeasta saldosta. Sovellus kysyy, mitkä erääntyneet erät jo näkyvät saldossa, jottei mitään lasketa kahdesti.
- **Luottokortti hätävarana**: luottoraja, velka ja laskun maksu (kiinteä erä tai koko velka). Jos tili uhkaa mennä miinukselle, ennuste kertoo riittääkö luotto kattamaan vajeen ja paljonko sitä tarvitaan. Korttiostot voi kirjata kortille, ja laskun maksu lyhentää velkaa.
- **Rahat riittää -mittari**: alin tuleva saldo, turvapuskuri ja "turvallisesti käytettävissä nyt" -summa.

## Yksityisyys

Kaikki talustiedot tallentuvat **vain puhelimesi selaimeen** (localStorage). Mitään ei lähetetä minnekään eikä mitään tallenneta GitHubiin – repossa on pelkkä sovelluksen koodi. Ota siksi välillä varmuuskopio (Historia → Vie varmuuskopio, esim. iCloud Driveen).

## Julkaisu GitHub Pagesiin (ilmainen)

1. Repo on julkinen, joten Pages on ilmainen. (Koodissa ei ole henkilötietoja.)
2. *Settings → Pages → Build and deployment → Source: Deploy from a branch*, valitse haara `main` ja kansio `/ (root)` → Save.
3. Hetken päästä sovellus on osoitteessa `https://tittikantola-afk.github.io/Finance-Planner/`.

## iPhoneen

Avaa osoite **Safarilla** → Jaa-painike → **Lisää Koti-valikkoon**. Sovellus aukeaa omana ikkunanaan ja toimii myös ilman verkkoa.

## Kehitys

Ei build-vaihetta: `index.html`, `styles.css`, `forecast.js` (laskenta) ja `app.js` (käyttöliittymä). Paikallisesti: `python3 -m http.server` ja avaa http://localhost:8000. Kun muutat tiedostoja, nosta `sw.js`:n `CACHE`-versiota.
