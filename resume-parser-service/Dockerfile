FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends libmagic1 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py parser.py ai.py ./
COPY prompts/ ./prompts/

ENV PYTHONUNBUFFERED=1

CMD ["flask", "--app", "main", "run", "--host", "0.0.0.0", "--port", "8080"]
