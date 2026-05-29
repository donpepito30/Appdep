# Football API v2 Documentation (BZZOIRO)

This document describes the structure and usage of the Football API v2 used by the application.

## Base URL
- **Direct Domain:** `https://sports.bzzoiro.com/api/v2`
- **Application Proxy:** `/api/v2` (proxied via `server.ts`)

## Authentication
The API uses Token-based authentication.
- **Header:** `Authorization: Token <YOUR_API_KEY>`
- **Key Source:** `BZZOIRO_API_KEY` environment variable.

## Models and Intelligence
The "v2" specific endpoints include advanced predictive modeling and a richer data structure compared to legacy sports APIs.

### Key Data Objects
- **Event:** A match between two teams in a specific league.
- **Prediction:** AI-generated probabilities for match outcomes (1X2, BTTS, Over/Under).
- **Stats:** Live match statistics (possession, shots, corner kicks, xG).
- **Shotmap:** Coordinates and xG values for every shot in a match.

## Core Endpoints

### 1. Events and Results
- `GET /events/live/`: List of currently active matches with live scores and minutes.
- `GET /events/?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD`: Historical or upcoming matches.
- `GET /events/{id}/incidents`: Live events (goals, cards, substitutions).

### 2. Predictions (API v2 Intelligence)
- `GET /predicciones/?page={n}`: List of upcoming matches with a summary of AI predictions.
- `GET /eventos/{id}/predicción/`: Detailed AI analysis for a specific event, including:
    - **Mercados:** Probabilities for 1X2, Over/Under (1.5, 2.5, 3.5), BTTS.
    - **Puntuación:** Most likely scorelines.
    - **Modelo:** Confidence levels and versioning.
    - **Recomendaciones:** AI-detected value bets (e.g., `bet_favorite`, `over_25`).

### 3. Statistics and xG
- `GET /events/{id}/stats/`: Detailed live statistics.
- `GET /events/{id}/shotmap/`: Advanced data containing x,y coordinates of shots and their xG value.
- `GET /teams/{id}/fixtures/`: Recent and future matches for a specific team, often includes xG for finished matches.

### 4. Technical Data
- `GET /leagues/`: List of supported competitions.
- `GET /leagues/{id}/standings/`: Current table/ranking for a league.
- `GET /h2h/{team1_id}/{team2_id}/`: Historical matches between two teams.

## Media and Assets
- **Images:** `https://sports.bzzoiro.com/img/{type}/{id}/`
    - Types: `team`, `league`, `player`, `manager`, `venue`.

---
*Documentation generated for developer and AI internal use.*
