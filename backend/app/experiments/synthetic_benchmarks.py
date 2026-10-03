"""Synthetic benchmark dataset generators for DataPilot Experiment Engine.

Provides realistic classification and regression benchmarks with:
- Natural identifiers (to verify dropping ID/leakage columns)
- Constant / zero-variance columns (to verify constant pruning)
- Mixed numerical, categorical, and datetime columns
- Realistic missing value patterns
- Non-linear relationships and realistic class distributions
"""

from __future__ import annotations

from typing import Tuple
import numpy as np
import pandas as pd


def generate_churn_benchmark(
    n_samples: int = 500,
    random_state: int = 42,
) -> pd.DataFrame:
    """Generate realistic customer churn benchmark dataset (binary classification).

    Target: 'churn' (0 or 1, ~26% churn rate)
    Expected leakage/ID columns to drop: 'customer_id'
    Expected zero-variance columns to drop: 'constant_tenant_flag'
    """
    rng = np.random.default_rng(random_state)

    customer_ids = [f"CUST_{i:06d}" for i in range(1, n_samples + 1)]

    # Dates over 2 years
    base_timestamp = pd.Timestamp("2023-01-01").value
    max_timestamp = pd.Timestamp("2024-12-31").value
    random_timestamps = rng.integers(base_timestamp, max_timestamp, size=n_samples)
    signup_dates = pd.to_datetime(random_timestamps).strftime("%Y-%m-%d")

    tenure_months = rng.integers(1, 72, size=n_samples)
    monthly_charges = np.round(rng.uniform(19.99, 119.99, size=n_samples), 2)
    total_charges = np.round(tenure_months * monthly_charges + rng.normal(0, 15, size=n_samples), 2)
    total_charges = np.maximum(total_charges, monthly_charges)

    contract_types = rng.choice(
        ["Month-to-month", "One year", "Two year"],
        size=n_samples,
        p=[0.55, 0.25, 0.20],
    )
    payment_methods = rng.choice(
        ["Electronic check", "Mailed check", "Bank transfer", "Credit card"],
        size=n_samples,
        p=[0.35, 0.25, 0.20, 0.20],
    )
    internet_services = rng.choice(
        ["DSL", "Fiber optic", "No"],
        size=n_samples,
        p=[0.40, 0.45, 0.15],
    )
    tech_support = rng.choice(["Yes", "No"], size=n_samples, p=[0.30, 0.70])
    paperless_billing = rng.choice(["Yes", "No"], size=n_samples, p=[0.60, 0.40])
    senior_citizen = rng.choice([0, 1], size=n_samples, p=[0.85, 0.15])

    # Introduce realistic missing values in total_charges and monthly_charges
    missing_mask_total = rng.uniform(0, 1, size=n_samples) < 0.04
    total_charges[missing_mask_total] = np.nan
    missing_mask_monthly = rng.uniform(0, 1, size=n_samples) < 0.03
    monthly_charges[missing_mask_monthly] = np.nan

    # Constant feature
    constant_col = ["TENANT_CORP_GLOBAL"] * n_samples

    # Compute realistic churn log-odds
    # Month-to-month contracts, high monthly charges, low tenure, electronic check increase churn
    contract_risk = np.where(contract_types == "Month-to-month", 1.2, -0.9)
    tenure_risk = -0.04 * tenure_months
    monthly_risk = 0.02 * (np.nan_to_num(monthly_charges, nan=65.0) - 65.0)
    fiber_risk = np.where(internet_services == "Fiber optic", 0.5, 0.0)
    tech_support_buffer = np.where(tech_support == "Yes", -0.7, 0.3)

    log_odds = -1.2 + contract_risk + tenure_risk + monthly_risk + fiber_risk + tech_support_buffer
    probs = 1.0 / (1.0 + np.exp(-log_odds))
    churn = (rng.uniform(0, 1, size=n_samples) < probs).astype(int)

    df = pd.DataFrame({
        "customer_id": customer_ids,
        "signup_date": signup_dates,
        "tenure_months": tenure_months,
        "monthly_charges": monthly_charges,
        "total_charges": total_charges,
        "contract_type": contract_types,
        "payment_method": payment_methods,
        "internet_service": internet_services,
        "tech_support": tech_support,
        "paperless_billing": paperless_billing,
        "senior_citizen": senior_citizen,
        "constant_tenant_flag": constant_col,
        "churn": churn,
    })
    return df


def generate_sales_benchmark(
    n_samples: int = 500,
    random_state: int = 42,
) -> pd.DataFrame:
    """Generate realistic retail store weekly sales benchmark dataset (continuous regression).

    Target: 'weekly_sales' (float, $5,000 - $85,000)
    Expected leakage/ID columns to drop: 'store_code'
    Expected zero-variance columns to drop: 'zero_variance_benchmark'
    """
    rng = np.random.default_rng(random_state)

    store_codes = [f"STR_{i:05d}" for i in range(1001, 1001 + n_samples)]

    base_timestamp = pd.Timestamp("2023-01-01").value
    max_timestamp = pd.Timestamp("2024-12-31").value
    random_timestamps = rng.integers(base_timestamp, max_timestamp, size=n_samples)
    recorded_dates = pd.to_datetime(random_timestamps).strftime("%Y-%m-%d")

    store_sqft = np.round(rng.uniform(800.0, 6500.0, size=n_samples), 1)
    foot_traffic = rng.integers(150, 4500, size=n_samples).astype(float)
    competitor_distance_km = np.round(rng.uniform(0.1, 18.0, size=n_samples), 2)

    store_format = rng.choice(
        ["Superstore", "Mall", "Suburban", "Express"],
        size=n_samples,
        p=[0.30, 0.30, 0.25, 0.15],
    )
    region = rng.choice(
        ["North", "South", "East", "West"],
        size=n_samples,
        p=[0.25, 0.25, 0.25, 0.25],
    )
    has_promotion = rng.choice(["Yes", "No"], size=n_samples, p=[0.40, 0.60])
    avg_basket_size = np.round(rng.uniform(15.0, 110.0, size=n_samples), 2)

    # Missing values in foot_traffic and competitor_distance
    missing_traffic = rng.uniform(0, 1, size=n_samples) < 0.04
    foot_traffic[missing_traffic] = np.nan
    missing_comp = rng.uniform(0, 1, size=n_samples) < 0.03
    competitor_distance_km[missing_comp] = np.nan

    constant_col = [100.0] * n_samples

    # Compute realistic weekly sales
    clean_traffic = np.nan_to_num(foot_traffic, nan=1500.0)
    clean_comp = np.nan_to_num(competitor_distance_km, nan=5.0)

    format_multiplier = np.where(
        store_format == "Superstore",
        1.35,
        np.where(store_format == "Mall", 1.15, np.where(store_format == "Suburban", 1.0, 0.8)),
    )
    promo_boost = np.where(has_promotion == "Yes", 4500.0, 0.0)

    base_sales = (
        8000.0
        + (store_sqft * 4.2)
        + (clean_traffic * 5.8)
        + (avg_basket_size * 60.0)
        - (clean_comp * 120.0)
        + promo_boost
    ) * format_multiplier

    noise = rng.normal(0, 2000.0, size=n_samples)
    weekly_sales = np.round(np.maximum(base_sales + noise, 3500.0), 2)

    df = pd.DataFrame({
        "store_code": store_codes,
        "recorded_date": recorded_dates,
        "store_sqft": store_sqft,
        "foot_traffic": foot_traffic,
        "competitor_distance_km": competitor_distance_km,
        "store_format": store_format,
        "region": region,
        "has_promotion": has_promotion,
        "avg_basket_size": avg_basket_size,
        "zero_variance_benchmark": constant_col,
        "weekly_sales": weekly_sales,
    })
    return df


def get_synthetic_benchmark(
    name: str = "customer_churn",
    n_samples: int = 500,
    random_state: int = 42,
) -> Tuple[pd.DataFrame, str, str]:
    """Retrieve synthetic benchmark DataFrame, target column, and default problem type.

    Returns: (df, target_column, problem_type)
    """
    normalized = name.lower().strip()
    if "churn" in normalized or "classif" in normalized:
        return generate_churn_benchmark(n_samples=n_samples, random_state=random_state), "churn", "classification"
    elif "sale" in normalized or "regress" in normalized or "store" in normalized or "price" in normalized:
        return generate_sales_benchmark(n_samples=n_samples, random_state=random_state), "weekly_sales", "regression"
    else:
        # Default to churn benchmark
        return generate_churn_benchmark(n_samples=n_samples, random_state=random_state), "churn", "classification"
