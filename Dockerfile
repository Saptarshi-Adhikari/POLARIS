# POLARIS Containerized Multi-Service Image Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy python dependencies
COPY backend/ /app/backend/
COPY scratch/ /app/scratch/
COPY data/ /app/data/

# Install python packages
RUN pip install --no-cache-dir uvicorn fastapi pydantic numpy scikit-learn joblib

EXPOSE 8001

CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8001"]
