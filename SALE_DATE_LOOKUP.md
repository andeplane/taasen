# How the latest tinglysingsdato is collected

Kartverket's free property-facts API does not return sale dates, but 1881
Eiendomspriser publishes the latest transfer date separately. The site explicitly
defines its “Dato solgt” as the tinglyst date. This project stores that date as
`tinglysingsdato` in ISO `YYYY-MM-DD` format.

You already have, for every address, the `gnr/bnr` (e.g. `54/16`) and coordinates
in `houses.geojson` / the explorer — that's all you need to search below.

---

## Route A — 1881 Eiendomspriser (used by this project)

The explorer's dates come from the site's public search service:

```text
GET https://www.eiendomspriser.no/service/search
    ?query=Mårveien%2C+Oslo
    &placeFilter=Mårveien%2C+Oslo
    &sort=1
    &fromDate=&toDate=&municipalities=
X-Requested-With: XMLHttpRequest
```

The response identifies each property by `Gnr` and `Bnr` and supplies
`SoldDate` / `SortableDate`. If the response contains multiple transfers for a
matrikkel, the newest date is retained. Its `To` field is stored as
`registrert_kjoper`, meaning the buyer/transferee registered for that transfer.
It is not a guarantee of the current owner. Names are suppressed and
`kjoper_tvetydig` is set when sectioned or conflicting records cannot be mapped
safely to one property.

To check a property manually:

1. Go to <https://www.eiendomspriser.no/>
2. Search the address (e.g. `Bergrådveien 12, Oslo`) or pan the map to it.
3. Click the property to see the latest tinglysingsdato and a price range.
   The exact price is a paid view.

Source: 1881, fed from the public registers. Note: does **not** cover
*aksjeleiligheter*, or *borettslag* sales before 2006.

---

## Route B — Kartverket Eiendomsregisteret (authoritative, BankID login)

The official source; the sale date is the *tinglysingsdato* of the last
ownership transfer (hjemmelsovergang).

1. Go to <https://eiendomsregisteret.kartverket.no/>
2. Search the address or the matrikkel `0301/<gnr>/<bnr>`
   (URL pattern: `https://eiendomsregisteret.kartverket.no/eiendom/0301/<gnr>/<bnr>`).
3. Click **"Vis aktiv grunnboksutskrift"** → log in with **BankID / ID-porten**.
4. In the grunnboksutskrift, under **Hjemmelshaver → Rettsstiftelse**, the
   **Dagbok/tinglyst date** of the last transfer is the sale date; **Kjøpesum**
   is the price (when registered as *fritt salg*).
5. Every lookup is logged to your identity. For an official stamped copy you can
   instead **order** a grunnboksutskrift (~172 kr).

---

## Route C — Kartverket's free JSON API (property facts only)

This supplies building type, plot area, coordinates and tinglyst status, but not
the transfer date or price:

```
GET https://eiendomsregisteret.kartverket.no/api/matrikkelenhet/0301/<gnr>/<bnr>
    -> { matrikkelenhetId, type, oppgittAreal, koordinater, isTinglyst, isSeksjonert, ... }

GET https://eiendomsregisteret.kartverket.no/api/bygningerForMatrikkelenhet/<matrikkelenhetId>
    -> [ { bygningsnummer, type: "111 - Enebolig", status, ... } ]

GET https://eiendomsregisteret.kartverket.no/api/teigerForMatrikkelenhet/<matrikkelenhetId>
    -> [ { areal, type: "Eiendomsteig", koordinater, ... } ]
```

The grunnbok endpoints on the same host (`/api/grunnbok/...`) require the
BankID-authenticated session from Route B.

Kartverket's `/api/grunnbok/...` endpoints remain BankID-authenticated. The
project does not call those endpoints or collect exact prices or authoritative
current-owner records. Its 1881 transferee names are personal data and the
generated dataset is intended for private/local use.
