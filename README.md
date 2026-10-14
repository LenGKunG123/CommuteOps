# CommuteOps MVP

PWA starter for comparing commute options. The current route cards are **demo data only**; the app does not yet call a real routing API or display live bus GPS/ETA.

## Requirements

- Node.js 20.9+ recommended
- npm

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Current features

- Responsive Thai-language UI for mobile and desktop
- Origin and destination inputs, including swap
- Sort demo options by overall balance, time, walking, or transfers
- Save/unsave demo route cards for the current session
- PWA manifest and a minimal service worker shell
- Explicit labeling to avoid confusing demo numbers with real estimates

## Important limitations

- Route durations, transfers, walking minutes, and route types are placeholders for UI development only.
- No API integration, no live GPS/ETA, no verified route coverage, and no persistence for saved routes yet.
- PWA icons are not included yet; add correctly sized icons before production.
- Offline behavior is a basic shell fallback, not a complete offline data strategy.

## Next implementation step

Create a server-side routing adapter (for example `src/lib/routing/provider.ts`) and test a documented provider against real Bangkok origin/destination pairs. Only replace demo cards after validating real responses. Keep provider API keys on the server, not in client-side code.

## Suggested next structure

```text
src/
  app/
    api/routes/route.ts     # server-side API proxy (next step)
    page.tsx
    layout.tsx
    globals.css
  lib/routing/
    types.ts                # normalized route schema (next step)
    provider.ts             # provider adapter (next step)
public/
  manifest.json
  sw.js
```


## Personal commute presets (v2)

The home screen includes two quick presets based on the user's stated waiting windows:
- Morning: wait at Talat Pracha Uthit 76 between 06:40–07:00; destination BTS Sala Daeng.
- Evening: wait in front of Silom Complex between 18:10–18:20; destination Pracha Uthit 91.

These are user-entered planning windows, not live departure predictions. Route durations, transfers, fares, and route details remain demo data until a verified routing provider is integrated.
