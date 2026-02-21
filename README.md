# Data Export Service

A high-performance Node.js service for streaming millions of database rows to CSV files.

## Features
- **Async Streaming**: Uses `pg-cursor` and Node.js Streams to handle 10M+ rows with 150MB memory limit.
- **Background Jobs**: Exports are processed in the background, allowing the API to remain responsive.
- **Resumable Downloads**: Supports HTTP Range headers for partial content.
- **Gzip Compression**: On-the-fly compression for downloads.
- **Custom Formatting**: Configurable delimiters, quotes, and column selection.
- **Cancelable Jobs**: Graceful stop and cleanup of in-progress exports.

## Prerequisites
- Docker and Docker Compose

## Quick Start
1. Clone the repository into `mandatory` folder.
2. Initialize environment variables:
   \`\`\`bash
   cp .env.example .env
   \`\`\`
3. Start the services:
   \`\`\`bash
   docker-compose up --build -d
   \`\`\`
4. Wait for the database to seed (10M rows might take a few minutes). You can check health at:
   \`\`\`bash
   curl http://localhost:8080/health
   \`\`\`

## API Endpoints

### 1. Initiate Export
\`POST /exports/csv\`
- **Query Params**: \`country_code\`, \`subscription_tier\`, \`min_ltv\`, \`columns\`, \`delimiter\`, \`quoteChar\`
- **Response**: \`202 Accepted\` with \`exportId\`

### 2. Check Status
\`GET /exports/{exportId}/status\`
- **Response**: Current status, progress percentage, and row count.

### 3. Download File
`GET /exports/{exportId}/download`
- **Headers**: Supports `Range` and `Accept-Encoding: gzip`.

### 4. Cancel Export
`DELETE /exports/{exportId}`
- Stops the job and deletes temporary files.

## Quality Assurance

### Request Validation
The service uses **Zod** for robust input validation. All export options (delimiter, quote, filters) are strictly validated before processing starts.

### Automated Testing
Unit tests are implemented using **Jest**. You can run them inside the container:
```bash
docker exec -it mandatory-app-1 npm test
```

## Architecture
- **Language**: TypeScript / Node.js
- **Database**: PostgreSQL 15
- **Streaming**: Row-by-row fetching via Cursor to maintain low memory footprint.
- **Backpressure**: Managed via Node.js Stream `drain` events.
- **Validation**: Schema-based validation via Zod.
