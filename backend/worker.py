"""
Dedicated Distributed Worker Process for REFELCT.
Listens on Redis queues ('briefs', 'default') to execute heavy document extraction and Brief generation pipelines outside the FastAPI web thread pool.
"""
import os
import sys
import logging
from pathlib import Path

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import redis
from rq import Worker, Queue, Connection
from config import config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [REFELCT-WORKER] %(message)s"
)
logger = logging.getLogger("reflect-worker")

QUEUES_TO_LISTEN = ["briefs", "default"]


def start_worker():
    """Start the RQ worker loop."""
    redis_url = config.REDIS_URL
    logger.info(f"Starting REFELCT Distributed Worker...")
    logger.info(f"Connecting to Redis at: {redis_url}")

    conn = redis.from_url(redis_url)

    # Test Redis connectivity
    try:
        conn.ping()
        logger.info("Successfully connected to Redis.")
    except Exception as e:
        logger.error(f"Failed to connect to Redis at {redis_url}: {e}")
        sys.exit(1)

    with Connection(conn):
        worker = Worker(list(map(Queue, QUEUES_TO_LISTEN)))
        logger.info(f"Worker ready! Listening on queues: {QUEUES_TO_LISTEN}")
        worker.work(with_scheduler=True)


if __name__ == "__main__":
    start_worker()
