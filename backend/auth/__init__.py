"""
Google OAuth token verification and JWT session management.
"""
import uuid
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from jose import jwt, JWTError
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from config import config
from db import SessionLocal, User

logger = logging.getLogger(__name__)


def verify_google_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Verify a Google ID token (from frontend Google Sign-In).
    Returns the decoded payload with user info, or None on failure.
    """
    try:
        # If GOOGLE_CLIENT_ID is configured, verify against it
        if config.GOOGLE_CLIENT_ID:
            idinfo = id_token.verify_oauth2_token(
                token,
                google_requests.Request(),
                config.GOOGLE_CLIENT_ID
            )
        else:
            # Development mode: verify without audience check
            idinfo = id_token.verify_oauth2_token(
                token,
                google_requests.Request()
            )

        return {
            "sub": idinfo.get("sub"),
            "email": idinfo.get("email"),
            "name": idinfo.get("name"),
            "picture": idinfo.get("picture"),
        }
    except Exception as e:
        logger.error(f"Google token verification failed: {e}")
        return None


def get_or_create_user(google_info: Dict[str, Any]) -> User:
    """
    Find existing user by Google sub, or create a new one.
    Returns the User ORM object.
    """
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.google_sub == google_info["sub"]).first()

        if not user:
            # Check by email as fallback
            user = db.query(User).filter(User.email == google_info["email"]).first()

        if user:
            # Update profile info
            user.name = google_info.get("name", user.name)
            user.picture = google_info.get("picture", user.picture)
            if not user.google_sub:
                user.google_sub = google_info["sub"]
            user.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(user)
            return user

        # Create new user
        user = User(
            id=str(uuid.uuid4()),
            email=google_info["email"],
            name=google_info.get("name"),
            picture=google_info.get("picture"),
            google_sub=google_info["sub"],
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info(f"Created new user: {user.email}")
        return user
    finally:
        db.close()


def create_dev_user(
    email: str = "dev@reflect.local",
    name: str = "Developer",
) -> User:
    """
    Create or retrieve the development user.

    The development user's google_sub is a stable identifier, so repeated
    development logins must reuse the existing user instead of attempting
    duplicate inserts.
    """
    db = SessionLocal()
    try:
        # First lookup by the stable development identifier.
        user = db.query(User).filter(User.google_sub == "dev-local").first()

        if user:
            # Keep the development user's profile information current.
            user.name = name
            user.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(user)
            return user

        # Fallback: check by email in case an older development user exists
        # without the expected google_sub value.
        user = db.query(User).filter(User.email == email).first()

        if user:
            user.google_sub = "dev-local"
            user.name = name
            user.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(user)
            return user

        # No development user exists, so create one.
        user = User(
            id=str(uuid.uuid4()),
            email=email,
            name=name,
            google_sub="dev-local",
        )

        db.add(user)
        db.commit()
        db.refresh(user)

        logger.info(f"Created dev user: {user.email}")
        return user

    except Exception:
        db.rollback()
        logger.exception("Failed to create or retrieve development user")
        raise

    finally:
        db.close()

def create_jwt_token(user_id: str, email: str) -> str:
    """Create a JWT token for the authenticated user."""
    expire = datetime.utcnow() + timedelta(hours=config.JWT_EXPIRATION_HOURS)
    payload = {
        "sub": user_id,
        "email": email,
        "exp": expire,
    }
    return jwt.encode(payload, config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)


def decode_jwt_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and validate a JWT token. Returns payload or None."""
    try:
        payload = jwt.decode(
            token,
            config.JWT_SECRET_KEY,
            algorithms=[config.JWT_ALGORITHM]
        )
        return payload
    except JWTError as e:
        logger.warning(f"JWT decode failed: {e}")
        return None
