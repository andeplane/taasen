"""Transparent tenure-based model for five-year property sale probability."""

import math
from datetime import date

ANNUAL_TURNOVER = {
    "Enebolig": 0.045,
    "Tomannsbolig": 0.055,
    "Rekkehus/småhus": 0.060,
    "Leilighetsbygg": 0.080,
    "Ukjent/annet": 0.050,
}
WEIBULL_SHAPE = 1.35
MAX_MODEL_TENURE_YEARS = 60


def sale_forecast(boligtype, tinglysingsdato, as_of=None):
    """Return (conditional five-year probability, current tenure in years)."""
    annual_rate = ANNUAL_TURNOVER.get(boligtype, 0.05)
    if not tinglysingsdato:
        probability = 1 - (1 - annual_rate) ** 5
        return round(probability, 3), None

    as_of = as_of or date.today()
    tenure = max(
        0, (as_of - date.fromisoformat(tinglysingsdato)).days / 365.2425
    )
    model_tenure = min(tenure, MAX_MODEL_TENURE_YEARS)

    # Choose the scale so the Weibull mean equals the type's implied tenure.
    mean_tenure = 1 / annual_rate
    scale = mean_tenure / math.gamma(1 + 1 / WEIBULL_SHAPE)
    cumulative_hazard = (
        ((model_tenure + 5) / scale) ** WEIBULL_SHAPE
        - (model_tenure / scale) ** WEIBULL_SHAPE
    )
    probability = 1 - math.exp(-cumulative_hazard)
    return round(probability, 3), round(tenure, 1)


def probability_band(probability):
    if probability < 0.20:
        return "Lav"
    if probability < 0.35:
        return "Middels"
    return "Høyere"
