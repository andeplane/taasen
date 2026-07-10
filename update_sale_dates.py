#!/usr/bin/env python3
"""Refresh the latest 1881 transfer in all generated data files."""

import json
import re
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

from sale_model import (
    ANNUAL_TURNOVER,
    MAX_MODEL_TENURE_YEARS,
    WEIBULL_SHAPE,
    probability_band,
    sale_forecast,
)
from sync_dataset import STREETS

ROOT = Path(__file__).parent
SEARCH_URL = "https://www.eiendomspriser.no/service/search"
HEADERS = {
    "User-Agent": "tasen-house-lookup/1.0",
    "Referer": "https://www.eiendomspriser.no/",
    "X-Requested-With": "XMLHttpRequest",
}


def latest_transfers(sales):
    """Return newest transfer by gnr/bnr, suppressing conflicting latest names."""
    transfers = {}
    for sale in sales:
        key = (int(sale["Gnr"]), int(sale["Bnr"]))
        iso_date = sale.get("SortableDate", "")[:10]
        if not iso_date:
            continue
        name = (sale.get("To") or "").strip() or None
        current = transfers.get(key)
        if current is None or iso_date > current["tinglysingsdato"]:
            transfers[key] = {
                "tinglysingsdato": iso_date,
                "registrert_kjoper": name,
                "kjoper_tvetydig": False,
                "_names": {name} if name else set(),
            }
        elif iso_date == current["tinglysingsdato"] and name:
            current["_names"].add(name)

    for transfer in transfers.values():
        names = transfer.pop("_names")
        if len(names) > 1:
            transfer["registrert_kjoper"] = None
            transfer["kjoper_tvetydig"] = True
        elif names:
            transfer["registrert_kjoper"] = next(iter(names))
    return transfers


def fetch_transfers():
    """Fetch and retain the newest transfer for each gnr/bnr."""
    transfers = {}
    for street in STREETS:
        query = f"{street}, Oslo"
        params = urllib.parse.urlencode({
            "query": query,
            "sort": 1,
            "fromDate": "",
            "toDate": "",
            "placeFilter": query,
            "municipalities": "",
        })
        request = urllib.request.Request(f"{SEARCH_URL}?{params}", headers=HEADERS)
        with urllib.request.urlopen(request, timeout=30) as response:
            sales = json.load(response).get("Properties", [])
        for key, candidate in latest_transfers(sales).items():
            current = transfers.get(key)
            if current is None or candidate["tinglysingsdato"] > current["tinglysingsdato"]:
                transfers[key] = candidate
            elif candidate["tinglysingsdato"] == current["tinglysingsdato"]:
                names = {
                    value for value in (
                        current.get("registrert_kjoper"),
                        candidate.get("registrert_kjoper"),
                    ) if value
                }
                if len(names) > 1 or current["kjoper_tvetydig"] or candidate["kjoper_tvetydig"]:
                    current["registrert_kjoper"] = None
                    current["kjoper_tvetydig"] = True
                elif names:
                    current["registrert_kjoper"] = next(iter(names))
    return transfers


def property_key(gnrbnr):
    gnr, bnr = gnrbnr.split("/")
    return int(gnr), int(bnr)


def safe_transfer(transfers, key, sectioned_keys):
    transfer = dict(transfers.get(key, {}))
    if key in sectioned_keys and transfer.get("registrert_kjoper"):
        transfer["registrert_kjoper"] = None
        transfer["kjoper_tvetydig"] = True
    return transfer


def update_geojson(transfers, sectioned_keys, as_of):
    path = ROOT / "houses.geojson"
    data = json.loads(path.read_text())
    for feature in data["features"]:
        props = feature["properties"]
        transfer = safe_transfer(transfers, property_key(props["gnrbnr"]), sectioned_keys)
        props["tinglysingsdato"] = transfer.get("tinglysingsdato")
        props["registrert_kjoper"] = transfer.get("registrert_kjoper")
        props["kjoper_tvetydig"] = transfer.get("kjoper_tvetydig", False)
        props["p5"], props["eiertid_aar"] = sale_forecast(
            props["boligtype"], props["tinglysingsdato"], as_of
        )
        props["salgsband"] = probability_band(props["p5"])
    path.write_text(json.dumps(data, ensure_ascii=False))
    return data


def update_data_js(geojson):
    path = ROOT / "data.js"
    path.write_text(
        "const HOUSES = "
        + json.dumps(geojson, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )


def update_graph_json(transfers, sectioned_keys, as_of):
    path = ROOT / "houses.json"
    data = json.loads(path.read_text())
    data["meta"]["sources"]["latest_transfer"] = (
        "1881 Eiendomspriser public search service "
        "(latest tinglysingsdato and registered buyer/transferee)"
    )
    data["meta"]["sources"].pop("sale_date", None)
    data["meta"]["counts"]["properties_with_sale_date"] = len(transfers)
    data["meta"]["counts"]["properties_with_registered_transferee"] = sum(
        bool(safe_transfer(transfers, key, sectioned_keys).get("registrert_kjoper"))
        for key in transfers
    )
    data["meta"]["sale_probability_model"] = {
        "version": "tenure-weibull-v1",
        "as_of": as_of.isoformat(),
        "horizon_years": 5,
        "weibull_shape": WEIBULL_SHAPE,
        "maximum_modeled_tenure_years": MAX_MODEL_TENURE_YEARS,
        "annual_turnover_by_property_type": ANNUAL_TURNOVER,
    }
    data["meta"]["privacy"] = "Contains personal names; intended for private/local use."
    data["meta"]["not_included"] = (
        "Exact sale prices and authoritative current-owner records are not collected."
    )
    for node in data["nodes"]:
        if node.get("type") == "Property":
            transfer = safe_transfer(
                transfers, (node["gnr"], node["bnr"]), sectioned_keys
            )
            node["tinglysingsdato"] = transfer.get("tinglysingsdato")
            node["registrert_kjoper"] = transfer.get("registrert_kjoper")
            node["kjoper_tvetydig"] = transfer.get("kjoper_tvetydig", False)
            probability, tenure = sale_forecast(
                node["boligtype"], node["tinglysingsdato"], as_of
            )
            node["eiertid_aar"] = tenure
            node["salgssannsynlighet5aar"] = probability
            node["salgsband"] = probability_band(probability)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")


def update_turtle(transfers, sectioned_keys, as_of):
    path = ROOT / "houses.ttl"
    text = re.sub(
        r"^    ex:(?:tinglysingsdato|eiertidAar|registrertKjoper|kjoperTvetydig) .*?\n",
        "",
        path.read_text(),
        flags=re.M,
    )
    block_pattern = re.compile(
        r"(^ex:prop-0301-(\d+)-(\d+) a ex:Property ;\n.*?)(?=\n\n)",
        re.M | re.S,
    )

    def add_date(match):
        block = match.group(1)
        key = (int(match.group(2)), int(match.group(3)))
        transfer = safe_transfer(transfers, key, sectioned_keys)
        iso_date = transfer.get("tinglysingsdato")
        type_match = re.search(r'    ex:boligtype "(.*?)" ;', block)
        boligtype = type_match.group(1) if type_match else "Ukjent/annet"
        probability, tenure = sale_forecast(boligtype, iso_date, as_of)
        block = re.sub(
            r'    ex:salgsband ".*?" ;',
            f'    ex:salgsband "{probability_band(probability)}" ;',
            block,
        )
        block = re.sub(
            r"    ex:salgssannsynlighet5aar [\d.]+ ;",
            f"    ex:salgssannsynlighet5aar {probability} ;",
            block,
        )
        if not iso_date:
            return block
        transfer_lines = ""
        if transfer.get("registrert_kjoper"):
            transfer_lines += (
                f"    ex:registrertKjoper "
                f"{json.dumps(transfer['registrert_kjoper'], ensure_ascii=False)} ;\n"
            )
        if transfer.get("kjoper_tvetydig"):
            transfer_lines += "    ex:kjoperTvetydig true ;\n"
        return block.replace(
            "    ex:tinglyst true ;\n",
            f'    ex:tinglyst true ;\n'
            f'    ex:tinglysingsdato "{iso_date}"^^xsd:date ;\n'
            f"{transfer_lines}"
            f"    ex:eiertidAar {tenure} ;\n",
        )

    path.write_text(block_pattern.sub(add_date, text))


def update_markdown(transfers, sectioned_keys):
    path = ROOT / "houses.md"
    lines = path.read_text().splitlines()
    in_table = False
    gnr_index = None
    date_index = None
    buyer_index = None
    output = []
    for line in lines:
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if line.startswith("|") and "Address" in cells and "gnr/bnr" in cells:
            gnr_index = cells.index("gnr/bnr")
            date_index = cells.index("Tinglysingsdato")
            if "Registrert kjøper" in cells:
                buyer_index = cells.index("Registrert kjøper")
            else:
                cells.append("Registrert kjøper")
                buyer_index = len(cells) - 1
            output.append("| " + " | ".join(cells) + " |")
            in_table = True
            continue
        if in_table and all(re.fullmatch(r":?-+:?", cell) for cell in cells):
            if len(cells) <= buyer_index:
                cells.append("---")
            output.append("|" + "|".join(cells) + "|")
            continue
        if (
            in_table
            and gnr_index is not None
            and len(cells) > gnr_index
            and re.fullmatch(r"\d+/\d+", cells[gnr_index])
        ):
            transfer = safe_transfer(
                transfers, property_key(cells[gnr_index]), sectioned_keys
            )
            cells[date_index] = transfer.get("tinglysingsdato") or "–"
            buyer = transfer.get("registrert_kjoper") or (
                "Tvetydig – seksjonert/flere treff"
                if transfer.get("kjoper_tvetydig")
                else "–"
            )
            if len(cells) <= buyer_index:
                cells.append(buyer)
            else:
                cells[buyer_index] = buyer
            output.append("| " + " | ".join(cells) + " |")
            continue
        if in_table and not line.startswith("|"):
            in_table = False
        output.append(line)
    path.write_text("\n".join(output) + "\n")


def main():
    as_of = date.today()
    all_transfers = fetch_transfers()
    existing_geojson = json.loads((ROOT / "houses.geojson").read_text())
    property_keys = {
        property_key(feature["properties"]["gnrbnr"])
        for feature in existing_geojson["features"]
    }
    graph = json.loads((ROOT / "houses.json").read_text())
    sectioned_keys = {
        (node["gnr"], node["bnr"])
        for node in graph["nodes"]
        if node.get("type") == "Property" and node.get("seksjonert")
    }
    transfers = {
        key: value for key, value in all_transfers.items() if key in property_keys
    }
    geojson = update_geojson(transfers, sectioned_keys, as_of)
    update_data_js(geojson)
    update_graph_json(transfers, sectioned_keys, as_of)
    update_turtle(transfers, sectioned_keys, as_of)
    update_markdown(transfers, sectioned_keys)
    names = sum(
        bool(safe_transfer(transfers, key, sectioned_keys).get("registrert_kjoper"))
        for key in transfers
    )
    print(
        f"Updated {len(transfers)} of {len(property_keys)} properties; "
        f"{names} with an unambiguous transferee ({date.today()})"
    )


if __name__ == "__main__":
    main()
