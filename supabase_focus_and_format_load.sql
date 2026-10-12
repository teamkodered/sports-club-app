-- One-off: load the coaches' focus notes (history, oldest -> newest; the newest is the current focus)
-- and the Format card. Run AFTER supabase_focus_notes.sql. Safe to run once; running it twice adds the notes twice.

insert into public.focus_notes (body, created_at) values
($n$Technical – Footwork 🎯
Specific patterns and drills
When and why to use them

Mentality:
Simple… be ready to train$n$, '2025-10-10 18:41'),

($n$Footwork continued 🎯 — big improvements showing 📈

Pendulum step: helps unpredictability, feet ready to respond, keep a moving target
Cut side step: to defend, to create an angle for offence
Side-stepping defence: turn the opponent, create an angle for offence
Turn out: to defend, to create an angle for offence

Try phasing set-piece combinations with footwork patterns.

Fighters in camp (British Champs) do separate work:
Mon/Tue partner/bag work · Thu/Fri circuit style/partner work$n$, '2025-11-07 18:30'),

($n$Starting the year with solid fundamentals and being the hardest worker in the room 🎯

Is the way the focus points and tips are being sent working for everyone? Any ideas to improve, or anything to add / change / less of / more of?$n$, '2026-01-15 12:47'),

($n$Technique tweaks 🎯

Front kick: kick with the ball of the foot, not the heel — helps with power and targeting
Same stance scoop: lift the elbow and slight lay back, cross cover with the rear hand

Fighters: different work on their first session of the week — getting them ready for the Nationals 🥇🏆🏅$n$, '2026-01-19 17:01'),

($n$Leg kicks are the new focus 🎯

Delivery and angle
Lead / Rear
Inside / Outside
Check
Recap and add matcraft/ringcraft drills where we can: corner escapes, tracking, cutting off, turns etc

Mentality:
Improvements rather than perfection

Get junior instructors and those on the course to assist where they can$n$, '2026-06-08 19:47'),

($n$Lead leg development is the new focus 🎯

Delivery and technique
Levels (Leg / Body / Head)
Kicking leg strength and endurance
Anchor leg strength and endurance
Kicking speed
Recap and add leg-kicking drills where we can

Mentality:
Encouragement and teamwork

Get junior instructors and those on the course to assist where they can — warm-down stretching is a good, effective one$n$, '2026-08-25 10:18');

-- Format card
insert into public.settings (key, value) values ('dashboard_format', jsonb_build_object('text', $f$WEEKLY FORMAT
• First session of the week: partner work / sequences
• Second session: equipment / circuit
• More in-depth plan: Quarterly Coaching Framework
  https://www.dropbox.com/scl/fi/q0qaeaeq2qg39540egg1a/Quarterly-Coaching-framework1.xlsx?rlkey=sgpu9a0i528j2qjugc5ogtho1&st=f4d7g9l0&dl=0

CLASS LAYOUT
• Split the class early — in the stretch at the start (by grade / who looks ready to train)
• Give the high grades extra work before drink break / glove up
• One combination (two max if confident) and stack on it if needed, so they can push the pace — high grades thrive on improving the skill: give tweaks and deliberate footwork patterns, explaining when and why
• Two rounds back to back, exercises in between rounds
• Bags always with a partner — pushes the pace, stops pushing/swinging the bag, safer
• New technique / skill: same layout, but start with the technique broken down on its own, then add it into the combination as the session goes on

TIPS
• Save your own training for before/after teaching, not during
• Leave the class on a positive note
• Positive reinforcement
• Sequences / partner work once a week — all partner work needs protective equipment (no headguards)
• Sit students out as a last resort — use other methods first (review discipline options)
• High grades set the standard: if they train hard, the whole class does

CLICKERS
• Juniors: good clicks vs bad clicks for the games/circuit (can carry into the next session). Leaders can help but lose their "clicker licence" if spamming or not being fair 🙂
• Adults: clicks = exercises between rounds

HOUSE SCORING 🏆
• First column for attending and attending in full kit
• Use at the satellite clubs too — it's working really well
• More than one person can be Class Champ
• Keep registers complete — they drive points, missed-session notifications and attendance records

👊🏾📈😎$f$))
on conflict (key) do update set value = excluded.value;
