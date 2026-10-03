"""Dataset Loaders and Format-Specific Readers for CSV, Parquet, and Excel.

All loading is executed strictly in local process memory on the client machine.
Provides robust dataset validation, format sniffing, and size protection.
"""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Literal

import pandas as pd


class DatasetValidationError(Exception):
    """Raised when a local dataset fails integrity or validation checks."""


def validate_file_preconditions(path: Path, max_size_bytes: int = 500 * 1024 * 1024) -> None:
    """Validate file existence, readability, size limits, and non-emptiness."""
    if not path.exists():
        raise DatasetValidationError(f"Dataset file does not exist: {path}")
    if not path.is_file():
        raise DatasetValidationError(f"Path is not a regular file: {path}")

    file_size = path.stat().st_size
    if file_size == 0:
        raise DatasetValidationError("Dataset file is empty (0 bytes)")
    if file_size > max_size_bytes:
        raise DatasetValidationError(
            f"Dataset file size ({file_size} bytes) exceeds maximum configured limit ({max_size_bytes} bytes)"
        )


def sniff_csv_delimiter(path: Path) -> str:
    """Sniff CSV delimiter (comma, semicolon, tab, pipe) safely with fallback."""
    common_delimiters = [",", "\t", ";", "|"]
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            sample = f.read(8192)
            if not sample.strip():
                return ","
            sniffer = csv.Sniffer()
            dialect = sniffer.sniff(sample, delimiters=",\t;|")
            return dialect.delimiter
    except Exception:
        # Fallback: count candidate delimiters in first line
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                first_line = f.readline()
                counts = {d: first_line.count(d) for d in common_delimiters}
                best = max(counts, key=counts.get)
                return best if counts[best] > 0 else ","
        except Exception:
            return ","


def load_csv(path: Path, max_size_bytes: int = 500 * 1024 * 1024) -> pd.DataFrame:
    """Safely load and validate a local CSV file."""
    validate_file_preconditions(path, max_size_bytes)
    sep = sniff_csv_delimiter(path)

    encodings = ["utf-8", "utf-8-sig", "latin1", "cp1252"]
    last_err: Exception | None = None

    for enc in encodings:
        try:
            df = pd.read_csv(
                path,
                sep=sep,
                encoding=enc,
                low_memory=False,
                on_bad_lines="skip",
            )
            if df.empty and len(df.columns) == 0:
                raise DatasetValidationError("CSV contains no columns or data")
            return df
        except UnicodeDecodeError as err:
            last_err = err
            continue
        except Exception as err:
            raise DatasetValidationError(f"Failed to read CSV: {err}") from err

    raise DatasetValidationError(f"Could not decode CSV with supported encodings: {last_err}")


def load_parquet(path: Path, max_size_bytes: int = 500 * 1024 * 1024) -> pd.DataFrame:
    """Safely load and validate a local Parquet file."""
    validate_file_preconditions(path, max_size_bytes)
    try:
        df = pd.read_parquet(path, engine="pyarrow")
        if df.empty and len(df.columns) == 0:
            raise DatasetValidationError("Parquet file contains no columns or data")
        return df
    except Exception as err:
        raise DatasetValidationError(f"Failed to read Parquet dataset: {err}") from err


def load_excel(path: Path, max_size_bytes: int = 500 * 1024 * 1024) -> pd.DataFrame:
    """Safely load and validate a local Excel (.xlsx, .xls) file."""
    validate_file_preconditions(path, max_size_bytes)
    try:
        # Default to the first sheet
        df = pd.read_excel(path, engine="openpyxl")
        if df.empty and len(df.columns) == 0:
            raise DatasetValidationError("Excel spreadsheet contains no columns or data")
        return df
    except Exception as err:
        raise DatasetValidationError(f"Failed to read Excel dataset: {err}") from err


def load_dataset(
    path: Path,
    dataset_format: Literal["csv", "parquet", "excel"],
    max_size_bytes: int = 500 * 1024 * 1024,
) -> pd.DataFrame:
    """Unified loader dispatch for supported dataset formats."""
    if dataset_format == "csv":
        return load_csv(path, max_size_bytes)
    elif dataset_format == "parquet":
        return load_parquet(path, max_size_bytes)
    elif dataset_format == "excel":
        return load_excel(path, max_size_bytes)
    else:
        raise DatasetValidationError(f"Unsupported dataset format: {dataset_format}")
