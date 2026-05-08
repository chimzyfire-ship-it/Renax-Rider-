# RENAX Rider

RENAX Rider is the delivery execution app for the RENAX field network. It is designed for riders handling first-mile pickup, terminal relay handoffs, and final-mile delivery while staying visible to dispatch and customers in real time.

## What this app handles

- Rider authentication and profile hydration
- Online and offline availability with persistent rider presence
- Open-job visibility based on rider state and dispatch stage
- Active-job execution for pickup, relay, terminal handoff, and delivery completion
- Proof capture through OTP, QR scans, photos, signatures, and stage updates
- Terminal task visibility and rider job history

## Product highlights

- Persistent online state so riders can stay available across restarts
- Live location publishing tied to active shipments and customer tracking
- Smart job flow for marketplace acceptance and active delivery execution
- Proof workflow for pickup OTP, delivery OTP, QR scans, proof photos, and signature capture
- Terminal task surface for relay shipments and hub-based operations
- Offline-aware proof and ping queueing so work can continue through weak connectivity

## Stack

- Expo + React Native + Expo Router
- TypeScript
- Supabase Auth, Postgres, Storage, and Realtime
- Expo Location, Expo Camera, and background task support
- AsyncStorage for rider state persistence

## Project structure

- `app/` app entrypoint and rider session handling
- `components/` rider auth and app shell
- `components/rider/` home, active job, terminals, history, profile, and help screens
- `utils/` routing, proof capture, and live location publishing helpers
- `assets/` rider branding and app artwork

## Local setup

1. Install dependencies.
   ```bash
   npm install
   ```
2. Create a `.env` file in the repo root.
   ```bash
   EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
3. Start the app.
   ```bash
   npm run start
   ```

Helpful commands:

```bash
npm run web
npm run ios
npm run android
npm run lint
```

## Backend expectations

This app expects a Supabase backend with rider-aware logistics tables such as `profiles`, `shipments`, `shipment_events`, `shipment_stage_proofs`, `shipment_stage_suggestions`, `terminals`, `rider_locations`, and the storage bucket used for shipment proof media.

## Related RENAX repos

- [RENAX Admin](https://github.com/chimzyfire-ship-it/Renax-Admin)
- [RENAX Customer](https://github.com/chimzyfire-ship-it/Renax-Customer)

## Summary

RENAX Rider is the execution layer of the network. It helps riders accept work, stay visible, capture trusted delivery proofs, and move shipments cleanly across local and relay routes.
