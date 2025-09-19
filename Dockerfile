# Use minimal Debian image
FROM debian:12-slim

# Install system dependencies needed for Bun and Playwright
RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    ca-certificates \
    cron \
    && rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install

# Disable man db for faster playwright install (like in workflow)
RUN mv /usr/bin/mandb /usr/bin/mandb-OFF || true && \
    cp /bin/true /usr/bin/mandb || true && \
    rm -rf /var/cache/man || true

# Install Playwright Chromium with dependencies
RUN bunx playwright install chromium --with-deps

# Copy source code
COPY . .

# Create data directory
RUN mkdir -p /data

# Create scraper script
RUN echo '#!/bin/bash\ncd /app\nbun run scrape && cp schedule-modifications.json /data/' > /usr/local/bin/run-scraper.sh && \
    chmod +x /usr/local/bin/run-scraper.sh

# Setup cron job to run every 20 minutes
RUN echo "*/20 * * * * /usr/local/bin/run-scraper.sh >> /var/log/cron.log 2>&1" | crontab -

# Create log file
RUN touch /var/log/cron.log

# Start cron daemon, run scraper once immediately, then keep container running
CMD cron && /usr/local/bin/run-scraper.sh && tail -f /var/log/cron.log