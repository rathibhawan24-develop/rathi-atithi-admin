# Rathi Atithi Bhawan — Admin Dashboard

Production admin panel for managing bookings, rooms, payments, and guests at Rathi Atithi Bhawan, Vrindavan.

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** + **shadcn/ui** components
- **Supabase** for database, auth, and file storage
- Deployed on **Vercel**

## Prerequisites

- Node.js 20+ (`node --version` to check)
- A Supabase project with the schema applied
- Supabase Project URL and anon key

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Make sure .env.local has your Supabase keys
#    (Already populated for the Rathi Atithi Bhawan project)

# 3. Run the dev server
npm run dev

# 4. Open http://localhost:3000
#    You'll be redirected to /login. Sign in with the user
#    you created in Supabase Auth → Users.
```

## Project structure

```
app/
  layout.tsx              Root layout with fonts and metadata
  globals.css             Global CSS with refined hospitality palette
  login/
    page.tsx              Login UI
    actions.ts            Server action for sign-in
  (dashboard)/            Protected routes (auth required)
    layout.tsx            Sidebar + main content layout
    page.tsx              Dashboard home with today's stats

components/
  ui/                     shadcn-style primitives (Button, Input, Card, Label)
  nav/
    sidebar.tsx           Main sidebar navigation

lib/
  supabase/
    client.ts             Browser Supabase client
    server.ts             Server component Supabase client
    middleware.ts         Middleware helper (session refresh, redirects)
  types.ts                TypeScript types for the database schema
  utils.ts                Helper functions (cn, formatCurrency, formatDate)

middleware.ts             Next.js middleware (calls auth helper on every request)
```

## What works right now

- ✅ Login flow with email/password
- ✅ Session-based auth via secure cookies
- ✅ Automatic redirect to `/login` for unauthenticated requests
- ✅ Automatic redirect away from `/login` if already signed in
- ✅ Dashboard home with live stats (check-ins today, pending bookings, outstanding balance)
- ✅ Sidebar navigation with active state
- ✅ Sign out
- ✅ Profile/role verification (must exist in `public.profiles` and be `is_active`)

## What's not built yet (next phases)

- Rooms management (list, edit, upload photos)
- Add-on management
- Bookings list with search & filter
- Calendar grid view
- Booking detail page with payment ledger
- Walk-in booking flow
- Price overrides for festivals/weekends
- Reports (daily reconciliation, monthly revenue)
- Settings page

## Deployment

This repo is configured for **Vercel**. After pushing to GitHub:

1. Import the repo on Vercel (it auto-detects Next.js)
2. Add the same environment variables from `.env.local` to Vercel's project settings
3. Deploy

The middleware and server actions all work in Vercel's serverless runtime.
