"""POLARIS HTTP client for communicating with the Laya Decision Engine API.

Provides an isolated interface for POLARIS navigation & vessel safety routines
to dispatch decision requests to the Laya HTTP service.
"""
import os
import json
import logging
import urllib.request
import urllib.error
from typing import Dict, Any, Optional

logger = logging.getLogger("polaris.laya_client")

LAYA_API_URL = os.environ.get("LAYA_API_URL", "http://127.0.0.1:8000").rstrip("/")


class LayaClientError(Exception):
    """Base exception for POLARIS Laya API client errors."""
    pass


class LayaConnectionError(LayaClientError):
    """Raised when the Laya HTTP API is unreachable."""
    pass


class LayaAPIResponseError(LayaClientError):
    """Raised when the Laya HTTP API returns a non-2xx error code."""
    def __init__(self, status_code: int, detail: str):
        super().__init__(f"Laya API Error ({status_code}): {detail}")
        self.status_code = status_code
        self.detail = detail


class PolarisLayaClient:
    """HTTP Client for sending POLARIS decision queries to Laya Decision Engine."""

    def __init__(self, base_url: Optional[str] = None, timeout: float = 10.0):
        self.base_url = (base_url or LAYA_API_URL).rstrip("/")
        self.timeout = timeout

    def check_health(self) -> Dict[str, Any]:
        """Check Laya API health endpoint GET /health.

        Returns:
            Health status dictionary.
        """
        url = f"{self.base_url}/health"
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.URLError as e:
            logger.error(f"Failed to connect to Laya API at {url}: {e}")
            raise LayaConnectionError(f"Cannot connect to Laya API at {url}: {e.reason if hasattr(e, 'reason') else e}") from e
        except Exception as e:
            logger.error(f"Unexpected error during Laya health check: {e}")
            raise LayaClientError(f"Laya health check failed: {e}") from e

    def predict_decision(self, state: Dict[str, Any], questions: Dict[str, Any]) -> Dict[str, Any]:
        """Send a decision query payload to POST /predict.

        Args:
            state: Dictionary describing ship telemetry, ice conditions, or navigation status.
            questions: Dictionary defining typed questions (choice, score, noul).

        Returns:
            Original Laya prediction response structure.
        """
        if not state:
            raise ValueError("State payload cannot be empty.")
        if not questions:
            raise ValueError("Questions dictionary cannot be empty.")

        url = f"{self.base_url}/predict"
        payload = json.dumps({"state": state, "questions": questions}).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST"
        )

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8")
            detail = body
            try:
                err_json = json.loads(body)
                detail = err_json.get("detail", body)
            except Exception:
                pass
            logger.error(f"Laya API HTTP {e.code} error: {detail}")
            raise LayaAPIResponseError(e.code, detail) from e
        except urllib.error.URLError as e:
            logger.error(f"Failed to connect to Laya API at {url}: {e}")
            raise LayaConnectionError(f"Cannot connect to Laya API at {url}: {e.reason if hasattr(e, 'reason') else e}") from e
        except Exception as e:
            logger.error(f"Unexpected error calling Laya predict: {e}")
            raise LayaClientError(f"Laya prediction request failed: {e}") from e
