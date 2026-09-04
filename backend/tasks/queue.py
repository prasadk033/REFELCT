"""
Redis-backed Task Queue for distributed asynchronous processing.
"""
import logging
from typing import List, Optional
import redis
from rq import Queue

from config import config

logger = logging.getLogger(__name__)

_redis_conn = None


def get_redis_connection():
    """Obtain or initialize the shared Redis connection pool."""
    global _redis_conn
    if _redis_conn is None:
        _redis_conn = redis.from_url(config.REDIS_URL)
    return _redis_conn


def get_queue(name: str = "briefs") -> Queue:
    """Return an RQ Queue instance bound to Redis."""
    conn = get_redis_connection()
    return Queue(name, connection=conn)


def enqueue_brief_job(project_id: str, source_ids: List[str], job_id: str, user_id: Optional[str] = None):
    """
    Offload Brief generation pipeline to a dedicated distributed worker process.
    - Timeout: 1800s (30 mins) to comfortably handle massive blueprints/documents.
    - Keeps web server process completely responsive and free from CPU/memory bottlenecks.
    """
    from agents.brief_orchestrator import run_brief_pipeline

    q = get_queue("briefs")
    job = q.enqueue(
        run_brief_pipeline,
        project_id,
        source_ids,
        job_id,
        user_id,
        job_timeout=1800,
        result_ttl=3600,
    )
    logger.info(f"Enqueued brief job {job_id} to Redis queue 'briefs' (RQ Job ID: {job.id})")
    return job.id
