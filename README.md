# Release Checklist Tool

A full-stack web application for managing software releases and tracking release-readiness checklist progress.

## Features

- View and manage software releases.
- Create, update, and delete releases.
- Store release dates and additional information.
- Track completion of 10 release checklist steps.
- View release progress and status.
- GraphQL API backed by PostgreSQL.
- Docker and Docker Compose support.
- Automated backend tests using Vitest.

## Tech Stack

**Frontend:** React, TypeScript, Vite  
**Backend:** Node.js, Express, Apollo Server, GraphQL  
**Database:** PostgreSQL (Neon)  
**Testing:** Vitest  
**Containerization:** Docker, Docker Compose

## Project Structure

```text
release-checklist/
├── frontend/
│   ├── src/
│   ├── Dockerfile
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── server.ts
│   │   ├── schema.ts
│   │   └── test/
│   │       └── schema.test.ts
│   ├── Dockerfile
│   ├── package.json
│   └── .env
└── docker-compose.yml
```

## Prerequisites

- Node.js and npm
- A PostgreSQL database
- Docker Desktop (for containerized setup)

## Environment Variables

Create `backend/.env`:

```env
DATABASE_URL=your_postgresql_connection_string
PORT=4000
```

Replace the placeholder with your PostgreSQL connection string. Keep credentials private and never commit `.env` to GitHub.

For the frontend, configure `VITE_API_URL` to point to the GraphQL endpoint.

## Run Locally

### 1. Start the backend

```bash
cd backend
npm install
npm run dev
```

The GraphQL endpoint is available at:

`http://localhost:4000/graphql`

### 2. Start the frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite in the terminal.

## Docker Setup

Ensure Docker Desktop is running and `backend/.env` contains a valid database connection string.

From the project root:

```bash
docker compose up --build
```

- Frontend: `http://localhost:8080`
- GraphQL API: `http://localhost:4000/graphql`

Stop the containers with `Ctrl+C`, or run:

```bash
docker compose down
```

## Database Schema

The application uses a PostgreSQL table named `releases`.

| Column | Type | Description |
|---|---|---|
| `id` | BIGINT, identity, primary key | Unique release identifier |
| `name` | VARCHAR(200) | Release name |
| `release_date` | DATE | Planned release date |
| `additional_info` | TEXT | Additional release notes |
| `completed_steps` | JSONB | Array of completed checklist step indexes |
| `created_at` | TIMESTAMPTZ | Record creation timestamp |

The backend creates the table if it does not already exist.

## GraphQL API

Endpoint: `POST /graphql`

### Queries

**List releases**

```graphql
query {
  releases {
    id
    name
    date
    additionalInfo
    completedSteps
    status
  }
}
```

**Get one release**

```graphql
query {
  release(id: "1") {
    id
    name
    date
    additionalInfo
    completedSteps
    status
  }
}
```

**Get checklist steps**

```graphql
query {
  checklistSteps
}
```

### Mutations

**Create a release**

```graphql
mutation {
  createRelease(
    name: "November Release"
    date: "2026-11-01"
    additionalInfo: "Initial release"
  ) {
    id
    name
    date
    status
  }
}
```

**Update a release**

```graphql
mutation {
  updateRelease(
    id: "1"
    additionalInfo: "Updated release notes"
  ) {
    id
    name
    additionalInfo
  }
}
```

**Complete a checklist step**

```graphql
mutation {
  toggleStep(id: "1", stepIndex: 0, completed: true) {
    id
    completedSteps
    status
  }
}
```

Checklist indexes start at `0`.

**Delete a release**

```graphql
mutation {
  deleteRelease(id: "1")
}
```

## Automated Tests

Backend tests use Vitest and mock the database pool so that test cases do not modify real database records.

Run the tests:

```bash
cd backend
npm test
```

The current test suite contains 11 passing tests covering checklist steps, release queries, creation, updates, checklist toggling, deletion, and invalid inputs.

## Architecture

The React frontend communicates with the Express/Apollo GraphQL API. The backend uses a PostgreSQL database to persist release information and checklist progress. Docker Compose builds and runs the frontend and backend containers.

## Deployment and Performance Testing

Deployment URLs, production environment configuration, load-test methodology, concurrent-user capacity, latency, and failure results will be documented after deployment and measured testing are completed.
