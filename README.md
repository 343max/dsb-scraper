# DSB Scraper

## Setup

Create a `.env` file with your DSB credentials:

```
DSB_USERNAME=your_username
DSB_PASSWORD=your_password
```

## Usage

Run the scraper locally:
```bash
bun run scrape
```

## Docker

Build the Docker image:
```bash
make build
```

Deploy to GitHub Container Registry:
```bash
export GITHUB_TOKEN=your_token_here
make deploy
```

Run the container:
```bash
docker run -v $(pwd)/.env:/.env -v $(pwd)/debug-data:/data ghcr.io/your-username/dsb-scraper
```
