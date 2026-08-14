FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (needed for python-docx, etc. if required)
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file from project root
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Copy the backend codebase
COPY backend/ ./backend/

WORKDIR /app/backend

# Ensure Python can find the modules
ENV PYTHONPATH=/app/backend

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
