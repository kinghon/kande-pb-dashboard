# Kande Photo Booths — Operations Dashboard

**pb.kandedash.com** — Internal operations dashboard for Kande Photo Booths.

17 bots. 6 divisions. 1 mission: Make Kande Photo Booths the #1 photo booth company in every city we touch.

## Features

- **Dashboard Home** — Overview stats, quick links, real-time activity feed
- **Leaderboard** — Bot rankings with tier badges, division MVPs, head-to-head rivalries
- **Departments** — 6 divisions with expandable team cards, live metrics
- **Email Inbox** — AI-drafted replies with approval guardrails
- **SEO Dashboard** — Keyword rankings for SF & LV markets, competitor tracking, trend charts

## Stack

- Node.js + Express
- Vanilla HTML/CSS/JS frontend
- Chart.js for data visualization
- JSON flat file storage (Railway volume compatible)

## Deploy

```bash
npm install
npm start
```

Server starts on port `3000` (or `$PORT`).

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stats` | Dashboard overview stats |
| GET | `/api/activity` | Recent activity feed |
| POST | `/api/activity` | Log new activity |
| GET | `/api/leaderboard` | Full bot rankings |
| POST | `/api/leaderboard/score` | Update bot scores |
| GET | `/api/departments` | Division & team data |
| POST | `/api/departments/:team/update` | Update team status |
| GET | `/api/inbox` | Email inbox |
| POST | `/api/inbox/refresh` | Push emails from local agent |
| POST | `/api/inbox/:id/approve` | Approve email reply |
| GET | `/api/seo` | SEO rankings data |
| POST | `/api/seo/check` | Push SEO check results |
| GET | `/health` | Health check |

## Data Storage

Uses `/data/data.json` — set `DATA_PATH` env var for custom location (e.g., Railway volume mount).
