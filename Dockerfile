# POLARIS Containerized Multi-Service Edge Deployment Dockerfile
# Stage 1: Build Static Frontend Bundle
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts || npm install
COPY . .
RUN npm run build

# Stage 2: Final Production Edge Container (Nginx Static Server + Python ML Backend)
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies & Nginx static web server
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    nginx \
    && rm -rf /var/lib/apt/lists/*

# Copy python backend code & models
COPY backend/ /app/backend/
COPY data/ /app/data/

# Install python dependencies
RUN pip install --no-cache-dir uvicorn fastapi pydantic numpy scikit-learn joblib

# Copy compiled static frontend from builder stage to Nginx web root
COPY --from=frontend-builder /app/dist /var/www/html

# Expose HTTP ports: 80 (Frontend static app) & 8001 (FastAPI ML microservice)
EXPOSE 80 8001

# Copy startup script for edge deployment
COPY tools/docker_entrypoint.sh /app/docker_entrypoint.sh
RUN chmod +x /app/docker_entrypoint.sh

CMD ["/app/docker_entrypoint.sh"]
