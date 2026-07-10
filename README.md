# Tåsen, Korsvoll og Nordberg boligkart — property data & explorer

Mapping the housing stock around **Tåsen and Korsvoll (bydel Nordre Aker,
Oslo)** to help decide where to buy. The dataset covers 40 complete streets:
**Tåsen terrasse, Tåsenveien, Mårveien, Heierstuveien, Bergrådveien,
Havnabakken, Østhornveien, Nypeveien, Langåsveien, Åmotveien, Korsvollbråtan,
Maurstien, Morenestien, Rabakken, Hansegata, Skibakkeveien, Korsvollbakken,
Carl Kjelsens vei, Jansbergveien, Nilserudkleiva, Bålveien, Barliveien,
Langmyrveien, Steingardveien, Nordbergveien, Kongleveien, Nils Bays vei,
Tirilveien, Lersolveien, Dyrlandsveien, Staudeveien, Nordbergbakken,
Bregneveien, Gunnar Schjelderups vei, Havnehagan, Gunnar Johnsons vei,
Holsteinveien, Rødbråtbakken, Krokusveien, and Øvre Langås vei**. The generated
files are for **private/local use** and contain the latest registered
buyer/transferee names published by 1881.

## What's here

| File | What it is |
|---|---|
| `index.html` | The explorer app — sortable/filterable table + interactive map. **Open this.** |
| `data.js` | GeoJSON bundled for the app (loaded by `index.html`). |
| `houses.geojson` | Same data as GeoJSON (standard geospatial syntax) — 1,803 address points. |
| `houses.ttl` | The knowledge graph in **RDF/Turtle** — ~50,500 triples. |
| `houses.json` | Node/edge graph view (addresses → properties → buildings). |
| `houses.md` | Human-readable per-street tables + summary. |
| `fetch_house.py` | Reusable Python to fetch per-house facts (for your own app/search). |
| `sync_dataset.py` | Compare the configured street list with local data and fetch missing addresses. |
| `sale_model.py` | Tenure-based five-year sale probability model. |
| `update_sale_dates.py` | Refresh tinglysingsdato across all generated data files. |
| `API_SCHEMA.md` | Full schema of every register API endpoint used. |
| `SALE_DATE_LOOKUP.md` | How the tinglysingsdato is sourced, plus price lookup options. |

## Open the explorer

```bash
open index.html          # macOS — double-clicking also works
```
Loads Leaflet + Tabulator from CDN (needs internet for map tiles). Filter by
street, type, plot size, unit size, and 5-year sale outlook; click a row to fly
to it on the map, or click a marker to select the row. Toggle marker colour
between building type and sale outlook. The table also shows size class,
build year and Hjemla's value-estimate range per address.

## Fetch data yourself

Python (stdlib only, no installs):
```bash
python3 fetch_house.py "Mårveien 3"        # one house
python3 fetch_house.py --street "Bergrådveien"
python3 fetch_house.py --gnrbnr 54 16      # by matrikkel
```
Import `find_addresses`, `property_facts`, `fetch_house` for your own search.

## Extending the dataset with more streets

The input for an extension is a list of street names. For each street, the goal
is to discover **every registered house number** and collect the same fields as
the existing dataset:

1. `find_addresses()` queries Geonorge for all addresses on the street in Oslo
   (`kommune=0301`), including house number, `gnr/bnr`, postcode and coordinates.
2. `property_facts()` queries Kartverket once per distinct property for building
   type, plot area, registration status and matrikkel metadata.
3. `sale_transfers_for_street()` obtains the latest known transfer date and
   registered buyer/transferee from 1881 Eiendomspriser.
4. `hjemla_unit()` adds Hjemla's size range, construction year, floors and value
   estimate where available.
5. The five-year sale probability is recalculated from building type and the
   latest transfer date.

Use the whole-street command to inspect the collected records:

```bash
python3 fetch_house.py --street "Havnabakken"
```

`sync_dataset.py` contains the canonical complete street list. It queries
Geonorge for each street, reports the address delta against `houses.geojson`,
and fetches only missing addresses before regenerating all output formats:

```bash
python3 sync_dataset.py
python3 sync_dataset.py --dry-run  # measure the delta without writing
```

Street matching must use the official name returned by Geonorge. Check that all
returned addresses belong to the intended Oslo street, deduplicate shared
`gnr/bnr` properties, and retain separate address records for lettered or
multi-unit addresses. A missing value should remain `null`/`–`; it must not be
guessed. If a street is supplied through a map image and its labels or intended
boundary are unclear, confirm the interpreted street list before collecting it.

An extension is complete only when the generated representations remain in
sync: `houses.geojson`, `data.js`, `houses.json`, `houses.ttl`, and `houses.md`.
Update their metadata counts and the street/address totals in this README as
part of the same change. `update_sale_dates.py` refreshes existing records only;
its `STREETS` tuple must also include every newly added street.

Refresh all stored tinglysingsdato values with:
```bash
python3 update_sale_dates.py
```

Or raw curl — the two-step flow (address → gnr/bnr → facts), no auth:
```bash
# address -> gnr/bnr + coords
curl -s 'https://ws.geonorge.no/adresser/v1/sok?adressenavn=M%C3%A5rveien&kommunenummer=0301&treffPerSide=1000'
# property record (returns matrikkelenhetId)
curl -s 'https://eiendomsregisteret.kartverket.no/api/matrikkelenhet/0301/53/183'
# buildings (building type), plot, addresses
curl -s 'https://eiendomsregisteret.kartverket.no/api/bygningerForMatrikkelenhet/284442462'
curl -s 'https://eiendomsregisteret.kartverket.no/api/teigerForMatrikkelenhet/284442462'
curl -s 'https://eiendomsregisteret.kartverket.no/api/adresserForMatrikkelenhet/284442462'
```
Full field-by-field schema in `API_SCHEMA.md`.

## Data sources (all open, no login)

- **Addresses + coordinates:** Geonorge address API — `ws.geonorge.no/adresser/v1/sok`
- **Building type / plot / status:** Eiendomsregisteret public JSON API —
  `eiendomsregisteret.kartverket.no/api/…`
- **Latest tinglysingsdato + registered buyer/transferee:** 1881
  Eiendomspriser search service —
  `www.eiendomspriser.no/service/search`
- **Size class / build year / floors / value estimate:** Hjemla (Schibsted)
  public unit API — `consumer-service-hjemla-prod.propcloud.no/public/properties/unit/…`
  Covers 1,716 of 1,803 addresses. Sizes are **bruksareal ranges** (`under 30`,
  `over 30/50/70/100/150/200/250/300 m²`) — exact m² is not open data: it sits
  in the matrikkel, and Kartverket's public API exposes no area fields (the
  open WFS `Matrikkelen-Bygningspunkt` has none either; verified).

### Why the sizes are ranges, not exact m² (verified with BankID)

Exact per-house bruksareal is **owner-gated** — no source exposes it for a whole
neighbourhood. Checked while logged in (2026-07):
- **Kartverket Eiendomsregisteret** (ID-porten/BankID): shows exact
  building/bruksenhet area **only for properties you own**. For any other
  property the logged-in view still lists only building type/status and plot
  area — no bruksareal.
- **Hjemla** (Vipps login): its authenticated API returns the **same size
  ranges** for properties you don't own; the exact figure appears only on your
  own `min-bolig` dashboard.
- **finn.no** sold ads do carry exact BRA, but only for homes **sold recently**
  and behind an image-rendering map servlet, not bulk JSON — partial and not
  scalable.

So the range + build year + floors + estimate captured here is the most
complete size signal obtainable without per-property owner access.

## Key numbers

- **1,803 addresses → 1,374 distinct properties.** Overwhelmingly single-family:
  692 eneboliger, 408 tomannsboliger and 204 rekkehus; only 19 apartment buildings total.
- **Unit size/build year (Hjemla):** 1,716/1,803 addresses carry `bra_klasse`
  (size range), `byggeaar`, `etasjer` and `estimat_min/maks_mnok`.
- **Area turnover (anonymous proxy for "will they move"):** Norway 2025 =
  253,882 between-municipality moves = 4.5%/yr; total residential mobility ~10–11%/yr;
  owner-occupied detached houses turn over slower (~4–6%/yr, avg tenure ~15–20 yrs).
  Grunnkrets-level flytting isn't published (privacy). *(SSB)*

## The "which houses will sell" estimate

Each property carries its latest known `tinglysingsdato`, plus
`salgssannsynlighet5aar` — a **modelled** conditional probability of a sale
during the next five years.

The model treats ownership duration as a Weibull-distributed time-to-sale:

- Building type sets the mean tenure through annual turnover baselines:
  enebolig 4.5%, tomannsbolig 5.5%, rekkehus 6%, leilighetsbygg 8%, other 5%.
- Time since `tinglysingsdato` sets the current tenure.
- The five-year result is conditional on the property not having sold again
  during that tenure. Shape `k=1.35` gives a moderately increasing sale hazard
  as tenure gets longer; tenure is capped at 60 years to avoid extreme effects
  from very old registry records.
- The two properties without a known date use the old type-only baseline.

This is a transparent ranking model, not a trained appraisal or claim that a
specific owner intends to sell.

### Personal-data scope

`registrert_kjoper` is the `To` value from the latest 1881 transfer record. It is
the registered buyer/transferee at that date, **not a verified current owner**.
Names are suppressed when a gnr/bnr maps ambiguously to sections or conflicting
latest records. Exact tinglyst **sale prices** and authoritative current-owner
records are not collected; those remain in the BankID-gated grunnbok. Keep the
generated files private. See `SALE_DATE_LOOKUP.md`.
