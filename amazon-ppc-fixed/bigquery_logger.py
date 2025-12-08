"""
BigQuery Audit Logger for Amazon PPC Optimizer
Logs optimizer run events to BigQuery for auditing and analysis
"""

import os
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional
from google.cloud import bigquery

logger = logging.getLogger(__name__)

# BigQuery Configuration
PROJECT_ID = "amazon-ppc-474902"   # Updated Project ID
DATASET_ID = "amazon_ppc"
TABLE_ID = "optimizer_run_events"  # Updated Table Name

# Full table reference
TABLE_REF = f"{PROJECT_ID}.{DATASET_ID}.{TABLE_ID}"


def get_bigquery_client() -> bigquery.Client:
    """
    Initialize and return a BigQuery client
    
    Returns:
        bigquery.Client: Initialized BigQuery client
    """
    return bigquery.Client(project=PROJECT_ID)


def log_to_bigquery(
    message: str,
    level: str = "INFO",
    run_id: Optional[str] = None,
    job_name: str = "Bid Optimizer",
    additional_details: Optional[Dict[str, Any]] = None
) -> bool:
    """
    Log an event to BigQuery optimizer_run_events table
    
    Args:
        message: The log message/details to store
        level: Log level (INFO, ERROR, WARNING, SUCCESS)
        run_id: Unique identifier for this optimizer run
        job_name: Name of the job/optimizer component
        additional_details: Optional dictionary with additional data
        
    Returns:
        bool: True if successful, False otherwise
        
    Table Schema (optimizer_run_events):
        - run_timestamp: TIMESTAMP - When the event occurred
        - status: STRING - Event status (INFO, ERROR, WARNING, SUCCESS)
        - details: STRING - Event details/message
        - run_id: STRING - Unique run identifier (optional)
        - job_name: STRING - Name of the optimizer job (optional)
    """
    try:
        client = get_bigquery_client()
        
        # Prepare the row data matching the BigQuery table schema
        row_to_insert = {
            "run_timestamp": datetime.now().isoformat(),
            "status": level.upper(),
            "details": message,
        }
        
        # Add optional fields if provided
        if run_id:
            row_to_insert["run_id"] = run_id
            
        if job_name:
            row_to_insert["job_name"] = job_name
        
        # If additional details provided, append them to the details field
        if additional_details:
            details_json = json.dumps(additional_details)
            row_to_insert["details"] = f"{message} | Additional data: {details_json}"
        
        # Insert the row into BigQuery
        # Note: insert_rows_json accepts a table reference string in format "project.dataset.table"
        rows_to_insert = [row_to_insert]
        errors = client.insert_rows_json(TABLE_REF, rows_to_insert)
        
        if errors:
            logger.error(f"Failed to insert row into BigQuery: {errors}")
            return False
        
        logger.debug(f"Successfully logged to BigQuery: {level} - {message}")
        return True
        
    except Exception as e:
        logger.error(f"Error logging to BigQuery: {e}")
        return False


def log_optimizer_start(run_id: str, config: Optional[Dict[str, Any]] = None) -> bool:
    """
    Log the start of an optimizer run
    
    Args:
        run_id: Unique identifier for this run
        config: Optional configuration details
        
    Returns:
        bool: True if successful, False otherwise
    """
    message = f"Optimizer run started: {run_id}"
    return log_to_bigquery(
        message=message,
        level="INFO",
        run_id=run_id,
        job_name="Bid Optimizer",
        additional_details=config
    )


def log_optimizer_complete(
    run_id: str,
    results: Optional[Dict[str, Any]] = None,
    duration_seconds: Optional[float] = None
) -> bool:
    """
    Log the completion of an optimizer run
    
    Args:
        run_id: Unique identifier for this run
        results: Optional results summary
        duration_seconds: Optional run duration
        
    Returns:
        bool: True if successful, False otherwise
    """
    message = f"Optimizer run completed: {run_id}"
    if duration_seconds:
        message += f" (duration: {duration_seconds:.2f}s)"
    
    return log_to_bigquery(
        message=message,
        level="SUCCESS",
        run_id=run_id,
        job_name="Bid Optimizer",
        additional_details=results
    )


def log_optimizer_error(
    run_id: str,
    error_message: str,
    error_details: Optional[Dict[str, Any]] = None
) -> bool:
    """
    Log an error during optimizer run
    
    Args:
        run_id: Unique identifier for this run
        error_message: Error message
        error_details: Optional additional error details
        
    Returns:
        bool: True if successful, False otherwise
    """
    message = f"Optimizer error: {error_message}"
    return log_to_bigquery(
        message=message,
        level="ERROR",
        run_id=run_id,
        job_name="Bid Optimizer",
        additional_details=error_details
    )


def create_table_if_not_exists() -> bool:
    """
    Create the optimizer_run_events table if it doesn't exist
    
    Returns:
        bool: True if successful or table exists, False otherwise
    """
    try:
        client = get_bigquery_client()
        
        # Define the schema for the table
        schema = [
            bigquery.SchemaField("run_timestamp", "TIMESTAMP", mode="REQUIRED"),
            bigquery.SchemaField("status", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("details", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("run_id", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("job_name", "STRING", mode="NULLABLE"),
        ]
        
        # Create table reference
        table_ref = client.dataset(DATASET_ID).table(TABLE_ID)
        table = bigquery.Table(table_ref, schema=schema)
        
        # Create the table (or do nothing if it exists)
        table = client.create_table(table, exists_ok=True)
        logger.info(f"Table {TABLE_REF} is ready")
        return True
        
    except Exception as e:
        logger.error(f"Error creating table: {e}")
        return False


# Example usage
if __name__ == "__main__":
    # Test the logger
    import uuid
    
    test_run_id = str(uuid.uuid4())
    
    print("Testing BigQuery Logger...")
    print(f"Project: {PROJECT_ID}")
    print(f"Dataset: {DATASET_ID}")
    print(f"Table: {TABLE_ID}")
    print(f"Full Reference: {TABLE_REF}")
    print(f"Test Run ID: {test_run_id}")
    
    # Test logging
    success = log_to_bigquery(
        message="Test message from BigQuery logger",
        level="INFO",
        run_id=test_run_id,
        job_name="Test Job"
    )
    
    if success:
        print("✅ Successfully logged to BigQuery")
    else:
        print("❌ Failed to log to BigQuery")
