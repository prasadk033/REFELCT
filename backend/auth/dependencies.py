"""
FastAPI dependencies for authentication.
"""
import logging
from fastapi import Depends, HTTPException, Header
from typing import Optional

from auth import decode_jwt_token, create_dev_user
from config import config
from db import SessionLocal, User

logger = logging.getLogger(__name__)


async def get_current_user(authorization: Optional[str] = Header(None)) -> User:
    """
    FastAPI dependency that extracts and validates the JWT Bearer token.
    Returns the authenticated User object.

    If Google OAuth is not configured (GOOGLE_CLIENT_ID is empty),
    falls back to a dev user for local development.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")

    # Extract Bearer token
    parts = authorization.split(" ")
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header format")

    token = parts[1]
    payload = decode_jwt_token(token)

    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        # Detach from session for use outside
        db.expunge(user)
        return user
    finally:
        db.close()
