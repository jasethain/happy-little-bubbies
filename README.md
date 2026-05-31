# Happy Little Bubbies, Firebase-ready build

This is a secure-ready React/Vite project for the Happy Little Bubbies app.

It includes:

- Firebase Authentication
- Invite-only registration flow
- Firestore database connection
- Firebase Storage upload connection
- Private Inbox starter
- Chat starter with media upload
- Mentor Lounge submissions
- Story Corner requests
- Swap Meet / Free To Good Home listings
- No Naughty Business reports
- Helper Bubby role naming
- Firestore security rules
- Storage security rules

## Important

This is Firebase-ready, but not fully launched until you:

1. Create a Firebase project.
2. Add your Firebase config to `.env`.
3. Publish the Firestore and Storage rules.
4. Create your first Helper Bubby/admin user.
5. Add real invite codes in Firestore.
6. Deploy using Vercel or Firebase Hosting.

## Setup for a developer or guided install

```bash
npm install
cp .env.example .env
npm run dev
```

Then paste your Firebase web app config into `.env`.

## First admin account

Create your user through the app, then in Firestore change your user document to:

```json
{
  "role": "helperBubby",
  "status": "approved",
  "badges": ["🧸 Helper Bubby", "☁️ Guardian of the Playroom", "🌈 Keeper of the Bubbles"]
}
```

## Invite codes collection

Create documents in `inviteCodes` like this:

```json
{
  "code": "BUBBIES-2026",
  "used": false,
  "createdBy": "helperBubby",
  "createdAt": "server timestamp"
}
```

## Production checklist

Before inviting real users:

- Turn on email verification.
- Enable admin-only invite creation.
- Approve members before they can use community rooms.
- Review reporting workflow.
- Add blocking.
- Add moderation queue for uploads and swap listings.
- Add clear community rules and privacy policy.
- Add backups and audit logs.
