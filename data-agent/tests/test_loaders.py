"""Tests for CSV, Parquet, and Excel loaders and validation."""

from pathlib import Path

import pandas as pd
import pytest

from datapilot_agent.loaders import (
    DatasetValidationError,
    load_csv,
    load_dataset,
    load_excel,
    load_parquet,
)


def test_load_csv_delimiters(tmp_path: Path):
    # Standard comma
    csv1 = tmp_path / "comma.csv"
    csv1.write_text("id,val,category\n1,10.5,A\n2,20.0,B\n", encoding="utf-8")
    df1 = load_csv(csv1)
    assert len(df1) == 2
    assert list(df1.columns) == ["id", "val", "category"]

    # Semicolon
    csv2 = tmp_path / "semi.csv"
    csv2.write_text("col_a;col_b\n100;apple\n200;banana\n", encoding="utf-8")
    df2 = load_csv(csv2)
    assert len(df2) == 2
    assert "col_a" in df2.columns

    # Tab separated
    csv3 = tmp_path / "tab.csv"
    csv3.write_text("x\ty\tz\n1\t2\t3\n", encoding="utf-8")
    df3 = load_csv(csv3)
    assert len(df3) == 1
    assert "x" in df3.columns


def test_load_parquet(tmp_path: Path):
    pq_path = tmp_path / "test.parquet"
    original_df = pd.DataFrame({"id": [1, 2, 3], "metric": [4.5, 5.5, 6.5]})
    original_df.to_parquet(pq_path, engine="pyarrow")

    loaded_df = load_parquet(pq_path)
    assert len(loaded_df) == 3
    assert list(loaded_df.columns) == ["id", "metric"]


def test_load_excel(tmp_path: Path):
    xlsx_path = tmp_path / "test.xlsx"
    original_df = pd.DataFrame({"product": ["A", "B"], "price": [99, 149]})
    original_df.to_excel(xlsx_path, index=False, engine="openpyxl")

    loaded_df = load_excel(xlsx_path)
    assert len(loaded_df) == 2
    assert list(loaded_df.columns) == ["product", "price"]


def test_validation_empty_file(tmp_path: Path):
    empty_file = tmp_path / "empty.csv"
    empty_file.write_text("", encoding="utf-8")

    with pytest.raises(DatasetValidationError, match="empty"):
        load_csv(empty_file)


def test_validation_non_existent(tmp_path: Path):
    with pytest.raises(DatasetValidationError, match="does not exist"):
        load_dataset(tmp_path / "ghost.parquet", "parquet")


def test_validation_file_too_large(tmp_path: Path):
    f = tmp_path / "large.csv"
    f.write_text("a,b\n1,2\n3,4\n", encoding="utf-8")
    with pytest.raises(DatasetValidationError, match="exceeds maximum"):
        load_csv(f, max_size_bytes=5)  # set tiny 5 byte limit
