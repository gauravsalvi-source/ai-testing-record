# Team Performance Tracker

A simple team performance tracker built with React on the frontend and Node.js/Express on the backend. It follows the workbook structure from `Team_Performance_Tracker_Final_April_2026.xlsx`.

## Features

- Add, edit, and delete daily performance entries
- Track date, employee, role, testing apps, tickets, chats, bugs, testing quality, app reviews, system process, blockers, and notes
- Auto-calculate overall effort score
- Filter daily entries by employee, role, and date
- View Monthly Summary and Final Report tabs
- SQLite database storage for persistent daily entries

## Run Locally

Install dependencies:

```bash
npm run install:all
```

Start both frontend and backend:

```bash
npm run dev
```

Frontend: http://localhost:5173

Backend API: http://localhost:4000

## Database

The backend stores data in a local SQLite database:

```text
server/data/performance.db
```

The database is created automatically when the backend starts. Sample entries are seeded only when the database is empty.
