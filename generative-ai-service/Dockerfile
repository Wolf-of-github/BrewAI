FROM --platform=linux/amd64 us-central1-docker.pkg.dev/brewai-497502/base-images/texlive-base:latest

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8080

EXPOSE 8080

CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "--threads", "4", "main:app"]
