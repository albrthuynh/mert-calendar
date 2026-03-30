# Mert Calendar

A calendar I created because I did not like the feel of Google Calendar.

It is basically an aesthetic calendar + a to-do list for the specific day.

This started as a project because I didn't realize Google Calendar had their tasks have due dates on them... 
Now it's a calendar for my girlfriend and my friends, so I am officially at their mercy for whatever features get added next.

## What this app does

- Clean weekly and monthly calendar view with event support
- Day-specific to-do list so tasks stay tied to real dates
- Google sign-in with user-specific data
- Postgres + Prisma for persistence

## Tech stack

- Next.js (App Router)
- React + TypeScript
- Prisma + PostgreSQL
- NextAuth (Google provider)
- Tailwind CSS

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Create your local env file:

```bash
cp .env.example .env.local
```

If `.env.example` does not exist yet, create `.env.local` manually and add:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB_NAME"
AUTH_GOOGLE_ID="your_google_oauth_client_id"
AUTH_GOOGLE_SECRET="your_google_oauth_client_secret"
```

3. Generate Prisma client and sync your schema:

```bash
npx prisma generate
npx prisma db push
```

4. Start the app:

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Available scripts

- `npm run dev` - start local dev server
- `npm run build` - build for production
- `npm run start` - run the production build
- `npm run lint` - run ESLint

## Notes

- You need a PostgreSQL database running locally or remotely.
- You need a Google OAuth app configured for login.
- Prisma client also generates on `npm install` via `postinstall`.

## Why this exists

I wanted a calendar that feels better to look at and nicer to use day-to-day.

Google Calendar is powerful, but I wanted something more personal, a little prettier, and tightly connected to daily tasks.

If a feature seems oddly specific, there is a good chance someone in my inner circle requested it and I folded immediately.
