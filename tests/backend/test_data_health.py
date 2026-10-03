"""
Unit and integration tests for the Data Health Center and Client Data Plane Analyzer.

Verifies:
1. Dataset overview (rows, columns, memory, semantic types)
2. Completeness (missing values, missing ratios, synchronized patterns)
3. Duplicates (duplicate rows, duplicate identifiers, near duplicates)
4. Data validity (sentinels like -999, impossible ages, unexpected ranges)
5. Feature quality (constant features, near-constant, high cardinality, unique IDs, PII)
6. Outlier analysis (Tukey's IQR bounds, outlier counts, percentiles)
7. Correlation analysis (Pearson correlations, multicollinearity alerts)
8. Target analysis (class distribution, class imbalance, statistics, important feature relationships)
9. Leakage detection (target leakage, temporal leakage, identifier leakage, post-outcome features, train/test contamination)
10. Transparent Health Scoring (additive deduction formula, letter grades, deduction logs)
11. Issue schema (severity, evidence, explanation, potential impact, recommended action)
12. Privacy guarantee (zero raw records returned or exported)
13. Fast API route integration (get_health, analyze_health)
"""

import uuid
from app.datasets.health_analyzer import DataHealthAnalyzer, generate_benchmark_dataset


class TestDataHealthAnalyzerUnit:
    """Unit tests for the Client Data Plane DataHealthAnalyzer."""

    def test_dimension_1_overview_and_types(self):
        records = [
            {"id": 1, "age": 25, "city": "NY", "is_member": True, "created_at": "2024-01-10", "notes": "Long text " * 10},
            {"id": 2, "age": 30, "city": "SF", "is_member": False, "created_at": "2024-01-11", "notes": "Another long note " * 5},
        ]
        analyzer = DataHealthAnalyzer(records)
        report = analyzer.analyze()

        overview = report["overview"]
        assert overview["rows"] == 2
        assert overview["columns"] == 6
        assert overview["memory_usage_bytes"] > 0
        assert "age" in overview["numerical_columns"]
        assert "city" in overview["categorical_columns"]
        assert "is_member" in overview["boolean_columns"]
        assert "created_at" in overview["datetime_columns"]
        assert "notes" in overview["text_columns"]

    def test_dimension_2_completeness_and_patterns(self):
        records = [
            {"col_a": 10, "col_b": None, "col_c": None},
            {"col_a": 20, "col_b": None, "col_c": None},
            {"col_a": 30, "col_b": "val", "col_c": 100},
            {"col_a": 40, "col_b": "val", "col_c": 200},
        ]
        analyzer = DataHealthAnalyzer(records)
        report = analyzer.analyze()

        comp = report["completeness"]
        assert comp["total_missing_values"] == 4
        assert comp["overall_missing_percentage"] == 33.33
        assert len(comp["columns_with_missing"]) == 2

        # Synchronized missingness pattern between col_b and col_c
        patterns = comp["missing_patterns"]
        assert len(patterns) >= 1
        assert "col_b" in patterns[0]["columns_involved"]
        assert "col_c" in patterns[0]["columns_involved"]

    def test_dimension_3_duplicates_and_identifiers(self):
        records = [
            {"user_id": "U1", "val": 10},
            {"user_id": "U1", "val": 10},  # Exact duplicate row & ID collision
            {"user_id": "U2", "val": 20},
            {"user_id": "U3", "val": 30},
        ]
        analyzer = DataHealthAnalyzer(records)
        report = analyzer.analyze()

        dups = report["duplicates"]
        assert dups["duplicate_rows_count"] == 1
        assert dups["duplicate_rows_percentage"] == 25.0
        assert len(dups["duplicate_identifiers"]) >= 1
        assert dups["duplicate_identifiers"][0]["column"] == "user_id"

    def test_dimension_4_data_validity_sentinels_and_bounds(self):
        records = [
            {"age": 25, "income": 50000, "tenure": 10, "prob": 0.5},
            {"age": -5, "income": -100, "tenure": -999, "prob": 1.5},  # Sentinels & impossible values
            {"age": 145, "income": 60000, "tenure": 12, "prob": 0.8},
        ]
        analyzer = DataHealthAnalyzer(records)
        report = analyzer.analyze()

        val = report["validity"]
        # Sentinels
        sentinels = [iv for iv in val["invalid_values"] if iv["issue_type"] == "sentinel_placeholder"]
        assert len(sentinels) >= 1
        assert sentinels[0]["column"] == "tenure"

        # Impossible values
        impossible = val["impossible_values"]
        age_violations = [iv for iv in impossible if "Human Age" in iv["rule_violated"]]
        assert len(age_violations) >= 1
        assert age_violations[0]["count"] == 2  # -5 and 145

        # Unexpected ranges
        ranges = val["unexpected_ranges"]
        assert len(ranges) >= 1
        assert ranges[0]["column"] == "prob"

    def test_dimension_5_feature_quality(self):
        records = [
            {"const_col": "A", "near_const": "X", "high_card": f"cat_{i}", "id_col": f"ID_{i}", "pii_col": f"user_{i}@corp.com"}
            for i in range(100)
        ]
        # Make near_const 98% X, 2% Y
        records[98]["near_const"] = "Y"
        records[99]["near_const"] = "Y"

        analyzer = DataHealthAnalyzer(records)
        report = analyzer.analyze()

        fq = report["feature_quality"]
        assert any(c["column"] == "const_col" for c in fq["constant_features"])
        assert any(c["column"] == "near_const" for c in fq["near_constant_features"])
        assert any(c["column"] == "high_card" for c in fq["high_cardinality_features"])
        assert any(c["column"] == "id_col" for c in fq["unique_identifiers"])
        assert any(c["column"] == "pii_col" for c in fq["suspicious_features"])

    def test_dimension_6_outlier_analysis(self):
        # 30 standard points + 2 extreme outliers
        records = [{"metric": float(i)} for i in range(30)]
        records.append({"metric": 5000.0})
        records.append({"metric": -5000.0})

        analyzer = DataHealthAnalyzer(records)
        report = analyzer.analyze()

        outliers = report["outliers"]["columns"]
        assert len(outliers) >= 1
        metric_outliers = outliers[0]
        assert metric_outliers["column"] == "metric"
        assert metric_outliers["outlier_count"] >= 2
        assert metric_outliers["lower_bound"] < 0
        assert metric_outliers["upper_bound"] < 5000

    def test_dimension_7_correlation_analysis(self):
        records = [{"x": float(i), "y": float(i * 2 + 1), "z": float(i % 3)} for i in range(50)]
        analyzer = DataHealthAnalyzer(records)
        report = analyzer.analyze()

        corr = report["correlations"]
        assert len(corr["matrix"]) >= 3
        # x and y have correlation 1.0 (near-perfect multicollinearity)
        suspicious = corr["suspicious_relationships"]
        assert len(suspicious) >= 1
        pair = suspicious[0]
        assert set([pair["feature_a"], pair["feature_b"]]) == {"x", "y"}
        assert abs(pair["pearson_r"]) > 0.99

    def test_dimension_8_target_analysis_classification(self):
        # 85 zeros and 15 ones (severe class imbalance)
        records = [
            {"feature1": i * 2, "churn": 1 if i < 15 else 0}
            for i in range(100)
        ]
        analyzer = DataHealthAnalyzer(records, target_column="churn")
        report = analyzer.analyze()

        tgt = report["target_analysis"]
        assert tgt is not None
        assert tgt["target_name"] == "churn"
        assert tgt["problem_type"] == "binary_classification"
        assert tgt["class_imbalance"]["is_imbalanced"] is True
        assert tgt["class_imbalance"]["majority_ratio"] == 85.0
        assert len(tgt["relationship_with_important_features"]) >= 1

    def test_dimension_9_leakage_detection(self):
        records = []
        for i in range(50):
            is_churn = 1 if i % 4 == 0 else 0
            rec = {
                "cust_id": f"ID-{i}",
                "target_dup": is_churn,  # Target leakage (r = 1.0)
                "churn": is_churn,
                "split": "train" if i < 35 else "test",
                "signup_date": "2038-05-01" if i == 0 else "2023-01-01",  # Future timestamp
            }
            if is_churn:
                rec["cancellation_reason"] = "Customer moved"  # Post-outcome feature
                rec["churn_date"] = "2023-05-10"
            else:
                rec["cancellation_reason"] = None
                rec["churn_date"] = None
            records.append(rec)

        # Cross-split entity contamination
        records[40]["cust_id"] = records[5]["cust_id"]

        analyzer = DataHealthAnalyzer(records, target_column="churn", datetime_column="signup_date")
        report = analyzer.analyze()

        leakage = report["leakage"]
        assert len(leakage["target_leakage"]) >= 1
        assert leakage["target_leakage"][0]["feature"] == "target_dup"

        assert len(leakage["post_outcome_features"]) >= 1
        assert any(f["feature"] == "cancellation_reason" for f in leakage["post_outcome_features"])

        assert len(leakage["temporal_leakage"]) >= 1
        assert leakage["temporal_leakage"][0]["column"] == "signup_date"

        assert len(leakage["train_test_contamination"]) >= 1
        assert leakage["train_test_contamination"][0]["identifier_column"] == "cust_id"

    def test_transparent_health_score_and_issue_registry(self):
        dataset = generate_benchmark_dataset(num_records=120)
        analyzer = DataHealthAnalyzer(dataset, target_column="churn", datetime_column="signup_date")
        report = analyzer.analyze()

        score = report["health_score"]
        assert 0 <= score["overall_score"] <= 100
        assert score["grade"] in ("A", "B", "C", "D", "F")
        assert score["base_score"] == 100
        assert len(score["deductions"]) > 0

        # Verify deduction points match policy
        for ded in score["deductions"]:
            assert ded["points_deducted"] in (15, 8, 4, 2)
            assert ded["reason"]

        # Verify every issue satisfies mandatory schema
        issues = report["issues"]
        assert len(issues) > 0
        for iss in issues:
            assert iss["id"].startswith("iss_")
            assert iss["severity"] in ("critical", "high", "medium", "low")
            assert iss["evidence"]
            assert iss["explanation"]
            assert iss["potential_impact"]
            assert iss["recommended_action"]

    def test_zero_raw_records_privacy_containment(self):
        dataset = generate_benchmark_dataset(num_records=50)
        analyzer = DataHealthAnalyzer(dataset, target_column="churn")
        report = analyzer.analyze()

        # Ensure no raw records or raw row matrices are present in output
        assert "records" not in report
        assert "rows_data" not in report
        assert "raw_data" not in report
        for col_stats in report["overview"]["numerical_columns"]:
            assert not isinstance(col_stats, list)


class TestDataHealthApiIntegration:
    """Integration tests for the Data Health Center HTTP endpoints."""

    def test_get_dataset_health_endpoint(self):
        from unittest.mock import MagicMock
        from fastapi.testclient import TestClient
        from app.main import create_app
        from app.db import get_db
        from app.auth.permissions import Permissions
        from app.auth.dependencies import require_project_permission, ProjectContext, TenantContext
        from app.models import Dataset, ProfileSummary, User, Organization, Project

        org_id = uuid.uuid4()
        project_id = uuid.uuid4()
        dataset_id = uuid.uuid4()
        user_id = uuid.uuid4()

        mock_user = MagicMock(spec=User)
        mock_user.id = user_id
        mock_user.email = "lead_ds@biotech.org"

        mock_org = MagicMock(spec=Organization)
        mock_org.id = org_id

        mock_proj = MagicMock(spec=Project)
        mock_proj.id = project_id
        mock_proj.organization_id = org_id

        mock_tenant = TenantContext(
            organization_id=org_id,
            user=mock_user,
            membership=MagicMock(),
            role="data_scientist",
            permissions={Permissions.DATASET_VIEW, Permissions.DATASET_PROFILE},
        )
        mock_project_ctx = ProjectContext(
            project_id=project_id,
            project=mock_proj,
            tenant=mock_tenant,
        )

        mock_dataset = MagicMock(spec=Dataset)
        mock_dataset.id = dataset_id
        mock_dataset.organization_id = org_id
        mock_dataset.project_id = project_id
        mock_dataset.approved_alias = "Clinical Cohort Benchmarks"

        mock_session = MagicMock()
        mock_session.scalar.side_effect = [mock_dataset, None]  # dataset found, no existing profile

        from app.datasets.router import dataset_view_permission, dataset_profile_permission

        app = create_app()
        app.dependency_overrides[get_db] = lambda: mock_session
        app.dependency_overrides[dataset_view_permission] = lambda: mock_project_ctx
        app.dependency_overrides[dataset_profile_permission] = lambda: mock_project_ctx

        client = TestClient(app)
        res = client.get(f"/api/v1/organizations/{org_id}/projects/{project_id}/datasets/{dataset_id}/health")
        assert res.status_code == 200, res.text
        data = res.json()

        assert data["dataset_id"] == str(dataset_id)
        assert data["dataset_alias"] == "Clinical Cohort Benchmarks"
        assert "overview" in data
        assert "completeness" in data
        assert "duplicates" in data
        assert "validity" in data
        assert "feature_quality" in data
        assert "outliers" in data
        assert "correlations" in data
        assert "target_analysis" in data
        assert "leakage" in data
        assert "health_score" in data
        assert "issues" in data
        assert isinstance(data["issues"], list)
        assert len(data["issues"]) > 0

    def test_analyze_dataset_health_endpoint(self):
        from unittest.mock import MagicMock
        from fastapi.testclient import TestClient
        from app.main import create_app
        from app.db import get_db
        from app.auth.permissions import Permissions
        from app.auth.dependencies import ProjectContext, TenantContext
        from app.datasets.router import dataset_profile_permission
        from app.models import Dataset, ProfileSummary, User, Organization, Project

        org_id = uuid.uuid4()
        project_id = uuid.uuid4()
        dataset_id = uuid.uuid4()
        user_id = uuid.uuid4()

        mock_user = MagicMock(spec=User)
        mock_user.id = user_id
        mock_user.email = "lead_ds@biotech.org"

        mock_proj = MagicMock(spec=Project)
        mock_proj.id = project_id
        mock_proj.organization_id = org_id

        mock_tenant = TenantContext(
            organization_id=org_id,
            user=mock_user,
            membership=MagicMock(),
            role="data_scientist",
            permissions={Permissions.DATASET_VIEW, Permissions.DATASET_PROFILE},
        )
        mock_project_ctx = ProjectContext(
            project_id=project_id,
            project=mock_proj,
            tenant=mock_tenant,
        )

        mock_dataset = MagicMock(spec=Dataset)
        mock_dataset.id = dataset_id
        mock_dataset.organization_id = org_id
        mock_dataset.project_id = project_id
        mock_dataset.approved_alias = "Clinical Cohort Benchmarks"

        mock_session = MagicMock()
        mock_session.scalar.side_effect = [mock_dataset, None]

        app = create_app()
        app.dependency_overrides[get_db] = lambda: mock_session
        app.dependency_overrides[dataset_profile_permission] = lambda: mock_project_ctx

        client = TestClient(app)
        res = client.post(
            f"/api/v1/organizations/{org_id}/projects/{project_id}/datasets/{dataset_id}/health/analyze",
            json={"target_column": "churn", "datetime_column": "signup_date"},
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["target_column"] == "churn"
        assert data["health_score"]["base_score"] == 100
        assert mock_session.commit.called

