-- Coaching tools: readable pages (e.g. the Instructor's Handbook) shown inside the app with
-- contents + search. Adds the 'page' type and loads the Derby PKA Instructor's Handbook.
alter table public.coaching_tools add column if not exists body text;
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.coaching_tools'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%'
  loop execute format('alter table public.coaching_tools drop constraint %I', c.conname); end loop;
  alter table public.coaching_tools add constraint coaching_tools_kind_check check (kind in ('doc','video','link','page'));
end $$;

insert into public.coaching_tools (title, description, category, kind, body)
select 'Derby PKA Instructor''s Handbook',
       'Philosophy, class structure, teaching tips, drills, managing students, awards, safety, housekeeping and long-term development.',
       'Handbook', 'page', $hb$<h1>🥋 Derby PKA Instructor’s Handbook</h1>
<h3>Vision:</h3>
<p>To bring people together and learn the best in effective kickboxing,
create better people and in turn great leaders in a safe, fun and
disciplined environment.</p>
<h2>1. ✅ Philosophy</h2>
<ul>
<li><p><strong>Technique first</strong>: Prioritize correct form over
speed or power.</p></li>
<li><p><strong>Positive reinforcement</strong>: Praise effort, hard
work, and technical improvements.</p></li>
<li><p><strong>Clear expectations</strong>: Always set boundaries and
classroom structure early.</p></li>
<li><p><strong>Growth mindset</strong>: Focus on progress, not
perfection.</p></li>
</ul>
<h3>Session Overview</h3>
<h3>Primary Goals:</h3>
<ul>
<li><p>Build towards gradings, end-of-year show, WAKO Nationals /
Internationals.</p></li>
<li><p>Emphasise technique, application, and combinations.</p></li>
<li><p>Support coach development while maintaining class
structure.</p></li>
</ul>
<h2>2. 📋 Class Structure &amp; Setup</h2>
<h3>A. Warm-Up</h3>
<ul>
<li><p>High-tempo warm-ups for juniors and adults.</p></li>
<li><p>Dynamic stretches only at the start. Static stretches are for the
end.</p></li>
<li><p>Bonus points for correct form and full participation.</p></li>
<li><p>No jogging around in the sessions. Instead use:</p>
<ul>
<li><p>One person runs at a time</p></li>
<li><p>Shuttle runs</p></li>
<li><p>Team relays’</p></li>
</ul></li>
</ul>
<h3>B. Class Formats</h3>
<p>Choose based on class size and ability:</p>
<ul>
<li><p><strong>Basics in lines</strong>: Ideal for large
groups.</p></li>
<li><h3>Technique focus in lines</h3></li>
<li><h3>Individual circuit / Group circuit</h3></li>
<li><h3>Partner work</h3></li>
<li><p>Prioritize more punching/kicking than general fitness.</p></li>
</ul>
<ul>
<li><h3>Warm-Up:</h3>
<ul>
<li><p>Agility hoop drills (line and single hoop).</p></li>
</ul></li>
<li><h3>Main Curriculum:</h3>
<ul>
<li><h3>Combination Work:</h3>
<ul>
<li><p>1 combination (stack/pyramid style) or</p></li>
<li><p>1 old + 1 new combination for flow.</p></li>
</ul></li>
<li><h3>Technique Focus:</h3>
<ul>
<li><p>Choose 1 technique from combination, break it down in detail
(how, when, why).</p></li>
<li><p>Teach technique first then combination or vice versa.</p></li>
</ul></li>
</ul></li>
<li><h3>Fighter-Specific Work:</h3>
<ul>
<li><p>Leg set</p></li>
<li><p>combination work</p></li>
<li><p>Footwork pattern</p></li>
<li><h3>2-minute rounds:</h3>
<ol type="1">
<li><p>Bag the combination</p></li>
<li><p>Shadow the same combination</p></li>
<li><p>Introduce new combination</p></li>
</ol></li>
</ul></li>
</ul>
<h3>C. Coaching Flow</h3>
<ul>
<li><p>Use “Set pieces” or syllabus combinations per session (1–2
max).</p></li>
<li><p>Breakdown combinations into:</p>
<ul>
<li><p>Chamber</p></li>
<li><p>Delivery</p></li>
<li><p>Re-chamber</p></li>
<li><p>Recovery</p></li>
</ul></li>
<li><p>Add footwork variations and technical focus rounds.</p></li>
<li><p>Freeze the last shot to reinforce form and flow.</p></li>
<li><p>Recap combinations from previous sessions.</p></li>
<li><p>Work 3 rounds minimum per combination.</p></li>
</ul>
<h3>Session Flow</h3>
<ul>
<li><p>Circuit</p></li>
<li><p>Combination 1 (New)</p></li>
<li><p>Combination 2 (Reinforce)</p></li>
<li><p>Technique Breakdown</p></li>
<li><p>Review: “What 3 things did you learn today?”</p></li>
</ul>
<h3>Coaching Tips</h3>
<ul>
<li><p>Involve coaches-in-training:</p>
<ul>
<li><p>Let them run sections, guide them with feedback.</p></li>
</ul></li>
<li><p>Split sessions by grade:</p>
<ul>
<li><p>High grades get circuits or shadow drills during
transitions.</p></li>
</ul></li>
<li><h3>Key Emphasis:</h3>
<ul>
<li><p>Technique &amp; Application: "How, When, Why"</p></li>
<li><p>Less explaining, more asking.</p></li>
<li><p>Build understanding through questions.</p></li>
<li><p>Teach from standing, not sitting.</p></li>
</ul></li>
</ul>
<h2>3. 🧠 Teaching and Learning Tips</h2>
<ul>
<li><p><strong>Demos</strong>: Coaches demo first. Let students copy,
then correct.</p></li>
<li><p><strong>Corrections</strong>:</p>
<ul>
<li><p>Pick one key focus (e.g. back heel up, lead hand back, hip
rotation)</p></li>
<li><p>Repeat and monitor across rounds</p></li>
<li><p>Praise improvement visibly: “I’ve got one person really focusing
on rotation.”</p></li>
</ul></li>
<li><p><strong>Goal setting</strong>:</p>
<ul>
<li><p>Celebrate progress, not just end results.</p></li>
<li><p>Use “What did you improve from last class?” reflection.</p></li>
<li><p>Award “Class Champ” based on effort and improvement.</p></li>
</ul></li>
</ul>
<h3>Class Management</h3>
<ul>
<li><h3>Before Class:</h3>
<ul>
<li><p>Settle group before starting.</p></li>
<li><p>Set music beforehand (shared playlist).</p></li>
<li><p>Lock door between changeovers.</p></li>
</ul></li>
<li><h3>During Class:</h3>
<ul>
<li><p>Teach from standing.</p></li>
<li><p>Avoid phones unless emergency.</p></li>
<li><p>Avoid overuse of countdowns or last chances.</p></li>
<li><p>Positive reinforcement, especially for challenges.</p></li>
<li><p>Pull out fighters not giving 100%.</p></li>
<li><p><strong>Uniform junior pick-up:</strong> parents must enter
reception.</p></li>
</ul></li>
<li><h3>No Jogging in Room</h3></li>
<li><h3>No Whistling</h3></li>
<li><h3>No Mobile Phone (Emergency Use Only)</h3></li>
</ul>
<h3>Group Structure</h3>
<ul>
<li><p>Split early: Graded groupings.</p></li>
<li><p><strong>High Grades:</strong> Shadow drills/circuits.</p></li>
<li><h3>Fighters:</h3>
<ul>
<li><p>Footwork, flexibility, push-off drills.</p></li>
<li><p>Shadow rounds.</p></li>
</ul></li>
<li><h3>Technical Reminders:</h3>
<ul>
<li><p>Back heel up, sit into stance (60/40).</p></li>
<li><p>Chin down.</p></li>
<li><p>Work full round.</p></li>
</ul></li>
</ul>
<h3>Flexibility Integration</h3>
<ul>
<li><p>Add dynamic stretches during warm-up.</p></li>
<li><p>Passive stretching during cooldown.</p></li>
<li><p>Use high grades to demo or lead.</p></li>
</ul>
<h2>4. 🥊 Technical Drills &amp; Key Focus Areas</h2>
<h3>A. Kicking</h3>
<ul>
<li><p>Emphasize:</p>
<ul>
<li><p>Strong foot position (“No spaghetti foot”)</p></li>
<li><p>Chamber, delivery, re-chamber sequence</p></li>
<li><p>Rotation and hip extension (lead and rear)</p></li>
</ul></li>
<li><p>Drill components separately:</p>
<ul>
<li><p>Drill just chamber</p></li>
<li><p>Chamber + kick</p></li>
<li><p>Chamber + kick + re-chamber</p></li>
</ul></li>
<li><p>Use lines for kicking</p></li>
<li><p>Avoid double Thai pads; use one pad for round kicks with switch
step</p></li>
<li><p>Coach pads in lines (one rep each)</p></li>
</ul>
<h3>B. Pad Work</h3>
<ul>
<li><p>Mix speed, power, and flow rounds</p></li>
<li><p>Focus pad holding position and distance</p></li>
<li><p>Alternate pad holders frequently</p></li>
<li><p>Vary pad work based on class level</p></li>
<li><p>Relaxed pads for beginners to allow punching through</p></li>
</ul>
<h3>C. Bag Work</h3>
<ul>
<li><p>Bring bags out for small classes</p></li>
<li><p>PTs to the ring when bags are used</p></li>
<li><p>Gloves and pads to the count</p></li>
<li><p>No hitting bags without gloves</p></li>
<li><p>Common faults: poor foot position, weak re-chamber, no
rotation</p></li>
<li><p>Improvements: better hip rotation, back heel up</p></li>
</ul>
<h3>Power Round Kick – Coaching Points</h3>
<ul>
<li><p>[v] Knees bent (Charged, quality base)</p></li>
<li><p>[v] Set up (Rotate into hip flexor)</p></li>
<li><p>[v] Drive (Push from floor)</p></li>
<li><p>[v] Rotation (Lift heel, pivot on ball)</p></li>
<li><p>[v] Chamber (Strong foot/leg position)</p></li>
<li><p>[v] Use arms (Thumb down for torque)</p></li>
<li><p>[v] Target (Kick through the line)</p></li>
<li><p>[v] Control breathing</p></li>
<li><p>[v] Use hands &amp; feints to create openings</p></li>
<li><h3>Brown/Black Belts:</h3>
<ul>
<li><p>Add step-then-turn</p></li>
<li><p>Follow through on head kicks</p></li>
<li><p>Add skip step for flow</p></li>
</ul></li>
</ul>
<h3>Drills:</h3>
<ul>
<li><p>Hoop drill (isolate rotation)</p></li>
<li><p>Squat-into-kick drill</p></li>
<li><p>Freezes (hand/chamber focus)</p></li>
</ul>
<h3>Back Kick – Development</h3>
<ul>
<li><p>Skip turn (use hoop for control)</p></li>
<li><p>Always look over shoulder</p></li>
<li><p>Supported leg position drills</p></li>
<li><p>Mario jumps</p></li>
<li><p>One-foot landings (control &gt; height)</p></li>
<li><p>Reinforce leg position during skip turn</p></li>
</ul>
<h3>Push-Up Development</h3>
<ul>
<li><p>Bag, box, wall variations for scaling</p></li>
</ul>
<h3>Core Focus:</h3>
<ul>
<li><p>Planks, crunches between sets/finishers</p></li>
</ul>
<h3>Games &amp; Exercise Check (With Tips)</h3>
<table>
<colgroup>
<col style="width: 37%" />
<col style="width: 62%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>Activity</strong></th>
<th><strong>Key Tips</strong></th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td>Plank Pick-Ups</td>
<td>Freeze if anything but hands/feet touch floor</td>
</tr>
<tr class="even">
<td>Bear Walks</td>
<td>Tuck jump before turning to avoid head clashes</td>
</tr>
<tr class="odd">
<td>Jump Box (Low/Supported)</td>
<td>Use low boxes; step/stand safely</td>
</tr>
<tr class="even">
<td>Bag Work (Heavy Kicks)</td>
<td>Always 1 holder per bag</td>
</tr>
<tr class="odd">
<td>Shuttle Runs</td>
<td>Add tuck jump if short distance</td>
</tr>
<tr class="even">
<td>5s and 3s Game</td>
<td>Reward form over speed</td>
</tr>
<tr class="odd">
<td>Straight Punch Drill</td>
<td>Pull students needing technical correction</td>
</tr>
<tr class="even">
<td>Noughts &amp; Crosses (Mats)</td>
<td>Marker must touch pad</td>
</tr>
<tr class="odd">
<td>Noughts &amp; Crosses (Cones)</td>
<td>Control movement during transitions</td>
</tr>
<tr class="even">
<td>Head, Shoulders, Knees</td>
<td>Stay in lanes</td>
</tr>
<tr class="odd">
<td>Sprint &amp; Exercise</td>
<td>Poor form = freeze out</td>
</tr>
<tr class="even">
<td>Traffic Light Drills</td>
<td>Clear signals, mix speed levels</td>
</tr>
<tr class="odd">
<td>Pass the Pad</td>
<td>No throwing; dropped = freeze team</td>
</tr>
<tr class="even">
<td>Dice/Card Workouts</td>
<td>Scale to ability</td>
</tr>
<tr class="odd">
<td></td>
<td></td>
</tr>
<tr class="even">
<td></td>
<td></td>
</tr>
</tbody>
</table>
<h3>Coach Development</h3>
<ul>
<li><p>Less talking, more coaching.</p></li>
<li><p>Let assistants lead sections with support.</p></li>
<li><p>Review own and each other’s sessions:</p>
<ul>
<li><p>What worked well?</p></li>
<li><p>What needs improving?</p></li>
</ul></li>
<li><p>Access/download past sessions from Centre PC.</p></li>
</ul>
<h2>5. 🧑‍🏫 Managing Students</h2>
<h3>A. Behaviour Management (Juniors/Tinys)</h3>
<ul>
<li><p>Rules:</p>
<ul>
<li><p>No whistling, no random noises, no talking when coach is
talking</p></li>
<li><p>No throwing, lying down, cartwheels, running into
reception</p></li>
<li><p>No bag work without gloves or kicking without boots</p></li>
<li><p>No phone use (coaches only for emergencies)</p></li>
</ul></li>
<li><p>Disruption response:</p>
<ul>
<li><p>Sit or stand student (opposite to the class)</p></li>
<li><p>One verbal correction max</p></li>
<li><p>Use sticker-on-glove system: Special sticker for big
achievers</p></li>
<li><p>Sticker rewards mid or end of class</p></li>
<li><p>"I've got one person sitting smart..." – call out
positives</p></li>
<li><p>Award all apart from “Challenging student”</p></li>
<li><p>Highlight positive efforts</p></li>
</ul></li>
</ul>
<h3>Behaviour &amp; Class Management</h3>
<h3>Tinys:</h3>
<ul>
<li><p>No talking when coach is talking</p></li>
<li><p>Listen</p></li>
<li><p>Concentrate</p></li>
<li><p>Work Hard</p></li>
<li><p>Sticker rewards</p></li>
<li><p>Sit or stand student (opposite to the class)</p></li>
</ul>
<h3>Juniors:</h3>
<ul>
<li><p>Ready stance and bow for partner work and demos</p></li>
<li><p>No noises/sound effects/whistling etc</p></li>
<li><p>Help lead warm-ups, setup/pack kit.</p></li>
<li><p>Clear Counting out loud (in English or other languages)</p></li>
<li><p>Sticker rewards</p></li>
<li><p>House points rewards</p></li>
</ul>
<h3>Teens:</h3>
<ul>
<li><p>Ready stance &amp; bowing.</p></li>
<li><p>Self check-in.</p></li>
<li><p>Help lead warm-ups, setup/pack kit.</p></li>
<li><p>Ready stance and bow for partner work and demos</p></li>
<li><p>No noises/sound effects/whistling etc</p></li>
<li><p>Sticker rewards</p></li>
<li><p>House points rewards</p></li>
</ul>
<h3>Seniors:</h3>
<ul>
<li><p>Ready stance &amp; bowing.</p></li>
<li><p>Self check-in.</p></li>
<li><p>Help lead warm-ups, setup/pack kit.</p></li>
</ul>
<h3>Hydration</h3>
<ul>
<li><p>[v] Remind students: before, during, and after class.</p></li>
</ul>
<h3>B. Leadership and Team Roles</h3>
<ul>
<li><p>Leaders to help with:</p>
<ul>
<li><p>Equipment collection</p></li>
<li><p>Taking stretch</p></li>
<li><p>Buddying new students</p></li>
</ul></li>
<li><p>Encourage students to take pride in discipline and
leadership</p></li>
</ul>
<h2>6. 🎖 Awards, Feedback &amp; Development</h2>
<ul>
<li><p><strong>Class Champ</strong>:</p>
<ul>
<li><p>Award at start of each session based on previous class</p></li>
<li><p>No full kit = no class champ eligibility</p></li>
<li><p>House points for small wins (e.g. best back heel up)</p></li>
</ul></li>
<li><p><strong>Feedback</strong>:</p>
<ul>
<li><p>3 specific coaching points per session per student</p></li>
<li><p>Visual praise helps – video feedback where possible</p></li>
</ul></li>
<li><p><strong>Fighter Development</strong>:</p>
<ul>
<li><p>High tempo combinations for fighters</p></li>
<li><p>Ad hoc sparring prep sessions Tues/Wed/Thurs 8PM</p></li>
<li><p>Monitor for selection &amp; issue congratulatory letters</p></li>
</ul></li>
</ul>
<h2>7. 🛠 Troubleshooting &amp; Admin</h2>
<h3>A. Technical Issues</h3>
<ul>
<li><p>Laptop not powering: check socket, extension, battery</p></li>
<li><p>Mouse frozen: Ctrl + F5</p></li>
<li><p>Register not loading: check Wi-Fi</p></li>
</ul>
<h3>B. Safety Reminders</h3>
<ul>
<li><p>Kicking gloves only with kick boots</p></li>
<li><p>Avoid burpees or heavy leg raises for younger ones</p></li>
<li><p>Use bands over ropes</p></li>
<li><p>No standing stretches for tinys – use floor stretches</p></li>
</ul>
<h2>8. ✅ Housekeeping &amp; Extra Tips</h2>
<ul>
<li><p><strong>Housekeeping</strong>:</p>
<ul>
<li><p>Clear up pads, gloves post-class (leaders help)</p></li>
<li><p>Belts checked at start and end</p></li>
<li><p>No sitting between rounds (unless injured)</p></li>
<li><p>Coaches teach standing up (PTs/squad are exceptions)</p></li>
</ul></li>
<li><p><strong>Session Flow</strong>:</p>
<ul>
<li><p>No coach individual pads—monitor whole class</p></li>
<li><p>Fighters only - Timed circuits: write time on board</p></li>
<li><p>Multi kicking drills, power jumps, bear crawls</p></li>
<li><p>Use stretch as cooldown and technical reinforcement</p></li>
</ul></li>
<li><p><strong>Class Setup Resources</strong>:</p>
<ul>
<li><p>Table</p></li>
<li><p>Display folder</p></li>
<li><p>Join folders</p></li>
<li><p>Music (approved)</p></li>
<li><p>Reception manned for breaks</p></li>
</ul></li>
</ul>
<h2>9. 💬 Communication &amp; Culture</h2>
<ul>
<li><p>Encourage “Yes Coaches!” – discipline and engagement</p></li>
<li><p>Use martial arts etiquette: bow in/out with quality</p></li>
<li><p>Greet every student with Ps, Qs, “How are yous”</p></li>
<li><p>Build rapport with students and parents</p></li>
</ul>
<h2>10. 📈 Long-Term Development</h2>
<ul>
<li><p>Stick with syllabus and scenario training</p></li>
<li><p>Rotate combinations weekly, repeat and build</p></li>
<li><p>Footwork focus throughout:</p>
<ul>
<li><p>Basic, pivot, step turn, slip turn, roll turn</p></li>
</ul></li>
<li><p>Monitor squad members and send updates</p></li>
<li><p>Be consistent with corrections – same cues each week</p></li>
</ul>
<h3>Final Note:</h3>
<p><strong>“Try and praise the hard work, not just the result. The
effort a student puts in today becomes their confidence
tomorrow.”</strong></p>
<p>Let your coaching reflect our values: structure, energy, clarity, and
belief in every student.</p>
$hb$
where not exists (select 1 from public.coaching_tools where title = 'Derby PKA Instructor''s Handbook');
