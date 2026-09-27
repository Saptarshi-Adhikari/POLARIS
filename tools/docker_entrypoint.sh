#!/bin/sh
set -e

echo "[POLARIS Docker Entrypoint] Starting edge services..."

# Start Nginx static web server in background
nginx -g "daemon off;" &
NGINX_PID=$!
echo "[POLARIS Docker Entrypoint] Nginx started on port 80 (PID: $NGINX_PID)"

# Start FastAPI Uvicorn ML microservice in background if backend exists
if [ -f "/app/backend/main.py" ]; then
    python -m uvicorn backend.main:app --host 0.0.0.0 --port 8001 &
    UVICORN_PID=$!
    echo "[POLARIS Docker Entrypoint] Uvicorn ML service started on port 8001 (PID: $UVICORN_PID)"
fi

# Wait for process signals
trap "kill -TERM $NGINX_PID $UVICORN_PID 2>/dev/null || true" INT TERM
wait -n
