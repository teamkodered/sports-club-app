# Plan: Team Kode Red website profiles from Klass Champ (saved 22 Oct 2026 -- not started)

Website: teamkodered.com (WordPress) -- Boxing (KRBA) and Kickboxing (KR) athlete profile pages.

## Field mapping (all already in the app)
Name · Photo · House · Age division (from date of birth) · Weight division · Kode Red debut (joined year) ·
Top achievements · Favourite technique · Training music · Results. Optional: fight record (W-L-D), social media / sponsors.

## Steps
1. In-app: 🌐 Website profiles card at the bottom of the coach dashboard + notifications.
   Athlete / coach changes wait for approval; list shows what changed (old -> new); Approve / Send back with a note; Publish all approved.
2. Connect to WordPress (REST API + Application Password stored as a server secret).
3. Trial with one athlete, then switch on for everyone.

Juniors included, only with media consent; every change needs coach approval.

## Still needed
- WordPress Application Password (Users -> profile -> Application Passwords, name "Klass Champ"; keep private, store with a command -- never in chat).
- Screenshot of teamkodered.com/wp-json/wp/v2/types (how the profile pages are built: theme team type / ACF).
- Decide: fight record (W-L-D) and social media / sponsors on the website?
