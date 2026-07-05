# ============================================
# AI Chatbot - Backend Dockerfile
# Build: docker build -t chatbot-backend .
# Deploy: Railway (uses $PORT env var)
# ============================================

FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (Docker layer cache)
COPY backend/requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir gunicorn

# Copy backend code
COPY backend/ /app/

# Copy frontend (served by FastAPI at /)
COPY frontend/ /app/frontend/

# Create upload directories
RUN mkdir -p /app/uploads/images /app/uploads/pdfs

# Set path overrides for Docker layout (pydantic-settings reads env vars)
ENV UPLOAD_DIR=/app/uploads
ENV FRONTEND_DIR=/app/frontend

# Railway assigns $PORT dynamically (shell form so $PORT expands)
CMD gunicorn -k uvicorn.workers.UvicornWorker main:app --workers 4 --bind 0.0.0.0:$PORT --timeout 120
