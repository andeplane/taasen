# App summary: Tåsen, Korsvoll and Nordberg property explorer

## Purpose and scope

This app is a local property-data explorer for selected residential streets in
Tåsen, Korsvoll and Nordberg, in Oslo's Nordre Aker borough. Its purpose is to
make the area's housing stock easier to understand when considering where to
buy. Instead of looking up homes one at a time across several services, the app
collects public address, property, building, transfer and valuation signals into
one searchable map and table.

The current dataset covers every registered address on 40 configured streets:
1,803 address points representing 1,374 distinct matrikkel properties. It is
primarily a low-density residential dataset, containing 692 detached houses,
408 semi-detached houses and 204 row houses/small houses. There are only 19
apartment-building properties in the covered area. Several addresses can belong
to the same property, which is why the address count is higher than the
property count.

The browser app is implemented in `index.html` and reads its data from
`data.js`. It uses Leaflet for the map and Tabulator for the table, both loaded
from public CDNs. No application server or database is required: opening
`index.html` locally is enough, although internet access is needed for map
tiles and the third-party JavaScript libraries.

## What the explorer shows

Every address appears both as a map marker and as a row in the table. The
explorer shows the official address, housing type, plot area, size class,
construction year, estimated value range, matrikkel identifier, latest known
transfer date, registered buyer/transferee and a modelled five-year sale
outlook. Clicking a table row moves the map to the property, while clicking a
marker opens a detailed popup and selects the corresponding row.

The interface can be filtered by street, housing type, sale-outlook band,
minimum plot size and minimum size class. Free-text search matches addresses,
matrikkel identifiers and registered buyer names. Markers can be coloured by
housing type or by sale-outlook band. Summary tiles calculate totals and
averages directly from the loaded data, and the map automatically fits its
initial view to all included properties.

The five-year sale outlook is a ranking aid rather than a prediction that a
specific home will be listed. It uses a transparent Weibull time-to-sale model.
Housing type supplies a baseline turnover rate, while the number of years since
the latest transfer supplies the current ownership duration. Detached houses
use the slowest baseline turnover and apartment buildings the fastest. The
result is displayed as a probability and grouped into low, medium and higher
bands. Very old ownership periods are capped at 60 years within the model to
avoid unrealistic extremes.

## Data sources and coverage

The dataset combines four sources that can be queried without authentication:

1. **Geonorge address API** supplies the complete official address list for each
   configured Oslo street, including house number, postcode, coordinates and
   `gnr/bnr`.
2. **Kartverket Eiendomsregisteret** supplies matrikkel and building facts such
   as property identifiers, plot area, registration status, sectioning and
   building-type codes.
3. **1881 Eiendomspriser** supplies the latest published transfer date and its
   registered buyer/transferee field.
4. **Hjemla** supplies a size range, construction year, number of floors and a
   modelled value-estimate range where a dwelling unit can be matched.

Coverage varies by source. All 1,803 addresses have official Geonorge
coordinates and matrikkel links. Hjemla data are available for 1,716 addresses.
The latest transfer date is available for 1,337 of 1,374 properties, and 1,029
properties have an unambiguous registered buyer/transferee name.

Exact floor area is not available in the public sources for arbitrary homes.
The app therefore stores Hjemla's broad bruksareal classes, such as “over
150 m²”, rather than presenting an invented exact figure. Exact sale prices and
authoritative current-owner records are also intentionally excluded.

## Data model and generated formats

`houses.geojson` is the canonical map-oriented representation. It contains one
GeoJSON point feature per address, with property and model fields attached as
feature properties. `data.js` contains exactly the same feature collection
assigned to the `HOUSES` JavaScript constant so the local browser app can load
it without cross-origin or local-file fetch restrictions.

The same information is also published in three alternative forms:

- `houses.json` is a node-and-edge knowledge graph. Address nodes connect to
  distinct property nodes, which connect to building-type nodes.
- `houses.ttl` is an RDF/Turtle knowledge graph with approximately 50,500
  triples.
- `houses.md` is a human-readable summary with per-street statistics and
  per-address tables.

These representations are regenerated together so that counts, identifiers,
transfer fields and forecasts remain consistent.

## Extending and refreshing the dataset

The canonical street list lives in the `STREETS` tuple in `sync_dataset.py`.
To extend coverage, add an official Oslo street name to that tuple and run:

```bash
python3 sync_dataset.py
```

The script first queries Geonorge for every configured street and compares the
complete official address lists with the addresses already stored locally. It
prints the delta, fetches only missing addresses and properties, and then
regenerates all synchronized output files. A non-mutating check is available
with:

```bash
python3 sync_dataset.py --dry-run
```

Transfer dates and registered transferee values can be refreshed independently
for all existing properties by running `python3 update_sale_dates.py`.
`fetch_house.py` remains useful for inspecting one address, one street or one
`gnr/bnr` directly.

## Privacy and interpretation

The generated files contain personal names and are intended for private, local
use. The `registrert_kjoper` value is the transferee published for the latest
known 1881 transfer record; it is not presented as a verified current owner.
Names are suppressed when a sectioned property or conflicting records make it
unsafe to associate one person with one property. Missing values remain null
rather than being guessed from nearby homes.

The app should therefore be used as an exploratory decision-support tool. It is
well suited to comparing streets, housing stock, plot sizes, approximate size
classes and long-term turnover signals. It is not a substitute for a property
prospectus, an appraisal, an official grunnbok extract or confirmation of a
person's current ownership.
