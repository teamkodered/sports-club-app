# Klass Champ — Android app

The Android app is a thin wrapper (Capacitor) around the live web app at
https://klasschamp.netlify.app, plus one native piece: reading **Health Connect**
(Samsung Health, Google Fit / Fitbit, Garmin, Oura… on Android) and sending it to
the `wearable-ingest` edge function.

Because it loads the live site, **web changes go live in the app immediately via
Netlify** — you only rebuild/republish the app when something *native* changes
(the Health Connect plugin, permissions, icon, version).

## One-time set-up (Windows PC)

1. Install **Android Studio** (free): https://developer.android.com/studio
   During setup accept the SDK licences. Default settings are fine.
2. In PowerShell, in the project folder: `npm install` (gets Capacitor).
3. `npx cap sync android` — copies the web build config into the Android project.
4. `npx cap open android` — opens the project in Android Studio. The first open
   downloads Gradle and dependencies (a few minutes). Let it finish.

## Running on a phone for testing

1. On the phone: Settings → About phone → tap **Build number** 7 times to enable
   Developer options, then Developer options → **USB debugging** on.
2. Plug the phone in, pick it in Android Studio's device dropdown, press ▶ Run.
3. In the app: Athlete app → Wearables → Samsung Health → **Connect →**. Health
   Connect asks for permission; allow all. The first sync pulls the last 30 days.

Health Connect is built into Android 14+. On Android 13 and below it's an app
from the Play Store ("Health Connect by Android") — install it first.

## Sharing a test build (before the Play Store listing)

Android Studio → Build → **Build App Bundle(s) / APK(s)** → **Build APK(s)**.
Send the APK to testers; they tap it to install (Android asks to allow installs
from that source). Fine for a handful of testers.

## Publishing to the Play Store

1. Android Studio → Build → **Generate Signed App Bundle** → create a keystore
   (**back it up — losing it means you can never update the app**) → release .aab.
2. Play Console → Create app → upload the .aab under Testing → Internal testing
   first, then Production.
3. Play Console → Policy → **Health apps declaration**: declare Health Connect use
   (fitness/coaching, read-only, data shown to the athlete and their coach).
   Privacy policy: https://klasschamp.netlify.app/privacy
4. Bump `versionCode`/`versionName` in `android/app/build.gradle` for each release.

## Where things are

- `capacitor.config.json` — app id `uk.org.derbykickboxing.klasschamp`, loads the live site
- `android/app/src/main/java/.../HealthConnectPlugin.kt` — reads Health Connect
- `android/app/src/main/AndroidManifest.xml` — health permissions + rationale intents
- `src/lib/healthConnect.js` — web side: permissions, sync, auto-sync on app open
- `supabase/functions/wearable-ingest` — receives the data
