"""
Amazon Ads Reporting API v3 - Drop-in replacement for deprecated v2 reporting.

Usage: import this module and call patch_api_client(api_instance) after
creating your AmazonAdsAPI object, OR copy the ReportingV3 class methods
directly into AmazonAdsAPI.

Amazon Ads v3 reporting docs:
https://advertising.amazon.com/API/docs/en-us/reporting/v3/overview
"""

import csv
import gzip
import io
import json
import logging
import time
import zipfile
from datetime import datetime, timedelta
from typing import Dict, List, Optional

import requests

logger = logging.getLogger(__name__)

# ============================================================================
# V3 REPORT TYPE MAPPINGS
# Maps v2 report type names → v3 reportTypeId
# ============================================================================

REPORT_TYPE_MAP = {
    "keywords":  "spKeywords",
    "campaigns": "spCampaigns",
    "targets":   "spSearchTerm",   # search term report
    "adGroups":  "spAdGroups",
    "productAds": "spAdvertisedProduct",
}

# ============================================================================
# V3 COLUMN MAPPINGS
# Maps v2 metric names → v3 column names (per reportTypeId)
# ============================================================================

# Columns available for each report type in v3
V3_COLUMNS = {
    "spKeywords": [
        "campaignId", "campaignName",
        "adGroupId", "adGroupName",
        "keywordId", "keywordText", "matchType",
        "impressions", "clicks", "cost",
        "purchases14d", "sales14d",
        "keywordBid", "state",
    ],
    "spCampaigns": [
        "campaignId", "campaignName",
        "impressions", "clicks", "cost",
        "purchases14d", "sales14d",
        "campaignBudget", "campaignStatus",
    ],
    "spSearchTerm": [
        "campaignId", "campaignName",
        "adGroupId", "adGroupName",
        "searchTerm",
        "impressions", "clicks", "cost",
        "purchases14d", "sales14d",
    ],
    "spAdGroups": [
        "campaignId", "adGroupId", "adGroupName",
        "impressions", "clicks", "cost",
        "purchases14d", "sales14d",
    ],
}

# v2 column name → v3 column name (for normalising report requests)
V2_TO_V3_COLUMNS = {
    "attributedSales14d":        "sales14d",
    "attributedConversions14d":  "purchases14d",
    "query":                     "searchTerm",
    # everything else is the same name in v3
}

# v3 column name → v2 column name (for normalising output rows so the rest
# of the codebase keeps working without changes)
V3_TO_V2_COLUMNS = {v: k for k, v in V2_TO_V3_COLUMNS.items()}


def _translate_metrics_to_v3(metrics: List[str]) -> List[str]:
    """Convert a list of v2 metric names to v3 column names."""
    return [V2_TO_V3_COLUMNS.get(m, m) for m in metrics]


def _normalise_row_to_v2(row: Dict) -> Dict:
    """Rename v3 column names back to v2 names so callers need no changes."""
    return {V3_TO_V2_COLUMNS.get(k, k): v for k, v in row.items()}


# ============================================================================
# REPORTING V3 CLASS
# ============================================================================

class ReportingV3:
    """
    Implements Amazon Ads Reporting API v3.

    Designed to be mixed into AmazonAdsAPI or used standalone via
    patch_api_client().
    """

    # v3 reporting uses a different base path
    REPORTING_BASE = "/reporting/reports"

    def create_report_v3(
        self,
        report_type: str,
        metrics: List[str],
        report_date: str = None,
        segment: str = None,
    ) -> Optional[str]:
        """
        Create a v3 performance report.

        Args:
            report_type: v2-style type ('keywords', 'campaigns', 'targets')
            metrics:     v2-style metric names (translated internally)
            report_date: YYYY-MM-DD  (defaults to yesterday)
            segment:     ignored – v3 search term reports use spSearchTerm type

        Returns:
            reportId string, or None on failure.
        """
        if report_date is None:
            report_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        else:
            # Normalise YYYYMMDD → YYYY-MM-DD if needed
            if len(report_date) == 8 and "-" not in report_date:
                report_date = f"{report_date[:4]}-{report_date[4:6]}-{report_date[6:]}"

        # Map report type
        report_type_id = REPORT_TYPE_MAP.get(report_type)
        if not report_type_id:
            logger.error(f"Unknown report type '{report_type}'. "
                         f"Valid types: {list(REPORT_TYPE_MAP)}")
            return None

        # Translate metric names and add any mandatory columns
        v3_columns = _translate_metrics_to_v3(metrics)

        # Ensure we have the full column set for this report type
        available = V3_COLUMNS.get(report_type_id, [])
        # Keep only columns that exist in v3 for this report type
        v3_columns = [c for c in v3_columns if c in available]
        # Always include date
        if "date" not in v3_columns:
            v3_columns.insert(0, "date")

        payload = {
            "name": f"NWS-PPC-{report_type_id}-{report_date}",
            "startDate": report_date,
            "endDate": report_date,
            "configuration": {
                "adProduct": "SPONSORED_PRODUCTS",
                "groupBy": self._get_group_by(report_type_id),
                "columns": v3_columns,
                "reportTypeId": report_type_id,
                "timeUnit": "SUMMARY",
                "format": "GZIP_JSON",
            },
        }

        try:
            logger.info(f"Creating v3 report: {report_type_id} for {report_date}")
            response = self._request("POST", self.REPORTING_BASE, json=payload)
            data = response.json()
            report_id = data.get("reportId")
            logger.info(f"v3 report created: {report_id}")
            return report_id
        except Exception as e:
            logger.error(f"Failed to create v3 report: {e}")
            return None

    def get_report_status_v3(self, report_id: str) -> Dict:
        """Poll v3 report status."""
        try:
            response = self._request("GET", f"{self.REPORTING_BASE}/{report_id}")
            return response.json()
        except Exception as e:
            logger.error(f"Failed to get v3 report status: {e}")
            return {}

    def wait_for_report_v3(
        self,
        report_id: str,
        timeout: int = 600,
        poll_interval: int = 10,
    ) -> Optional[str]:
        """
        Poll until report is COMPLETED or timeout.

        Returns the download URL, or None.
        """
        start = time.time()
        poll = 0

        logger.info(f"Waiting for v3 report {report_id} (timeout {timeout}s)...")

        while time.time() - start < timeout:
            poll += 1
            data = self.get_report_status_v3(report_id)
            status = data.get("status", "UNKNOWN")

            logger.info(f"  Poll #{poll}: {status}")

            if status == "COMPLETED":
                url = data.get("url")
                logger.info(f"Report ready in {time.time()-start:.0f}s → {url}")
                return url

            if status in ("FAILED", "CANCELLED"):
                logger.error(f"Report {report_id} ended with status: {status}")
                logger.error(f"  Details: {data.get('statusDetails', '')}")
                return None

            time.sleep(poll_interval)

        logger.error(f"Report {report_id} timed out after {timeout}s")
        return None

    def download_report_v3(self, url: str) -> List[Dict]:
        """
        Download a v3 report (GZIP_JSON format) and return rows normalised
        to v2 column names so the rest of the codebase works unchanged.
        """
        try:
            logger.info("Downloading v3 report...")
            resp = requests.get(url, timeout=120)
            resp.raise_for_status()

            content = resp.content

            # v3 default format is GZIP_JSON
            try:
                with gzip.GzipFile(fileobj=io.BytesIO(content)) as gz:
                    raw = gz.read().decode("utf-8")
            except OSError:
                # Fallback: maybe plain JSON or CSV
                raw = content.decode("utf-8")

            # Parse JSON array
            try:
                rows = json.loads(raw)
                if not isinstance(rows, list):
                    # Some responses wrap in {"reports": [...]}
                    rows = rows.get("reports", rows.get("data", []))
            except json.JSONDecodeError:
                # Fallback: try CSV
                reader = csv.DictReader(io.StringIO(raw))
                rows = list(reader)

            # Normalise column names back to v2 equivalents
            normalised = [_normalise_row_to_v2(row) for row in rows]

            logger.info(f"Downloaded {len(normalised)} rows from v3 report")
            return normalised

        except Exception as e:
            logger.error(f"Failed to download v3 report: {e}")
            return []

    def get_report_data_v3(
        self,
        report_type: str,
        metrics: List[str],
        report_date: str = None,
        segment: str = None,
        use_cache: bool = True,
    ) -> List[Dict]:
        """
        Main entry point – replaces get_report_data() completely.

        Creates a v3 report, waits for it, downloads it, and returns rows
        with v2-compatible column names. Caches identically to v2.
        """
        # Check cache (same key scheme as v2 so existing cache hits still work)
        if use_cache and getattr(self, "cache_enabled", False):
            cached = self.cache.get(
                f"report_{report_type}",
                report_date=report_date,
                segment=segment,
                metrics=tuple(sorted(metrics)),
            )
            if cached is not None:
                logger.info(f"Cache hit for {report_type} report")
                return cached

        report_id = self.create_report_v3(report_type, metrics, report_date, segment)
        if not report_id:
            return []

        url = self.wait_for_report_v3(report_id)
        if not url:
            return []

        data = self.download_report_v3(url)

        # Store in cache
        if use_cache and getattr(self, "cache_enabled", False) and data:
            self.cache.set(
                f"report_{report_type}",
                data,
                report_date=report_date,
                segment=segment,
                metrics=tuple(sorted(metrics)),
            )

        return data

    # ------------------------------------------------------------------
    # Helper
    # ------------------------------------------------------------------

    @staticmethod
    def _get_group_by(report_type_id: str) -> List[str]:
        """Return the groupBy dimensions required for each report type."""
        group_by_map = {
            "spKeywords":          ["keyword"],
            "spCampaigns":         ["campaign"],
            "spSearchTerm":        ["searchTerm"],
            "spAdGroups":          ["adGroup"],
            "spAdvertisedProduct": ["advertiser"],
        }
        return group_by_map.get(report_type_id, ["campaign"])


# ============================================================================
# PATCH FUNCTION  –  call this after creating AmazonAdsAPI
# ============================================================================

def patch_api_client(api_instance) -> None:
    """
    Monkey-patch a v2 AmazonAdsAPI instance so all reporting calls use v3.

    Usage:
        api = AmazonAdsAPI(profile_id, region)
        patch_api_client(api)
        # api.get_report_data(...) now uses v3 transparently

    This binds all ReportingV3 methods onto the instance and then replaces
    the four public reporting methods with their v3 equivalents.
    """
    import types

    reporting = ReportingV3()

    # Bind each v3 method onto the api instance
    for name in dir(reporting):
        if name.startswith("_"):
            continue
        method = getattr(reporting, name)
        if callable(method):
            # Re-bind so `self` inside the method resolves to api_instance
            setattr(
                api_instance,
                name,
                types.MethodType(getattr(ReportingV3, name), api_instance),
            )

    # Replace the four public-facing reporting methods
    api_instance.create_report   = types.MethodType(ReportingV3.create_report_v3,   api_instance)
    api_instance.get_report_status = types.MethodType(ReportingV3.get_report_status_v3, api_instance)
    api_instance.wait_for_report = types.MethodType(ReportingV3.wait_for_report_v3, api_instance)
    api_instance.download_report = types.MethodType(ReportingV3.download_report_v3, api_instance)
    api_instance.get_report_data = types.MethodType(ReportingV3.get_report_data_v3, api_instance)

    logger.info("AmazonAdsAPI patched: reporting v2 → v3")
