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
AUTH_SECRET="generate_with_npx_auth_secret"
AUTH_GOOGLE_ID="your_google_oauth_client_id"
AUTH_GOOGLE_SECRET="your_google_oauth_client_secret"
```

Generate `AUTH_SECRET` with:

```bash
npx auth secret
```

Use the same `AUTH_SECRET` value in production. Changing it invalidates existing login cookies.

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

## Google Calendar authorization

The app refreshes expired Google access tokens automatically. **Refresh status**
also checks the Calendar API, so revoked or expired Google consent is detected.
If Google rejects the refresh token, settings offers **Reconnect Google Calendar**
to obtain new offline consent. Temporary Google failures show an error without
discarding credentials.

Repeated consent can also come from the OAuth project's publishing status:
Google [limits refresh tokens for external apps in Testing to seven days](https://developers.google.com/identity/protocols/oauth2#expiration)
when Calendar scopes are requested. App code cannot extend those tokens or remove
Google's unverified-app warning.

For the deployed app, configure the project that owns `AUTH_GOOGLE_ID`:

1. In Google Cloud Console, open **Google Auth Platform → Audience** and publish
   the production OAuth app to **In production**. Keep development in a separate
   project. Publishing alone does not remove the unverified-app warning.
2. Under **Branding**, supply the app name, support/contact emails, public home
   page, and a privacy policy describing how the app accesses, uses, stores, and
   shares Google data. Verify the authorized domain's ownership.
3. Under **Data Access**, declare the scopes used by the app:
   `https://www.googleapis.com/auth/calendar.events` and
   `https://www.googleapis.com/auth/calendar.calendarlist.readonly`, alongside
   `openid`, `email`, and `profile` for sign-in.
4. Complete Google's [brand and sensitive-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification).
   Include a demonstration of consent, event sync, and selecting other calendars.
   Google must approve the request to remove the unverified-app warning.
5. Reconnect Google Calendar once after publishing to replace credentials issued
   during Testing. Tokens can still be revoked by the user or Google later.

## Event guests and details

After saving an event, open its details and choose **Invite guests**. This action
is available when Google Calendar is connected and sync is enabled.

The connection status is shared in React state for the current page, initialized
from the signed-in user's stored connection and checked once in the background.
Opening another event reuses that status immediately. **Refresh status** updates
it, and expired authorization detected while inviting guests clears eligibility.
The server still checks authorization for every guest request.

Enter guest email addresses in the centered modal, pressing Enter (or **Add**) after each
address to build the guest list. Remove a guest with its × button, then choose
**Send invitations** when the list is ready. Google sends the invitation
emails; existing guests and their RSVP responses are preserved. Google organizer
access is required, and events from read-only calendars cannot receive invitations
here. A recurring event defaults to **This occurrence only**; choose **Entire
recurring series** explicitly to invite guests to every occurrence.

Imported recurrence rules are displayed as readable schedules. Event descriptions
support basic formatting and safe links; scripts, embedded resources, and unsafe
links are excluded. Long details scroll below the popup header.

## Dependency security

`@next/eslint-plugin-next` still pulls in `braces`, which has
[no patched release for its stack-exhaustion advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
The scoped npm override replaces only that plugin's `fast-glob` with `tinyglobby`,
which provides the `globSync` API the plugin uses and removes the vulnerable chain.
Keep the override until upstream removes or fixes that dependency. This project
uses Next's default ESLint root directory; recheck glob compatibility before
adding custom `settings.next.rootDir` patterns (directory expansion defaults
differ), or upgrading the plugin. Run `npm audit`, `npm test`, and `npm run lint`
after dependency updates.

## Why this exists

I wanted a calendar that feels better to look at and nicer to use day-to-day.

Google Calendar is powerful, but I wanted something more personal, a little prettier, and tightly connected to daily tasks.

If a feature seems oddly specific, there is a good chance someone in my inner circle requested it and I folded immediately.
