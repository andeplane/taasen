# Dataset maintenance

This repository maps residential properties on selected streets in Oslo. When
the user supplies street names, extend the dataset to cover every registered
house number on those streets—not just example addresses.

## Collection workflow

Add requested streets to the ordered `STREETS` tuple in `sync_dataset.py`, then
run that script. It compares every configured street with local address data,
collects only missing records, and regenerates every synchronized output. Its
workflow is:

1. Use the official Geonorge address API through `find_addresses()` in
   `fetch_house.py`. Use Oslo municipality `0301` and the official street name.
2. Collect all available Kartverket, 1881 Eiendomspriser, and Hjemla fields.
3. Keep separate address records, but reuse/deduplicate property facts for
   addresses sharing a `gnr/bnr`.
4. Suppress ambiguous registered-buyer names for sectioned properties, following
   the existing behavior in `fetch_house.py`.
5. Recalculate `salgssannsynlighet5aar`, `eiertid_aar`, and `salgsband` with
   `sale_model.py`.
6. Preserve unavailable values as null. Never infer house facts from nearby
   properties or silently omit addresses because one upstream source failed.

If streets are provided in an image, transcribe only clearly readable labels.
Confirm the interpreted list when the intended roads or map boundary are
ambiguous.

## Files that must stay synchronized

- `houses.geojson`: canonical map features
- `data.js`: the same GeoJSON assigned to `const HOUSES`
- `houses.json`: address/property/building graph and metadata counts
- `houses.ttl`: RDF representation
- `houses.md`: summary and per-address tables
- `README.md`: coverage description and totals
- `update_sale_dates.py`: `STREETS` must include every covered street

Do not treat `update_sale_dates.py` as a street-ingestion script: it refreshes
transfer data for properties already present in the generated files.

## Verification

- Compare the collected address count per street with Geonorge's complete
  response.
- Check for duplicate address IDs and unintended duplicate `gnr/bnr` property
  nodes.
- Validate that `data.js` and `houses.geojson` contain the same feature
  collection.
- Parse both JSON files after generation and run relevant Python checks.
- Review metadata counts and all human-readable totals before handing off.

The generated files contain personal names and are intended for private/local
use. Do not add exact sale prices or claim that `registrert_kjoper` is the
verified current owner.
