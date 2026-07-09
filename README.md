# Phoenix Sports Club App

A full-stack sports club management app built with React + Vite + Supabase, ready to deploy on Netlify.

---

## Quick start

### 1. Set up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. In the Supabase dashboard, go to **SQL Editor**
3. Paste the contents of `supabase_schema.sql` and click **Run**
4. Go to **Settings → API** and copy:
   - Project URL
   - `anon` public key

### 2. Configure environment variables

Copy `.env.example` to `.env.local`:

```
cp .env.example .env.local
```

Fill in your Supabase values:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Install and run locally

```bash
npm install
npm run dev
```

App runs at http://localhost:5173

---

## Deploy to Netlify

### Option A — Drag and drop (simplest)

1. Run `npm run build` locally
2. Go to [netlify.com](https://netlify.com) → your account
3. Drag the `dist/` folder onto the Netlify deploy area
4. Go to **Site settings → Environment variables** and add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Trigger a redeploy

### Option B — Connect GitHub (recommended for ongoing updates)

1. Push this folder to a GitHub repo
2. In Netlify: **Add new site → Import from Git**
3. Select your repo
4. Build settings are auto-detected from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Add environment variables under **Site settings → Environment variables**
6. Deploy

---

## Importing your existing member data

Once deployed, log in as admin and go to **Import data**.

### From Google Sheets

1. Open your Google Sheet
2. Share → Anyone with the link → Viewer
3. Paste the URL in the Import page

### From CSV

1. In Google Sheets: File → Download → CSV
2. Upload the file on the Import page

**Expected column names** (flexible matching included):

| Column | Variants accepted |
|--------|------------------|
| first_name | First Name, firstname |
| last_name | Last Name, lastname |
| email | Email |
| phone | Phone |
| house | House, house_name |
| role | Role |
| status | Status |
| joined_date | Joined Date, joined |
| member_id | Member ID |

---

## App routes

| Route | Access | Description |
|-------|--------|-------------|
| `/join` | Public | Membership registration form |
| `/login` | Public | Member login |
| `/dashboard` | Members | Season overview |
| `/members` | Members | Member directory |
| `/houses` | Members | House standings |
| `/fixtures` | Members | Fixtures & results |
| `/league` | Members | Full league table |
| `/profile` | Members | Edit own profile |
| `/import` | Admin only | Import data from Sheets/CSV |

---

## Creating your first admin account

1. Register via `/join`
2. In Supabase dashboard → Table Editor → members
3. Find your record and change `role` to `admin`
4. Log in — you'll now see the Admin nav section

---

## Adding members manually vs self-registration

- **Self-registration**: share the `/join` link with members
- **Manual**: admin goes to Members page → add (coming in next update)
- **Bulk import**: use the Import page

---

## Tech stack

- **Frontend**: React 18 + Vite
- **Router**: React Router v6
- **Backend**: Supabase (Postgres + Auth + RLS)
- **Hosting**: Netlify
- **Styling**: Plain CSS with CSS variables (no dependencies)
