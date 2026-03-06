FROM python:3.11-slim

# Install uv (fast Python package manager)
RUN pip install --no-cache-dir uv

WORKDIR /app

# Dependency layer — cached until pyproject.toml or uv.lock changes
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Application code
COPY agents/ agents/
COPY app/ app/

# Cloud Run injects PORT; default to 8000
ENV PORT=8000
EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
