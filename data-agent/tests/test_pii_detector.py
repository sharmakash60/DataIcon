"""Tests for local privacy-preserving PII detector."""

import pandas as pd

from datapilot_agent.pii_detector import detect_column_pii


def test_detect_email():
    s = pd.Series(["user1@company.com", "jane.doe@domain.org", "test@test.co"])
    is_pii, types = detect_column_pii("contact_info", s)
    assert is_pii is True
    assert "EMAIL" in types


def test_detect_phone():
    s = pd.Series(["+1-555-123-4567", "(555) 987-6543", "555-444-3333"])
    is_pii, types = detect_column_pii("cust_phone", s)
    assert is_pii is True
    assert "PHONE" in types


def test_detect_ssn():
    s = pd.Series(["123-45-6789", "987-65-4321", "111-22-3333"])
    is_pii, types = detect_column_pii("national_id_number", s)
    assert is_pii is True
    assert "SSN" in types


def test_detect_credit_card():
    # Valid Visa number pattern with valid Luhn
    # 4012888888881881
    s = pd.Series(["4012888888881881", "4012-8888-8888-1881"])
    is_pii, types = detect_column_pii("payment_method", s)
    assert is_pii is True
    assert "CREDIT_CARD" in types


def test_detect_ip():
    s = pd.Series(["192.168.1.1", "10.0.0.5", "172.16.254.1"])
    is_pii, types = detect_column_pii("client_ip", s)
    assert is_pii is True
    assert "IP_ADDRESS" in types


def test_non_pii_numeric():
    s = pd.Series([10.5, 20.3, 30.1, 40.8])
    is_pii, types = detect_column_pii("revenue", s)
    assert is_pii is False
    assert len(types) == 0


def test_non_pii_categorical():
    s = pd.Series(["Electronics", "Home & Kitchen", "Books", "Clothing"])
    is_pii, types = detect_column_pii("product_category", s)
    assert is_pii is False
    assert len(types) == 0
