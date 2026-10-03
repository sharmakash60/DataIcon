"""Thread-Safe Local In-Memory Buffer for Monitoring Records.

Stores recent inference calls, input features, latencies, errors, and ground truth matches.
Kept strictly inside the client runtime memory; never exported as raw records.

Privacy guarantee (PRIV-01):
  Records older than ``ttl_seconds`` (default 86 400 s = 24 h) are automatically evicted.
  A background daemon thread sweeps expired entries every ``sweep_interval_seconds``
  (default 600 s = 10 min) so raw feature data does not accumulate indefinitely.
"""

from __future__ import annotations

from collections import deque
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

from datapilot_agent.monitoring.schema import GroundTruthSubmission, InternalPredictionRecord

_DEFAULT_TTL_SECONDS: float = 86_400.0          # 24 hours
_DEFAULT_SWEEP_INTERVAL_SECONDS: float = 600.0  # 10 minutes


class PredictionCollector:
    """Thread-safe collector retaining local prediction records within the client environment.

    Args:
        max_records: Hard upper bound on the number of records kept in memory.
        ttl_seconds: Maximum age (seconds) of any record. Records older than this
            are evicted unconditionally. Defaults to 24 h.
        sweep_interval_seconds: How often the background eviction thread runs.
            Defaults to 10 min. Set to 0 to disable the background thread (eviction
            will still happen lazily on ``get_records``).
    """

    def __init__(
        self,
        max_records: int = 10000,
        ttl_seconds: float = _DEFAULT_TTL_SECONDS,
        sweep_interval_seconds: float = _DEFAULT_SWEEP_INTERVAL_SECONDS,
    ):
        self.max_records = max_records
        self.ttl_seconds = ttl_seconds
        self._lock = threading.Lock()
        self._records: deque[InternalPredictionRecord] = deque(maxlen=max_records)
        self._by_request_id: Dict[str, InternalPredictionRecord] = {}

        if sweep_interval_seconds > 0:
            self._start_eviction_thread(sweep_interval_seconds)

    # ──────────────────────────────────────────────────────────────────────────
    # Background eviction
    # ──────────────────────────────────────────────────────────────────────────

    def _start_eviction_thread(self, interval: float) -> None:
        """Launch a daemon thread that purges expired records on a fixed interval."""
        def _loop() -> None:
            while True:
                time.sleep(interval)
                self._evict_expired()

        t = threading.Thread(target=_loop, daemon=True, name="PredictionCollector-eviction")
        t.start()

    def _evict_expired(self) -> None:
        """Remove records whose age exceeds ``ttl_seconds`` (called under lock)."""
        if self.ttl_seconds <= 0:
            return
        cutoff = time.time() - self.ttl_seconds
        with self._lock:
            # Drain from the left of the deque (oldest first)
            while self._records and self._records[0].timestamp < cutoff:
                old_rec = self._records.popleft()
                self._by_request_id.pop(old_rec.request_id, None)
            # Belt-and-suspenders: clean up any dangling request_id map entries
            if len(self._by_request_id) > len(self._records):
                valid_ids = {r.request_id for r in self._records}
                self._by_request_id = {k: v for k, v in self._by_request_id.items() if k in valid_ids}

    def record_prediction(
        self,
        request_id: str,
        features: Dict[str, Any],
        prediction: Any,
        latency_ms: float,
        probabilities: Optional[Dict[str, float]] = None,
        is_error: bool = False,
        error_type: Optional[str] = None,
    ) -> InternalPredictionRecord:
        """Record an inference call locally."""
        rec = InternalPredictionRecord(
            request_id=request_id,
            timestamp=time.time(),
            features=features,
            prediction=prediction,
            probabilities=probabilities,
            latency_ms=latency_ms,
            is_error=is_error,
            error_type=error_type,
        )
        with self._lock:
            self._records.append(rec)
            self._by_request_id[request_id] = rec
            # Prevent map from growing unbounded beyond max_records
            if len(self._by_request_id) > self.max_records * 2:
                # Retain only request_ids currently in deque
                valid_ids = {r.request_id for r in self._records}
                self._by_request_id = {k: v for k, v in self._by_request_id.items() if k in valid_ids}

        return rec

    def record_ground_truth(self, request_id: str, actual: Any) -> bool:
        """Match ground truth label to a past prediction record."""
        with self._lock:
            rec = self._by_request_id.get(request_id)
            if rec:
                rec.ground_truth = actual
                return True
        return False

    def record_ground_truth_batch(self, submissions: List[GroundTruthSubmission]) -> int:
        """Batch match ground truth labels to past predictions."""
        matched = 0
        with self._lock:
            for sub in submissions:
                rec = self._by_request_id.get(sub.request_id)
                if rec:
                    rec.ground_truth = sub.actual
                    matched += 1
        return matched

    def get_records(self, window_seconds: Optional[float] = None) -> List[InternalPredictionRecord]:
        """Retrieve local records within an optional lookback window.

        Expired records (older than ``ttl_seconds``) are lazily evicted before returning
        so the TTL is enforced even without the background eviction thread.
        """
        self._evict_expired()
        with self._lock:
            if not window_seconds:
                return list(self._records)
            cutoff = time.time() - window_seconds
            return [r for r in self._records if r.timestamp >= cutoff]

    def get_matched_ground_truth(
        self, window_seconds: Optional[float] = None
    ) -> Tuple[List[Any], List[Any], Optional[List[Dict[str, float]]]]:
        """Extract (y_true, y_pred, y_prob) for records where ground truth was provided."""
        records = self.get_records(window_seconds)
        matched = [r for r in records if r.ground_truth is not None and not r.is_error]
        if not matched:
            return [], [], None

        y_true = [m.ground_truth for m in matched]
        y_pred = [m.prediction for m in matched]
        y_prob = [m.probabilities for m in matched] if any(m.probabilities for m in matched) else None
        return y_true, y_pred, y_prob

    def clear(self) -> None:
        """Clear all local monitoring records."""
        with self._lock:
            self._records.clear()
            self._by_request_id.clear()
