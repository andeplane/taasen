#!/usr/bin/env python3
"""
fetch_house.py — fetch public property and latest-transfer facts per house.

Four open sources, no login, no API key:
  1. Geonorge address API   -> address -> gnr/bnr + coordinates
  2. Eiendomsregisteret API  -> gnr/bnr -> building type, plot area, status
  3. 1881 Eiendomspriser     -> latest sale's tinglysingsdato + transferee
  4. Hjemla public unit API  -> size class (bruksareal range), build year,
                                floors, value estimate

The 1881 name is the latest registered buyer/transferee, not a verified current
owner. Exact sale price and exact bruksareal m² are not returned. See
SALE_DATE_LOOKUP.md.

Usage:
  python3 fetch_house.py "Mårveien 3"
  python3 fetch_house.py --street "Bergrådveien"      # whole street
  python3 fetch_house.py --gnrbnr 54 16
"""
import json, re, sys, argparse, urllib.parse, urllib.request

from sale_model import probability_band, sale_forecast

GEONORGE = "https://ws.geonorge.no/adresser/v1/sok"
REG = "https://eiendomsregisteret.kartverket.no/api"
SALE_SEARCH = "https://www.eiendomspriser.no/service/search"
HJEMLA = "https://consumer-service-hjemla-prod.propcloud.no/public/properties/unit"
KOMMUNE = "0301"  # Oslo
UA = {"User-Agent": "tasen-house-lookup/1.0"}

def _get(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30))

def latest_transfers(sales):
    """Return the newest transfer by (gnr, bnr), flagging conflicting names."""
    grouped = {}
    for sale in sales:
        key = (int(sale["Gnr"]), int(sale["Bnr"]))
        iso_date = sale.get("SortableDate", "")[:10] or None
        if not iso_date:
            continue
        name = (sale.get("To") or "").strip() or None
        current = grouped.get(key)
        if current is None or iso_date > current["tinglysingsdato"]:
            grouped[key] = {
                "tinglysingsdato": iso_date,
                "registrert_kjoper": name,
                "kjoper_tvetydig": False,
                "_names": {name} if name else set(),
            }
        elif iso_date == current["tinglysingsdato"] and name:
            current["_names"].add(name)

    for transfer in grouped.values():
        names = transfer.pop("_names")
        if len(names) > 1:
            transfer["registrert_kjoper"] = None
            transfer["kjoper_tvetydig"] = True
        elif names:
            transfer["registrert_kjoper"] = next(iter(names))
    return grouped


def sale_transfers_for_street(street, place="Oslo"):
    """Return latest registered transfer by (gnr, bnr) for one street."""
    query = f"{street}, {place}"
    params = urllib.parse.urlencode({
        "query": query, "sort": 1, "fromDate": "", "toDate": "",
        "placeFilter": query, "municipalities": "",
    })
    headers = {
        **UA,
        "Referer": "https://www.eiendomspriser.no/",
        "X-Requested-With": "XMLHttpRequest",
    }
    req = urllib.request.Request(f"{SALE_SEARCH}?{params}", headers=headers)
    sales = json.load(urllib.request.urlopen(req, timeout=30)).get("Properties", [])
    return latest_transfers(sales)

def _hjemla_slug(street, husnr):
    s = f"{street} {husnr}".lower()
    for a, b in (("å", "aa"), ("ø", "oe"), ("æ", "ae"), (" ", "-")):
        s = s.replace(a, b)
    return s

def hjemla_unit(street, husnr, postnr, municipality="oslo"):
    """Size class, build year, floors and value estimate from Hjemla's
    public unit API (no login). Returns {} when Hjemla has no unit."""
    q = urllib.parse.urlencode({"streetaddress": _hjemla_slug(street, husnr),
                                "postalCode": postnr})
    try:
        u = _get(f"{HJEMLA}/{municipality}?{q}").get("response") or {}
    except Exception:
        return {}
    est = u.get("estimate") or {}
    size = u.get("sizeRange")
    m = re.match(r"(over|under)\s+(\d+)", size or "")
    return {
        "bra_klasse": f"{size} m²" if size else None,
        "bra_min_m2": (0 if m.group(1) == "under" else int(m.group(2))) if m else None,
        "byggeaar": int(u["constructionDate"][:4]) if u.get("constructionDate") else None,
        "etasjer": u.get("numberOfFloors"),
        "estimat_min_mnok": round(est["estimateMin"] / 1e6, 1) if est.get("estimateMin") else None,
        "estimat_maks_mnok": round(est["estimateMax"] / 1e6, 1) if est.get("estimateMax") else None,
    }

# ---------- 1. address -> gnr/bnr + coords ----------
def find_addresses(street, kommune=KOMMUNE, house=None):
    """Return address rows for a street (optionally one house number)."""
    q = urllib.parse.urlencode({"adressenavn": street, "kommunenummer": kommune,
                                "treffPerSide": "1000"})
    out = []
    for a in _get(f"{GEONORGE}?{q}").get("adresser", []):
        if house is not None and str(a["nummer"]) + (a.get("bokstav") or "") != str(house):
            continue
        rp = a.get("representasjonspunkt") or {}
        out.append({"adresse": a["adressetekst"], "gate": a["adressenavn"],
                    "husnr": f'{a["nummer"]}{a.get("bokstav") or ""}',
                    "gnr": a["gardsnummer"], "bnr": a["bruksnummer"],
                    "postnr": a.get("postnummer"), "poststed": a.get("poststed"),
                    "lat": rp.get("lat"), "lon": rp.get("lon")})
    return out

# ---------- 2. gnr/bnr -> property facts ----------
_CODE = lambda t: int(m.group(1)) if (m := re.match(r"\s*(\d+)", t or "")) else None
def _klasse(bygg):
    res = [c for c in (_CODE(t) for t in bygg) if c and 111 <= c <= 146]
    if not res: return "Ukjent/annet"
    c = min(res)
    return ("Enebolig" if c in (111,112,113) else
            "Tomannsbolig" if c in (121,122,123) else
            "Rekkehus/småhus" if c in (131,133,135,136) else
            "Leilighetsbygg" if 141 <= c <= 146 else "Annet bolig")

def property_facts(gnr, bnr, kommune=KOMMUNE):
    """Non-personal facts for one matrikkelenhet (gnr/bnr)."""
    m = _get(f"{REG}/matrikkelenhet/{kommune}/{gnr}/{bnr}")
    mid = m.get("matrikkelenhetId")
    try:
        bygg = _get(f"{REG}/bygningerForMatrikkelenhet/{mid}")
    except Exception:
        bygg = []
    byggtyper = [b.get("type") for b in bygg if b.get("type")]
    k = m.get("koordinater") or {}
    return {
        "gnr": gnr, "bnr": bnr, "matrikkelenhetId": mid,
        "boligtype": _klasse(byggtyper), "bygningstyper": byggtyper,
        "tomteareal_m2": m.get("oppgittAreal"),
        "tinglyst": m.get("isTinglyst"), "seksjonert": m.get("isSeksjonert"),
        "festegrunn": m.get("isFestegrunner"),
        "koord_utm33": {"x": k.get("xpos"), "y": k.get("ypos"), "epsg": k.get("epsgKode")},
    }

# ---------- convenience: full record per house ----------
def fetch_house(street, house=None, kommune=KOMMUNE):
    try:
        sale_transfers = sale_transfers_for_street(street)
    except Exception:
        sale_transfers = {}
    out = []
    for a in find_addresses(street, kommune, house):
        try:
            a.update(property_facts(a["gnr"], a["bnr"], kommune))
            a.update(hjemla_unit(a["gate"], a["husnr"], a["postnr"]))
            transfer = dict(sale_transfers.get((a["gnr"], a["bnr"]), {}))
            if a["seksjonert"] and transfer.get("registrert_kjoper"):
                transfer["registrert_kjoper"] = None
                transfer["kjoper_tvetydig"] = True
            a.update(transfer)
            a.setdefault("tinglysingsdato", None)
            a.setdefault("registrert_kjoper", None)
            a.setdefault("kjoper_tvetydig", False)
            a["salgssannsynlighet5aar"], a["eiertid_aar"] = sale_forecast(
                a["boligtype"], a["tinglysingsdato"]
            )
            a["salgsband"] = probability_band(a["salgssannsynlighet5aar"])
        except Exception as e:
            a["error"] = str(e)
        out.append(a)
    return out

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("query", nargs="?", help='e.g. "Mårveien 3"')
    ap.add_argument("--street")
    ap.add_argument("--gnrbnr", nargs=2, type=int, metavar=("GNR", "BNR"))
    ap.add_argument("--kommune", default=KOMMUNE)
    args = ap.parse_args()

    if args.gnrbnr:
        res = property_facts(args.gnrbnr[0], args.gnrbnr[1], args.kommune)
    elif args.street:
        res = fetch_house(args.street, None, args.kommune)
    elif args.query:
        m = re.match(r"^(.*?)(\s+(\d+\w?))?$", args.query.strip())
        res = fetch_house(m.group(1).strip(), m.group(3), args.kommune)
    else:
        ap.error("give an address, --street, or --gnrbnr")
    print(json.dumps(res, ensure_ascii=False, indent=2))
