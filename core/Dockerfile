FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PYTHONPATH=/app TESSERA_SERVERLESS=1 PYTHONUNBUFFERED=1
CMD ["sh", "-c", "uvicorn tessera.api.app:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1"]
