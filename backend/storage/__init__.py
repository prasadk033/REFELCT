"""
File storage abstraction layer.

Supports:
  - Local filesystem (STORAGE_TYPE=local)
  - S3-compatible object storage via MinIO (STORAGE_TYPE=s3)

Files are organised as: {project_id}/{source_id}/{original_filename}

Switch storage back-end by setting STORAGE_TYPE in .env.
No calling code changes needed — all access goes through file_store.
"""
import os
import io
import shutil
import logging
from pathlib import Path
from typing import Optional, BinaryIO

from config import config

logger = logging.getLogger(__name__)

# ── Local base dir (used when STORAGE_TYPE=local) ───────────────────────────
_UPLOADS_DIR = os.getenv("UPLOADS_DIR", None)
if _UPLOADS_DIR:
    UPLOADS_BASE = Path(_UPLOADS_DIR)
else:
    UPLOADS_BASE = Path(__file__).parent.parent.parent / "uploads"

UPLOADS_BASE.mkdir(parents=True, exist_ok=True)


# ── MinIO / S3 client (lazy init) ───────────────────────────────────────────

def _make_s3_client():
    """Build a boto3 S3 client pointing at MinIO."""
    try:
        import boto3
        from botocore.client import Config as BotoConfig

        endpoint = config.MINIO_ENDPOINT
        access_key = config.MINIO_ACCESS_KEY
        secret_key = config.MINIO_SECRET_KEY

        client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            config=BotoConfig(signature_version="s3v4", connect_timeout=2, read_timeout=3, retries={"max_attempts": 1}),
            use_ssl=config.MINIO_SECURE,
        )
        logger.info(f"MinIO S3 client initialised → {endpoint}")
        return client
    except ImportError:
        logger.error("boto3 is not installed. Add 'boto3' to requirements.txt.")
        raise
    except Exception as e:
        logger.error(f"Failed to create MinIO client: {e}")
        raise


_s3_client = None
_s3_bucket = config.MINIO_BUCKET


def _s3():
    """Lazy singleton S3 client."""
    global _s3_client
    if _s3_client is None:
        _s3_client = _make_s3_client()
    return _s3_client


def _ensure_bucket():
    """Ensure the MinIO bucket exists (idempotent)."""
    try:
        _s3().head_bucket(Bucket=_s3_bucket)
    except Exception:
        try:
            _s3().create_bucket(Bucket=_s3_bucket)
            logger.info(f"Created MinIO bucket: {_s3_bucket}")
        except Exception as e:
            logger.warning(f"Could not verify/create bucket {_s3_bucket}: {e}")


# ── FileStore ────────────────────────────────────────────────────────────────

class FileStore:
    """
    Unified storage interface.

    All paths returned are relative keys (e.g. 'project_id/source_id/file.pdf').
    When using S3, these keys map directly to object keys in the bucket.
    When using local storage, they map to paths under UPLOADS_BASE.
    """

    def __init__(self):
        self.storage_type = config.STORAGE_TYPE  # "local" or "s3"
        logger.info(f"FileStore initialized with mode: {self.storage_type}")

    def save_upload(self, project_id: str, source_id: str, file_name: str, file_data) -> str:
        """
        Save an uploaded file.
        Returns the storage key (relative path / S3 object key).
        """
        key = f"{project_id}/{source_id}/{file_name}"

        if self.storage_type == "s3":
            try:
                return self._s3_upload(key, file_data, file_name)
            except Exception as e:
                logger.warning(f"S3/MinIO upload failed ({e}). Falling back to local filesystem storage.")
                if hasattr(file_data, "seek"):
                    file_data.seek(0)
                return self._local_save(key, project_id, source_id, file_name, file_data)
        else:
            return self._local_save(key, project_id, source_id, file_name, file_data)

    def get_absolute_path(self, storage_path: str) -> str:
        """
        For local storage: returns the absolute filesystem path.
        For S3: downloads the file to a temp path and returns that path.
        """
        local_path = UPLOADS_BASE / storage_path
        if local_path.exists():
            return str(local_path)

        if self.storage_type == "s3":
            try:
                return self._s3_download_temp(storage_path)
            except Exception as e:
                logger.warning(f"S3 download failed ({e}). Checking local uploads path.")
                return str(local_path)
        else:
            return str(local_path)

    def file_exists(self, storage_path: str) -> bool:
        """Check if a file exists in storage."""
        if self.storage_type == "s3":
            try:
                _s3().head_object(Bucket=_s3_bucket, Key=storage_path)
                return True
            except Exception:
                return False
        else:
            return (UPLOADS_BASE / storage_path).exists()

    def delete_file(self, storage_path: str) -> bool:
        """Delete a file from storage."""
        if self.storage_type == "s3":
            try:
                _s3().delete_object(Bucket=_s3_bucket, Key=storage_path)
                logger.info(f"Deleted S3 object: {storage_path}")
                return True
            except Exception as e:
                logger.error(f"Failed to delete S3 object {storage_path}: {e}")
                return False
        else:
            try:
                path = UPLOADS_BASE / storage_path
                if path.exists():
                    path.unlink()
                    logger.info(f"Deleted local file: {storage_path}")
                    return True
                return False
            except Exception as e:
                logger.error(f"Failed to delete local file {storage_path}: {e}")
                return False

    def save_artifact(self, project_id: str, artifact_name: str, content: str) -> str:
        """Save a processing artifact (extracted text, brief output, etc.)."""
        key = f"{project_id}/_artifacts/{artifact_name}"

        if self.storage_type == "s3":
            try:
                _s3().put_object(
                    Bucket=_s3_bucket,
                    Key=key,
                    Body=content.encode("utf-8"),
                    ContentType="text/plain; charset=utf-8",
                )
                logger.info(f"Saved S3 artifact: {key}")
                return key
            except Exception as e:
                logger.error(f"Failed to save S3 artifact {key}: {e}")
                raise
        else:
            artifacts_dir = UPLOADS_BASE / project_id / "_artifacts"
            artifacts_dir.mkdir(parents=True, exist_ok=True)
            dest_path = artifacts_dir / artifact_name
            with open(dest_path, "w", encoding="utf-8") as f:
                f.write(content)
            logger.info(f"Saved local artifact: {key}")
            return key

    # ── Private helpers ──────────────────────────────────────────────────

    def _s3_upload(self, key: str, file_data, file_name: str) -> str:
        """Upload file_data to S3/MinIO."""
        try:
            if hasattr(file_data, "read"):
                data = file_data.read()
            else:
                data = file_data

            _s3().put_object(
                Bucket=_s3_bucket,
                Key=key,
                Body=data,
                ContentType=_content_type(file_name),
            )
            logger.info(f"Uploaded to MinIO: s3://{_s3_bucket}/{key}")
            return key
        except Exception as e:
            logger.error(f"MinIO upload failed for {key}: {e}")
            raise

    def _s3_download_temp(self, key: str) -> str:
        """Download an S3 object to a local temp file and return the path."""
        import tempfile
        suffix = Path(key).suffix or ".tmp"
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        try:
            _s3().download_fileobj(Bucket=_s3_bucket, Key=key, Fileobj=tmp)
            tmp.flush()
            tmp.close()
            return tmp.name
        except Exception as e:
            tmp.close()
            logger.error(f"MinIO download failed for {key}: {e}")
            raise

    def _local_save(self, key: str, project_id: str, source_id: str, file_name: str, file_data) -> str:
        """Save file_data to local filesystem."""
        project_dir = UPLOADS_BASE / project_id / source_id
        project_dir.mkdir(parents=True, exist_ok=True)
        dest_path = project_dir / file_name

        if hasattr(file_data, "read"):
            with open(dest_path, "wb") as f:
                shutil.copyfileobj(file_data, f)
        else:
            with open(dest_path, "wb") as f:
                f.write(file_data)

        logger.info(f"Saved local file: {key}")
        return key


def _content_type(file_name: str) -> str:
    """Return Content-Type for common document extensions."""
    ext = Path(file_name).suffix.lower()
    return {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".doc": "application/msword",
        ".txt": "text/plain",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
    }.get(ext, "application/octet-stream")


# Singleton
file_store = FileStore()
