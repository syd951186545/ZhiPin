# ============================================================
# Python FastAPI backend
# ============================================================
FROM python:3.11-slim

WORKDIR /app

# System deps: ca-certificates for HTTPS (Supabase, OpenClaw)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first (layer cache)
COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY server/ .

EXPOSE 8000

# Production: single worker, no --reload
# LangGraph workflows hold in-memory state, so multi-worker is not supported
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
