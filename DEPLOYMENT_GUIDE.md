# 🏁 NASCAR Fantasy League — Deployment Guide

**Total time: ~30 minutes | Cost: $0 forever**

You'll be using two free services:
- **Supabase** → Your database (stores all league data)
- **Vercel** → Hosts the website (everyone accesses it here)

---

## STEP 1 — Create a Supabase Account & Database

1. Go to **https://supabase.com** and click **Start your project**
2. Sign up with your GitHub account (or create a free account)
3. Click **New project**
   - Name it: `nascar-fantasy`
   - Set a database password (save this somewhere safe)
   - Choose the region closest to you
   - Click **Create new project** (takes ~2 minutes)

4. Once your project is ready, click **SQL Editor** in the left sidebar
5. Click **New query**
6. Open the file `supabase_schema.sql` from the project folder
7. Copy ALL the contents and paste them into the SQL editor
8. Click **Run** (the green button)
   - You should see "Success. No rows returned" — that's correct!

9. Now go to **Settings → API** in the left sidebar
10. Copy these two values (you'll need them in Step 3):
    - **Project URL** (looks like: `https://abcdefgh.supabase.co`)
    - **anon public** key (a long string starting with `eyJ...`)

---

## STEP 2 — Get the Code onto GitHub

You need a free GitHub account to deploy to Vercel.

1. Go to **https://github.com** and sign in (or create a free account)
2. Click the **+** icon → **New repository**
   - Name: `nascar-fantasy`
   - Keep it **Public**
   - Click **Create repository**

3. Now upload the project files:
   - Click **uploading an existing file** on the new repo page
   - Drag the entire `nascar-fantasy` folder contents into the browser
   - Click **Commit changes**

   > **Tip:** If drag-and-drop doesn't work for folders, you can use
   > GitHub Desktop (free app at https://desktop.github.com) to push the folder.

---

## STEP 3 — Deploy to Vercel

1. Go to **https://vercel.com** and click **Sign Up**
2. Choose **Continue with GitHub**
3. Click **Add New → Project**
4. Find your `nascar-fantasy` repository and click **Import**
5. Before clicking Deploy, click **Environment Variables** and add these:

   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase Project URL from Step 1 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key from Step 1 |
   | `NEXT_PUBLIC_ADMIN_PASSWORD` | A password you choose (e.g. `nascar2025`) |

6. Click **Deploy** and wait ~2 minutes
7. Vercel will give you a URL like `nascar-fantasy-abc123.vercel.app`
   - **Share this URL with everyone in your league!**

---

## STEP 4 — Set Up Your League (Admin Steps)

Go to your new website URL and click **Admin** in the top navigation.

### 4a. Create the Season
1. Enter a name (e.g. "2025 NASCAR Fantasy") and year
2. Click **Create & Activate Season**

### 4b. Add Players
1. Type each player's name on a separate line (in draft order)
2. Click **Add Players**
   - Example: 4 players = Alice, Bob, Carol, Dave

### 4c. Add Drivers
1. Click **Import 20 Default Drivers** to load the current Cup Series roster
   - Or add custom drivers manually with the form below

### 4d. Start the Draft
1. Click the **Draft Control** tab
2. Verify it shows your players and the correct number of rounds
3. Click **🚦 Start Draft**

---

## STEP 5 — Running the Draft

1. Share the URL with all players
2. Everyone goes to the site and clicks **Draft Room**
3. Each player selects their name from the "You are playing as:" dropdown
4. The Draft Room shows:
   - Who is currently picking
   - All available drivers (searchable)
   - The draft board updating live
5. When it's your turn, click a driver name to pick them
6. The board updates instantly for everyone! 🎉

---

## STEP 6 — Entering Race Results Each Week

1. Go to Admin → **Race Results** tab
2. Click **Add a Race** and fill in the race name, track, and week number
3. After the real race runs:
   - Select the race from the dropdown
   - Enter each driver's finish position (1 = winner)
   - Click **💾 Save Results**
4. Results immediately appear on the **Results** page
5. Standings update automatically on the home page

---

## FAQ

**Q: Can I change the drivers list?**
A: Yes — go to your Supabase dashboard → Table Editor → drivers table.
   You can edit, add, or delete rows directly.

**Q: What if someone makes a wrong pick during the draft?**
A: Go to Supabase → Table Editor → draft_picks and delete the wrong row.
   Then the pick slot opens back up.

**Q: How do I reset for next year?**
A: In Admin → Season Setup, create a new season with the new year.
   It will automatically deactivate the old season. Then start fresh!

**Q: The site isn't updating after I push code changes to GitHub**
A: Vercel auto-deploys on every GitHub push — give it 2-3 minutes.

**Q: I forgot the admin password**
A: Go to Vercel → your project → Settings → Environment Variables
   and update `NEXT_PUBLIC_ADMIN_PASSWORD`.

---

## Sharing With Your League

Just send everyone the Vercel URL. No app download, no accounts needed —
it works in any browser on phone or desktop.

Bookmark-worthy pages:
- `/` → Season Standings
- `/draft` → Live Draft Room
- `/results` → Weekly Race Results
