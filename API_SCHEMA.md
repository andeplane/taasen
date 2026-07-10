# Kartverket Eiendomsregisteret — public API schema

Primary base: `https://eiendomsregisteret.kartverket.no/api`
No API key. The endpoints below need **no login** (property/matrikkel/building
data). Endpoints under `/grunnbok/*` require a **BankID/ID-porten session** and
are where owner names + tinglyst sale dates/prices live — not documented as
bulk-usable here.

Two-step flow: address → `gnr/bnr` (via Geonorge), then `gnr/bnr` →
`matrikkelenhetId` → buildings/teiger. The latest tinglysingsdato comes from
1881 Eiendomspriser' public search service, described in section 6.

---

## 0. Geonorge address search (separate host)

`GET https://ws.geonorge.no/adresser/v1/sok`

| param | example | notes |
|---|---|---|
| `adressenavn` | `Mårveien` | street name |
| `kommunenummer` | `0301` | Oslo |
| `treffPerSide` | `1000` | page size |

Each `adresser[]` item (subset):
```jsonc
{
  "adressetekst": "Mårveien 3",
  "adressenavn": "Mårveien",
  "nummer": 3, "bokstav": "",
  "gardsnummer": 53, "bruksnummer": 183, "festenummer": 0, "undernummer": null,
  "postnummer": "0873", "poststed": "OSLO",
  "kommunenummer": "0301", "kommunenavn": "OSLO",
  "representasjonspunkt": { "epsg": "EPSG:4258", "lat": 59.9545, "lon": 10.7568 }
}
```

---

## 1. `GET /matrikkelenhet/{kommune}/{gnr}/{bnr}`

Core property record. `{kommune}` = `0301`.

```jsonc
{
  "matrikkelenhetId": 284442462,            // int — internal id, used by endpoints 3–5
  "type": "Grunneiendom",                    // Grunneiendom | Eierseksjon | Festegrunn | ...
  "undertype": null,
  "matrikkelenhetident": {
    "kommunenummer": "0301",
    "gaardsnummer": 53, "bruksnummer": 183,
    "festenummer": 0, "seksjonsnummer": 0
  },
  "kommunenavn": "OSLO",
  "oppgittAreal": 1377.4,                     // number — plot area m² (declared)
  "arealmerknad": "",
  "koordinater": { "xpos": 263102, "ypos": 6653936, "epsgKode": 32633, "feilmelding": "" },
                                             // EPSG:32633 = UTM 33N (metres)
  "isTinglyst": true,                        // bool — registered in grunnbok
  "isSeksjonert": false,                     // bool — split into eierseksjoner
  "isFestegrunner": false,                   // bool — leasehold plots exist
  "bruksnavn": " ",
  "isGrunnforurensning": false,              // ground pollution flag
  "underSammenslaaing": "Nei",               // string Ja/Nei — merge in progress
  "isKulturminner": false,                   // cultural-heritage flag
  "historiskOppgittAreal": 1378.0,
  "isHarRegistrertGrunnerverv": false,
  "isJordskifteKrevd": false,
  "isOppmalingIkkeFullfort": false,
  "isUtgaatt": false                         // bool — matrikkelenhet retired
}
```

## 2. `GET /basicinfo/{kommune}/{gnr}/{bnr}`

Lightweight header info.
```jsonc
{
  "matrikkelIdent": { "kommunenummer":"0301","gaardsnummer":53,"bruksnummer":183,"festenummer":0,"seksjonsnummer":0 },
  "adresse": "Mårveien 3",
  "postnummeromraade": "0873 OSLO",
  "kommune": "OSLO KOMMUNE",
  "borettslagnavn": ""                       // set if a housing co-op
}
```

## 3. `GET /bygningerForMatrikkelenhet/{matrikkelenhetId}`

Array of buildings. **`type` is the key field** (NS3457 code + label).
```jsonc
[{
  "bygningsnummer": "80151691",
  "type": "111 - Enebolig",                  // "" for annexes/extensions
  "status": "Tatt i bruk",                   // Tatt i bruk | Rammetillatelse | Revet | ...
  "isSefrak": false,                         // SEFRAK-registered (old building)
  "isFredet": false,                         // heritage-protected
  "naeringsgruppe": "Bolig",                 // Bolig | Annet som ikke er næring | ...
  "bygningsendring": ""                      // "Tilbygg" | "Påbygg" | ...
}]
```
Building-type code ranges: `111–113` enebolig · `121–123` tomannsbolig ·
`131–136` rekkehus/småhus · `141–146` store boligbygg (blokk) · `181/182/…`
garasje/annet · `2xx–8xx` næring/annet.

## 4. `GET /teigerForMatrikkelenhet/{matrikkelenhetId}`

Array of land parcels (teiger).
```jsonc
[{
  "areal": 1377.4,                           // number — parcel area m²
  "arealmerknad": "",
  "isFlereMatrikkelenheter": false,
  "isUavklarteGrenser": false,               // disputed boundaries
  "isUregistrertJordsameie": false,
  "koordinater": { "xpos":263102,"ypos":6653936,"epsgKode":32633,"feilmelding":"" },
  "medium": null,
  "type": "Eiendomsteig"
}]
```

## 5. `GET /adresserForMatrikkelenhet/{matrikkelenhetId}`

Array of addresses + civic geography (handy for stats/segmentation).
```jsonc
[{
  "adresse": "Mårveien 3",
  "grunnkrets": "Havnajordet",               // SSB basic statistical area
  "kirkesokn": "Nordberg",
  "postnummeromraade": "0873 OSLO",
  "valgkrets": "Tåsen skole",                // electoral/(school) district
  "matrikkelenhetIdent": ""
}]
```

## 6. `GET https://www.eiendomspriser.no/service/search`

The public 1881 search response supplies the latest registered transfer date.
Requests require the normal AJAX header `X-Requested-With: XMLHttpRequest`.

| param | example |
|---|---|
| `query` | `Mårveien, Oslo` |
| `placeFilter` | `Mårveien, Oslo` |
| `sort` | `1` |
| `fromDate`, `toDate`, `municipalities` | empty |

Each `Properties[]` item includes `Gnr`, `Bnr`, `Fnr`, `Snr`, `SoldDate`
(`DD.MM.YYYY`), `SortableDate` (ISO timestamp), and `To` (the registered
buyer/transferee). The site states that “Dato solgt er tinglyst dato.” This
project stores `SortableDate[:10]` as `tinglysingsdato` and `To` as
`registrert_kjoper`. It suppresses the name when section/unit records collapse
ambiguously onto one gnr/bnr. The field is not treated as proof of the current
owner. The paid exact price is not collected.

---

## 7. `GET https://consumer-service-hjemla-prod.propcloud.no/public/properties/unit/{municipality}`

Hjemla's (Schibsted) public unit endpoint — no login, no API key. Supplies the
**size class, build year, floors and value estimate** missing from the open
Kartverket APIs. `{municipality}` is a slug, e.g. `oslo`.

| param | example | notes |
|---|---|---|
| `streetaddress` | `maarveien-3` | slug: lowercase, `å→aa ø→oe æ→ae`, spaces→`-`, house letter appended |
| `postalCode` | `0873` | |
| `floorcode` | `H0101` | optional — omit for the default unit |

```jsonc
{
  "success": true,
  "response": {
    "unitId": 229232390,
    "unitType": "House",              // House | SemiDetatchedHouse | SerialHouse | Apartment
    "floorCode": "H0101",
    "floorNumber": 1,
    "numberOfFloors": 3,
    "sizeRange": "over 200",           // bruksareal class: "under 30", "over 30/50/70/100/150/200/250/300"
    "constructionDate": "1936-02-05T00:00:00",
    "estimate": { "estimateMin": 20067689.4, "estimateMax": 22724178.0 },  // NOK
    "marketData": { "marketState": "OffMarket", "fixedDate": "2007-05-15T00:00:00", ... },
    "address": { "boroughName": "Nordre Aker", "subareaName": "Tåsen", ... }
  }
}
```

Returns HTTP 500 when Hjemla has no dwelling unit for the address (16 of the
416 addresses here). Exact bruksareal m² is **not** exposed publicly — only
these ranges. Related public endpoints on the same host:
`/public/locations/search?keyword=…&limit=50` (address autocomplete),
`/public/properties/{unitId}/saleshistory` (dates + modelled price ranges,
no exact prices).

---

## Coordinate conversion (UTM33 → lat/lon)

`koordinater` are EPSG:32633 metres. For a map, either use the Geonorge
`representasjonspunkt` (already lat/lon, EPSG:4258 ≈ WGS84), or convert:
```python
from pyproj import Transformer
t = Transformer.from_crs(32633, 4326, always_xy=True)
lon, lat = t.transform(xpos, ypos)
```

## Auth-gated (not for bulk use)

- `GET /grunnbok/userName` — current logged-in user
- `GET /grunnbok/borettslag/{k}/{g}/{b}` — co-op share info
- Grunnboksutskrift (owner + tinglyst sale date/price): rendered after BankID
  login on the site; see `SALE_DATE_LOOKUP.md`.
