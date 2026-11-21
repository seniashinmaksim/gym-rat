# Gym Rat — private hypertrophy analytics

A private, password-protected, client-side-encrypted web app that analyses your training and answers one question:

> **What is falling behind, how many quality working sets does each muscle still need this week, and what should I prioritise today?**

It is an analytics system, not a workout planner: train naturally (full body or anything else) and the app tells you where you stand.

## Features

- **Weekly dashboard** — per muscle: target range, effective sets completed (direct vs indirect), **remaining sets**, a "today ≈ N" share (remaining ÷ sessions likely left), recovery estimate, progression trend, and a front/back body map.
- **Quality-adjusted, fractional volume** — warm-ups excluded; effort (RIR) and muscle participation (1.0 / 0.5 / 0.25) kept separate; configurable model; history recalculated when coefficients change.
- **Learning Mode (first ~30 days)** — observes your real training, labels targets provisional, then produces a baseline report and individualised targets with confidence ratings.
- **Per-machine progression** — gym → equipment instance → exercise → history; loads from different machines are never compared. Double-progression load suggestions and exercise-specific warm-ups.
- **Recovery**, **periodization / deload assessment**, **weekly and baseline reports**, **body tracking** with encrypted progress photos.
- **Claude integration** — describe a workout in plain English or Russian; Claude converts it to the documented `gymrat.workout` JSON (see `CLAUDE.md`, `WORKOUT_PARSING.md`), you paste it into **Import from Claude**, resolve anything uncertain and save. Duplicates are blocked.

## Privacy model

| Protected | Not protected |
|---|---|
| All workouts, equipment, gyms, photos, body data, settings — encrypted with AES-256-GCM in your browser's IndexedDB | The app's source code and UI (the GitHub Pages site is public) |
| Your password (never stored; PBKDF2-SHA-256, 600 000 iterations) | The fact that a vault exists in this browser and the record *types* stored |
| Backups (encrypted with a password you choose) | Anything you export as plain JSON on purpose |

No data is sent anywhere: no backend, no analytics, no third-party servers (enforced by a Content-Security-Policy). Data stays in the browser where you created it; use encrypted backups to move it. **There is no password recovery.**

The vault locks automatically after inactivity (configurable) and with **Lock now**.

## Local development

1. Install **Node.js LTS** (https://nodejs.org or `winget install OpenJS.NodeJS.LTS`).
2. In the project folder:

```
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (analytics, security, importer)
npm run build      # typecheck + production build in dist/
npm run preview    # serve the production build locally
```

## Using it on your phone

Gym Rat is designed to be used one-handed, by touch, between sets.

1. **Deploy it to GitHub Pages first** (see below). Phones need an **HTTPS** address: the browser's encryption API (Web Crypto) is disabled on plain `http://` addresses, so opening your PC's dev server over Wi-Fi will not work.
2. Open `https://<your-user>.github.io/<repo>/` on the phone.
3. **Install it to the Home Screen** so it opens full-screen like an app and works offline in the gym:
   - iPhone (Safari): Share → *Add to Home Screen*.
   - Android (Chrome): ⋮ menu → *Install app* / *Add to Home screen*.
4. On first open, the app asks you to **set your password** (typed twice). From then on, that password unlocks the app. It is never stored anywhere and is never in the code. It is the key that decrypts your data, so it cannot be recovered.
5. Your data lives **only in that phone's browser**. Export an encrypted backup regularly (Settings → Backup & restore) and keep it somewhere private. On iPhone, installing to the Home Screen also protects the data from Safari's automatic clean-up of rarely visited sites. The app also asks the browser for persistent storage.

## Deploy to GitHub Pages

1. Push this repository to GitHub (branch `main`).
2. Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Every push to `main` runs `.github/workflows/deploy.yml` (install, test, build, deploy). You can also run it manually from the **Actions** tab.

The build uses relative paths (`base: './'`) and hash-based routing, so it works at `https://<user>.github.io/<any-repo-name>/` without configuration. Your training data is **never** part of the repository or the deployment.

## First run — setting the password

Open the site, choose a strong passphrase (≥10 characters; 4+ random words is ideal) and confirm it. This creates the encrypted vault in that browser. Change it later in **Settings & backup → Password** (the data key is re-wrapped; no data is re-encrypted or lost).

## Importing workouts from Claude

1. Tell Claude about the session in normal language (English or Russian). Claude follows `CLAUDE.md` and returns a `gymrat.workout` JSON block plus a list of assumptions.
2. Correct anything wrong in the chat.
3. In the app open **Import from Claude**, paste the JSON (or upload the file), resolve highlighted items (gym, unmatched exercise names, unidentified machines), review the sets and save.

Format reference: `docs/WORKOUT_SCHEMA.md`, JSON Schema `docs/schema/workout-import.v1.schema.json`, examples `WORKOUT_PARSING.md`.

## Backups

- **Export:** Settings & backup → *Export encrypted backup*. You choose the backup password (it can differ from the vault password). The file contains all data and photos, encrypted.
- **Restore on the same device:** Settings & backup → *Restore backup* (replaces all current data after confirmation).
- **Restore on a new device/browser:** on the first-run screen create the vault with the **same password as the backup** and attach the backup file; or create a vault normally and restore from Settings.
- Keep backups somewhere safe (they are encrypted, but treat them as private). They are git-ignored.

## Maintaining CLAUDE.md

`CLAUDE.md` holds generic interpretation rules, the exercise id table and the data workflow — **never personal data**. Update it (together with `WORKOUT_PARSING.md`, `docs/WORKOUT_SCHEMA.md`, the JSON Schema and `tests/importer.test.ts`) whenever the import format, exercise library or parsing conventions change. The test suite validates every JSON example in `WORKOUT_PARSING.md`.

## Project structure

```
src/domain   pure analytics logic (volume, quality, targets, recovery, progression, reports, importer)
src/data     exercise library (EN/RU names, aliases, coefficients)
src/lib      crypto, encrypted IndexedDB, store, backups
src/ui       React screens and components
docs/        schema docs, JSON Schema, research brief
tests/       vitest suites
```

## Limitations

- Coefficients, quality credits, targets and recovery windows are evidence-informed **estimates**, not measurements. They are all visible and adjustable.
- One month of data describes training behaviour; it cannot show which muscles grow faster.
- Strength progression and volume are not proof of muscle growth; body measurements and photos over months are better (but still imperfect) indicators.
- Data lives in one browser profile; clearing site data deletes it — keep encrypted backups.
