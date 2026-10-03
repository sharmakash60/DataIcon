"""Local Privacy-Preserving PII Detector.

Scans column names and samples data in memory using regex patterns and heuristics.
CRITICAL GUARANTEE:
Detected sensitive values are NEVER captured, stored, or exported.
Only classification indicators (e.g. is_pii=True, pii_types=['EMAIL']) are produced.
"""

from __future__ import annotations

import re
from typing import Sequence

import pandas as pd


# Regex patterns for common PII categories
PII_PATTERNS: dict[str, re.Pattern[str]] = {
    "EMAIL": re.compile(
        r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
    ),
    "PHONE": re.compile(
        r"^(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$"
    ),
    "SSN": re.compile(
        r"^\d{3}-\d{2}-\d{4}$"
    ),
    "CREDIT_CARD": re.compile(
        r"^(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})$"
    ),
    "IP_ADDRESS": re.compile(
        r"^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$"
    ),
}

# Column name heuristics (lowercase substrings)
COLUMN_NAME_HEURISTICS: dict[str, Sequence[str]] = {
    "EMAIL": ("email", "e_mail", "mail_addr"),
    "PHONE": ("phone", "telephone", "mobile", "cell", "fax"),
    "SSN": ("ssn", "social_security", "national_id", "tax_id", "sin_number"),
    "CREDIT_CARD": ("card_number", "credit_card", "cc_num", "pan", "cvv", "card_no"),
    "NAME": ("first_name", "last_name", "full_name", "surname", "given_name", "cust_name"),
    "IP_ADDRESS": ("ip_address", "client_ip", "remote_ip", "ipv4", "ipv6"),
    "ADDRESS": ("street_address", "postal_code", "zip_code", "address_line"),
}


def luhn_checksum(card_number_str: str) -> bool:
    """Validate credit card number using the Luhn algorithm."""
    digits = [int(c) for c in card_number_str if c.isdigit()]
    if len(digits) < 13 or len(digits) > 19:
        return False
    checksum = 0
    reverse_digits = digits[::-1]
    for i, d in enumerate(reverse_digits):
        if i % 2 == 1:
            doubled = d * 2
            checksum += doubled - 9 if doubled > 9 else doubled
        else:
            checksum += d
    return checksum % 10 == 0


def detect_column_pii(
    column_name: str,
    series: pd.Series,
    sample_size: int = 100,
    match_threshold: float = 0.10,
) -> tuple[bool, list[str]]:
    """Inspect a column name and its non-null values for PII patterns.
    
    Returns:
        (is_pii, list_of_detected_pii_types)
    """
    detected: set[str] = set()
    col_lower = column_name.lower().strip()

    # 1. Column name heuristic checks
    for pii_type, keywords in COLUMN_NAME_HEURISTICS.items():
        for kw in keywords:
            if kw in col_lower:
                detected.add(pii_type)
                break

    # 2. Content pattern inspection on non-null samples
    non_null_samples = series.dropna().astype(str).head(sample_size)
    total_samples = len(non_null_samples)

    if total_samples > 0:
        for pii_type, pattern in PII_PATTERNS.items():
            matches = 0
            for val in non_null_samples:
                clean_val = val.strip()
                if pii_type == "CREDIT_CARD":
                    # Strip dashes/spaces for credit card check
                    stripped_val = clean_val.replace("-", "").replace(" ", "")
                    if pattern.match(stripped_val) and luhn_checksum(stripped_val):
                        matches += 1
                elif pattern.match(clean_val):
                    matches += 1

            if matches / total_samples >= match_threshold:
                detected.add(pii_type)

    detected_list = sorted(detected)
    return len(detected_list) > 0, detected_list
