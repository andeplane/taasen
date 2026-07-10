#!/usr/bin/env python3
"""Synchronize the complete configured street list with the local dataset."""

import argparse
import json
import re
import sys
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path

from fetch_house import (
    find_addresses,
    hjemla_unit,
    property_facts,
    sale_transfers_for_street,
)
from sale_model import (
    ANNUAL_TURNOVER,
    MAX_MODEL_TENURE_YEARS,
    WEIBULL_SHAPE,
    probability_band,
    sale_forecast,
)

ROOT = Path(__file__).parent
KOMMUNE = "0301"
STREETS = (
    "Tåsen terrasse",
    "Tåsenveien",
    "Mårveien",
    "Heierstuveien",
    "Bergrådveien",
    "Havnabakken",
    "Østhornveien",
    "Nypeveien",
    "Langåsveien",
    "Åmotveien",
    "Korsvollbråtan",
    "Maurstien",
    "Morenestien",
    "Rabakken",
    "Hansegata",
    "Skibakkeveien",
    "Korsvollbakken",
    "Carl Kjelsens vei",
    "Jansbergveien",
    "Nilserudkleiva",
    "Bålveien",
    "Barliveien",
    "Langmyrveien",
    "Steingardveien",
    "Nordbergveien",
    "Kongleveien",
    "Nils Bays vei",
    "Tirilveien",
    "Lersolveien",
    "Dyrlandsveien",
    "Staudeveien",
    "Nordbergbakken",
    "Bregneveien",
    "Gunnar Schjelderups vei",
    "Havnehagan",
    "Gunnar Johnsons vei",
    "Holsteinveien",
    "Rødbråtbakken",
    "Krokusveien",
    "Øvre Langås vei",
)
TYPE_ORDER = (
    "Enebolig",
    "Tomannsbolig",
    "Rekkehus/småhus",
    "Leilighetsbygg",
    "Ukjent/annet",
)


def natural_key(value):
    return [
        int(part) if part.isdigit() else part.casefold()
        for part in re.split(r"(\d+)", str(value))
    ]


def retry(label, function, attempts=3):
    for attempt in range(1, attempts + 1):
        try:
            return function()
        except Exception as exc:
            if attempt == attempts:
                raise RuntimeError(f"{label}: {exc}") from exc
            time.sleep(attempt)


def load_existing():
    geojson = json.loads((ROOT / "houses.geojson").read_text())
    graph = json.loads((ROOT / "houses.json").read_text())
    property_nodes = {
        (node["gnr"], node["bnr"]): node
        for node in graph["nodes"]
        if node.get("type") == "Property"
    }
    building_nodes = {
        node["id"]: node["bygningstype"]
        for node in graph["nodes"]
        if node.get("type") == "Building"
    }
    building_types = defaultdict(list)
    for edge in graph["edges"]:
        if edge["rel"] != "HAS_BUILDING":
            continue
        match = re.fullmatch(r"matrikkel:0301-(\d+)-(\d+)", edge["from"])
        if match and edge["to"] in building_nodes:
            key = (int(match.group(1)), int(match.group(2)))
            building_type = building_nodes[edge["to"]]
            if building_type not in building_types[key]:
                building_types[key].append(building_type)

    addresses = []
    for feature in geojson["features"]:
        props = feature["properties"]
        gnr, bnr = (int(value) for value in props["gnrbnr"].split("/"))
        addresses.append(
            {
                "adresse": props["adresse"],
                "gate": props["gate"],
                "husnr": props["husnr"],
                "gnr": gnr,
                "bnr": bnr,
                "postnr": props.get("postnr"),
                "poststed": next(
                    (
                        node.get("poststed")
                        for node in graph["nodes"]
                        if node.get("id") == f"addr:{props['adresse']}"
                    ),
                    None,
                ),
                "lat": feature["geometry"]["coordinates"][1],
                "lon": feature["geometry"]["coordinates"][0],
                "bra_klasse": props.get("bra_klasse"),
                "bra_min_m2": props.get("bra_min_m2"),
                "byggeaar": props.get("byggeaar"),
                "etasjer": props.get("etasjer"),
                "estimat_min_mnok": props.get("estimat_min_mnok"),
                "estimat_maks_mnok": props.get("estimat_maks_mnok"),
            }
        )

    properties = {}
    for key, node in property_nodes.items():
        properties[key] = {
            "gnr": node["gnr"],
            "bnr": node["bnr"],
            "matrikkelenhetId": node.get("matrikkelenhetId"),
            "boligtype": node.get("boligtype", "Ukjent/annet"),
            "bygningstyper": building_types[key],
            "tomteareal_m2": node.get("tomteareal_m2"),
            "tinglyst": node.get("tinglyst"),
            "seksjonert": node.get("seksjonert"),
            "festegrunn": node.get("festegrunn"),
            "tinglysingsdato": node.get("tinglysingsdato"),
            "registrert_kjoper": node.get("registrert_kjoper"),
            "kjoper_tvetydig": node.get("kjoper_tvetydig", False),
        }
    return addresses, properties


def fetch_missing_addresses(streets, addresses, properties, workers, dry_run=False):
    existing_addresses = {row["adresse"] for row in addresses}
    discovered = []
    for street in streets:
        rows = retry(street, lambda street=street: find_addresses(street))
        official = {row["gate"] for row in rows}
        if not rows:
            raise RuntimeError(f"{street}: Geonorge returned no Oslo addresses")
        if official != {street}:
            raise RuntimeError(
                f"{street}: expected exact official name, got {sorted(official)}"
            )
        rows.sort(key=lambda row: natural_key(row["husnr"]))
        new_rows = [row for row in rows if row["adresse"] not in existing_addresses]
        print(f"{street}: {len(rows)} addresses ({len(new_rows)} new)")
        discovered.extend(new_rows)
        existing_addresses.update(row["adresse"] for row in new_rows)

    print(f"Delta: {len(discovered)} missing addresses")
    if dry_run or not discovered:
        return len(discovered)

    missing_properties = sorted(
        {
            (row["gnr"], row["bnr"])
            for row in discovered
            if (row["gnr"], row["bnr"]) not in properties
        }
    )
    failures = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(
                retry,
                f"property {gnr}/{bnr}",
                lambda gnr=gnr, bnr=bnr: property_facts(gnr, bnr),
            ): (gnr, bnr)
            for gnr, bnr in missing_properties
        }
        for future in as_completed(futures):
            key = futures[future]
            try:
                properties[key] = future.result()
            except Exception as exc:
                failures.append(str(exc))
    if failures:
        raise RuntimeError("Property collection failed:\n" + "\n".join(failures))

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(
                hjemla_unit,
                row["gate"],
                row["husnr"],
                row["postnr"],
            ): row
            for row in discovered
        }
        for future in as_completed(futures):
            futures[future].update(future.result())

    transfers = {}
    for street in streets:
        street_transfers = retry(
            f"transfers for {street}",
            lambda street=street: sale_transfers_for_street(street),
        )
        for key, candidate in street_transfers.items():
            current = transfers.get(key)
            if current is None or candidate["tinglysingsdato"] > current["tinglysingsdato"]:
                transfers[key] = candidate
            elif candidate["tinglysingsdato"] == current["tinglysingsdato"]:
                names = {
                    value
                    for value in (
                        current.get("registrert_kjoper"),
                        candidate.get("registrert_kjoper"),
                    )
                    if value
                }
                if (
                    len(names) > 1
                    or current.get("kjoper_tvetydig")
                    or candidate.get("kjoper_tvetydig")
                ):
                    current["registrert_kjoper"] = None
                    current["kjoper_tvetydig"] = True
                elif names:
                    current["registrert_kjoper"] = next(iter(names))

    new_keys = {(row["gnr"], row["bnr"]) for row in discovered}
    for key in new_keys:
        transfer = dict(transfers.get(key, {}))
        if properties[key].get("seksjonert") and transfer.get("registrert_kjoper"):
            transfer["registrert_kjoper"] = None
            transfer["kjoper_tvetydig"] = True
        properties[key].update(
            {
                "tinglysingsdato": transfer.get("tinglysingsdato"),
                "registrert_kjoper": transfer.get("registrert_kjoper"),
                "kjoper_tvetydig": transfer.get("kjoper_tvetydig", False),
            }
        )
    addresses.extend(discovered)
    return len(discovered)


def ordered_data(addresses, properties, street_order):
    order = {street: index for index, street in enumerate(street_order)}
    addresses.sort(
        key=lambda row: (
            order.get(row["gate"], len(order)),
            natural_key(row["husnr"]),
        )
    )
    counts = Counter((row["gnr"], row["bnr"]) for row in addresses)
    as_of = date.today()
    for key, prop in properties.items():
        probability, tenure = sale_forecast(
            prop["boligtype"], prop.get("tinglysingsdato"), as_of
        )
        prop["antall_adresser"] = counts[key]
        prop["salgssannsynlighet5aar"] = probability
        prop["eiertid_aar"] = tenure
        prop["salgsband"] = probability_band(probability)
    return as_of


def make_geojson(addresses, properties):
    features = []
    for row in addresses:
        key = (row["gnr"], row["bnr"])
        prop = properties[key]
        props = {
            "adresse": row["adresse"],
            "gate": row["gate"],
            "husnr": row["husnr"],
            "postnr": row.get("postnr"),
            "boligtype": prop["boligtype"],
            "tomt_m2": prop.get("tomteareal_m2"),
            "gnrbnr": f"{row['gnr']}/{row['bnr']}",
            "tinglyst": prop.get("tinglyst"),
            "enheter": prop["antall_adresser"],
            "p5": prop["salgssannsynlighet5aar"],
            "salgsband": prop["salgsband"],
            "tinglysingsdato": prop.get("tinglysingsdato"),
            "eiertid_aar": prop["eiertid_aar"],
            "bra_klasse": row.get("bra_klasse"),
            "bra_min_m2": row.get("bra_min_m2"),
            "byggeaar": row.get("byggeaar"),
            "etasjer": row.get("etasjer"),
            "estimat_min_mnok": row.get("estimat_min_mnok"),
            "estimat_maks_mnok": row.get("estimat_maks_mnok"),
            "registrert_kjoper": prop.get("registrert_kjoper"),
            "kjoper_tvetydig": prop.get("kjoper_tvetydig", False),
        }
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [row["lon"], row["lat"]],
                },
                "properties": props,
            }
        )
    return {"type": "FeatureCollection", "features": features}


def building_id(key, building_type):
    return f"bygg:matrikkel:0301-{key[0]}-{key[1]}:{building_type}"


def make_graph(addresses, properties, as_of):
    address_keys = {(row["gnr"], row["bnr"]) for row in addresses}
    properties = {key: value for key, value in properties.items() if key in address_keys}
    nodes = []
    edges = []
    emitted_properties = set()
    emitted_buildings = set()

    for row in addresses:
        key = (row["gnr"], row["bnr"])
        prop_id = f"matrikkel:0301-{key[0]}-{key[1]}"
        addr_id = f"addr:{row['adresse']}"
        nodes.append(
            {
                "id": addr_id,
                "type": "Address",
                "street": row["gate"],
                "number": row["husnr"],
                "postnr": row.get("postnr"),
                "poststed": row.get("poststed"),
                "bra_klasse": row.get("bra_klasse"),
                "bra_min_m2": row.get("bra_min_m2"),
                "byggeaar": row.get("byggeaar"),
                "etasjer": row.get("etasjer"),
                "estimat_min_mnok": row.get("estimat_min_mnok"),
                "estimat_maks_mnok": row.get("estimat_maks_mnok"),
            }
        )
        edges.append({"from": addr_id, "to": prop_id, "rel": "LOCATED_ON"})
        if key in emitted_properties:
            continue
        emitted_properties.add(key)
        prop = properties[key]
        nodes.append(
            {
                "id": prop_id,
                "type": "Property",
                "gnr": key[0],
                "bnr": key[1],
                "matrikkelenhetId": prop.get("matrikkelenhetId"),
                "boligtype": prop["boligtype"],
                "tomteareal_m2": prop.get("tomteareal_m2"),
                "tinglyst": prop.get("tinglyst"),
                "seksjonert": prop.get("seksjonert"),
                "festegrunn": prop.get("festegrunn"),
                "antall_adresser": prop["antall_adresser"],
                "tinglysingsdato": prop.get("tinglysingsdato"),
                "eiertid_aar": prop["eiertid_aar"],
                "salgssannsynlighet5aar": prop["salgssannsynlighet5aar"],
                "salgsband": prop["salgsband"],
                "registrert_kjoper": prop.get("registrert_kjoper"),
                "kjoper_tvetydig": prop.get("kjoper_tvetydig", False),
            }
        )
        for kind in dict.fromkeys(prop.get("bygningstyper", [])):
            node_id = building_id(key, kind)
            if node_id not in emitted_buildings:
                nodes.append(
                    {"id": node_id, "type": "Building", "bygningstype": kind}
                )
                emitted_buildings.add(node_id)
            edges.append({"from": prop_id, "to": node_id, "rel": "HAS_BUILDING"})

    prop_values = list(properties.values())
    meta = {
        "title": "Tåsen and Korsvoll house knowledge graph",
        "area": "Tåsen/Korsvoll, bydel Nordre Aker, Oslo (kommune 0301)",
        "generated": as_of.isoformat(),
        "sources": {
            "addresses": (
                "Kartverket/Geonorge open address API (ws.geonorge.no/adresser)"
            ),
            "property": (
                "Kartverket Eiendomsregisteret public JSON API "
                "(matrikkel/bygninger) - no login"
            ),
            "unit_size_year_estimate": (
                "Hjemla (Schibsted) public unit API "
                "(consumer-service-hjemla-prod.propcloud.no) - size class "
                "(bruksareal range), build year, floors, value estimate - no login"
            ),
            "latest_transfer": (
                "1881 Eiendomspriser public search service "
                "(latest tinglysingsdato and registered buyer/transferee)"
            ),
        },
        "counts": {
            "addresses": len(addresses),
            "properties": len(properties),
            "properties_with_sale_date": sum(
                bool(prop.get("tinglysingsdato")) for prop in prop_values
            ),
            "addresses_with_size_class": sum(
                bool(row.get("bra_klasse")) for row in addresses
            ),
            "properties_with_registered_transferee": sum(
                bool(prop.get("registrert_kjoper")) for prop in prop_values
            ),
        },
        "not_included": (
            "Exact sale prices and authoritative current-owner records are not collected."
        ),
        "sale_probability_model": {
            "version": "tenure-weibull-v1",
            "as_of": as_of.isoformat(),
            "horizon_years": 5,
            "weibull_shape": WEIBULL_SHAPE,
            "maximum_modeled_tenure_years": MAX_MODEL_TENURE_YEARS,
            "annual_turnover_by_property_type": ANNUAL_TURNOVER,
        },
        "privacy": "Contains personal names; intended for private/local use.",
    }
    return {"meta": meta, "nodes": nodes, "edges": edges}


def ttl_literal(value):
    return json.dumps(value, ensure_ascii=False)


def ttl_name(value):
    return re.sub(r"[^\w-]+", "-", value, flags=re.UNICODE).strip("-")


def make_turtle(addresses, properties):
    lines = [
        "@prefix ex: <https://tasen.local/kg#> .",
        "@prefix geo: <http://www.opengis.net/ont/geosparql#> .",
        "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .",
        "@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .",
        "",
        'ex:Address a rdfs:Class ; rdfs:label "Address" .',
        'ex:Building a rdfs:Class ; rdfs:label "Building" .',
        'ex:Property a rdfs:Class ; rdfs:label "Property (matrikkelenhet)" .',
        "",
    ]
    emitted_properties = set()
    for row in addresses:
        key = (row["gnr"], row["bnr"])
        addr = f"ex:addr-{ttl_name(row['adresse'])}"
        prop = f"ex:prop-0301-{key[0]}-{key[1]}"
        fields = [
            f"{addr} a ex:Address",
            f"    rdfs:label {ttl_literal(row['adresse'])}",
            f"    geo:lat {row['lat']}",
            f"    geo:long {row['lon']}",
            f"    ex:gate {ttl_literal(row['gate'])}",
            f"    ex:husnummer {ttl_literal(row['husnr'])}",
            f"    ex:locatedOn {prop}",
        ]
        optional = (
            ("postnummer", row.get("postnr"), ttl_literal),
            ("bruksarealKlasse", row.get("bra_klasse"), ttl_literal),
            ("bruksarealMin", row.get("bra_min_m2"), str),
            ("byggeaar", row.get("byggeaar"), str),
            ("etasjer", row.get("etasjer"), str),
            ("verdiestimatMinMnok", row.get("estimat_min_mnok"), str),
            ("verdiestimatMaksMnok", row.get("estimat_maks_mnok"), str),
        )
        fields.extend(
            f"    ex:{name} {formatter(value)}"
            for name, value, formatter in optional
            if value is not None
        )
        lines.extend([" ;\n".join(fields) + " .", ""])

        if key in emitted_properties:
            continue
        emitted_properties.add(key)
        data = properties[key]
        prop_fields = [
            f"{prop} a ex:Property",
            f'    rdfs:label "Matrikkel 0301/{key[0]}/{key[1]}"',
            f"    ex:antallAdresser {data['antall_adresser']}",
            f"    ex:bnr {key[1]}",
            f"    ex:boligtype {ttl_literal(data['boligtype'])}",
            f"    ex:gnr {key[0]}",
            f"    ex:salgsband {ttl_literal(data['salgsband'])}",
            f"    ex:salgssannsynlighet5aar {data['salgssannsynlighet5aar']}",
        ]
        if data.get("seksjonert") is not None:
            prop_fields.append(
                f"    ex:seksjonert {str(data['seksjonert']).lower()}"
            )
        if data.get("tinglyst") is not None:
            prop_fields.append(f"    ex:tinglyst {str(data['tinglyst']).lower()}")
        if data.get("tinglysingsdato"):
            prop_fields.append(
                f"    ex:tinglysingsdato "
                f"{ttl_literal(data['tinglysingsdato'])}^^xsd:date"
            )
        if data.get("registrert_kjoper"):
            prop_fields.append(
                f"    ex:registrertKjoper {ttl_literal(data['registrert_kjoper'])}"
            )
        if data.get("kjoper_tvetydig"):
            prop_fields.append("    ex:kjoperTvetydig true")
        if data.get("eiertid_aar") is not None:
            prop_fields.append(f"    ex:eiertidAar {data['eiertid_aar']}")
        if data.get("tomteareal_m2") is not None:
            prop_fields.append(f"    ex:tomteareal {data['tomteareal_m2']}")
        for kind in dict.fromkeys(data.get("bygningstyper", [])):
            code = re.match(r"\s*(\d+)", kind)
            if code:
                prop_fields.append(
                    f"    ex:hasBuilding {prop}-bygg-{code.group(1)}"
                )
        lines.extend([" ;\n".join(prop_fields) + " .", ""])
        for kind in dict.fromkeys(data.get("bygningstyper", [])):
            code = re.match(r"\s*(\d+)", kind)
            if code:
                lines.extend(
                    [
                        f"{prop}-bygg-{code.group(1)} a ex:Building ;",
                        f"    rdfs:label {ttl_literal(kind)} .",
                        "",
                    ]
                )
    return "\n".join(lines)


def display(value, digits=None):
    if value is None:
        return "–"
    if digits is not None and isinstance(value, (int, float)):
        return f"{value:.{digits}f}"
    return str(value)


def make_markdown(addresses, properties, as_of, street_order):
    used_keys = {(row["gnr"], row["bnr"]) for row in addresses}
    props = {key: value for key, value in properties.items() if key in used_keys}
    mix = Counter(prop["boligtype"] for prop in props.values())
    lines = [
        "# Tåsen/Korsvoll — property knowledge graph",
        "",
        f"Area: **bydel Nordre Aker, Oslo** (kommune 0301). Generated {as_of}.",
        "",
        "Data are property-level, from Kartverket's open registers and 1881",
        "Eiendomspriser (latest tinglysingsdato and registered buyer/transferee — no",
        "login). The dataset contains personal names and is for **private/local use**.",
        "",
        "> `registrert_kjoper` is the latest 1881 `To` value, not a verified current",
        "> owner. Ambiguous sectioned-property names are suppressed. Exact tinglyst sale",
        "> prices are not collected.",
        "",
        "## Summary",
        "",
        f"- **{len(addresses)} address points** map to **{len(props)} distinct properties**.",
        "- Housing mix (by distinct property): "
        + ", ".join(f"**{mix[kind]} {kind}**" for kind in TYPE_ORDER)
        + ".",
        "",
        "| Street | Addresses | Properties | Enebolig | Tomannsbolig | "
        "Rekkehus/småhus | Leilighetsbygg | Annet |",
        "|---|--:|--:|--:|--:|--:|--:|--:|",
    ]
    by_street = defaultdict(list)
    for row in addresses:
        by_street[row["gate"]].append(row)
    for street in street_order:
        rows = by_street.get(street, [])
        if not rows:
            continue
        keys = {(row["gnr"], row["bnr"]) for row in rows}
        kinds = Counter(properties[key]["boligtype"] for key in keys)
        lines.append(
            f"| {street} | {len(rows)} | {len(keys)} | "
            f"{kinds['Enebolig']} | {kinds['Tomannsbolig']} | "
            f"{kinds['Rekkehus/småhus']} | {kinds['Leilighetsbygg']} | "
            f"{kinds['Ukjent/annet']} |"
        )
    lines.extend(
        [
            "",
            "## Per-address detail",
            "",
        ]
    )
    for street in street_order:
        rows = by_street.get(street, [])
        if not rows:
            continue
        lines.extend(
            [
                f"### {street}",
                "",
                "| Address | Type | Tomt m² | Størrelse | Byggeår | gnr/bnr | "
                "Post | Tinglysingsdato | Registrert kjøper |",
                "|---|---|--:|---|--:|---|---|---|---|",
            ]
        )
        for row in rows:
            key = (row["gnr"], row["bnr"])
            prop = properties[key]
            buyer = prop.get("registrert_kjoper")
            if not buyer and prop.get("kjoper_tvetydig"):
                buyer = "Tvetydig – seksjonert/flere treff"
            lines.append(
                f"| {row['husnr']} | {prop['boligtype']} | "
                f"{display(prop.get('tomteareal_m2'), 0)} | "
                f"{display(row.get('bra_klasse'))} | "
                f"{display(row.get('byggeaar'))} | {key[0]}/{key[1]} | "
                f"{display(row.get('postnr'))} | "
                f"{display(prop.get('tinglysingsdato'))} | {display(buyer)} |"
            )
        lines.append("")
    return "\n".join(lines)


def write_outputs(addresses, properties, as_of, street_order):
    geojson = make_geojson(addresses, properties)
    graph = make_graph(addresses, properties, as_of)
    (ROOT / "houses.geojson").write_text(
        json.dumps(geojson, ensure_ascii=False) + "\n"
    )
    (ROOT / "data.js").write_text(
        "const HOUSES = "
        + json.dumps(geojson, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    (ROOT / "houses.json").write_text(
        json.dumps(graph, ensure_ascii=False, indent=1) + "\n"
    )
    (ROOT / "houses.ttl").write_text(make_turtle(addresses, properties))
    (ROOT / "houses.md").write_text(
        make_markdown(addresses, properties, as_of, street_order)
    )


def main():
    parser = argparse.ArgumentParser(
        description="Fetch addresses missing from the configured STREETS list."
    )
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="measure and print the address delta without fetching or writing",
    )
    args = parser.parse_args()

    addresses, properties = load_existing()
    existing_order = list(dict.fromkeys(row["gate"] for row in addresses))
    delta = fetch_missing_addresses(
        STREETS, addresses, properties, args.workers, args.dry_run
    )
    if args.dry_run:
        return
    if not delta:
        print("Dataset is already up to date; no files written")
        return
    street_order = list(STREETS) + [
        street for street in existing_order if street not in STREETS
    ]
    as_of = ordered_data(addresses, properties, street_order)
    write_outputs(addresses, properties, as_of, street_order)
    print(
        f"Wrote {len(addresses)} addresses and "
        f"{len({(row['gnr'], row['bnr']) for row in addresses})} properties"
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(exc, file=sys.stderr)
        raise
