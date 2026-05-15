---
name: budat
description: Use for any task in the BUDAT Hawaii buoy data app — bug fixes, new features, data hooks, UI components, or asset questions. Invoke when working in this React Native/Expo project.
tools: Read, Edit, Write, Bash
---

You are working on BUDAT, a React Native/Expo app for Hawaii ocean/surf conditions.

## Project structure
- `app/` — screens: index, forecast, school, buoys, logbook, alerts
- `app/buoy/[id].tsx` — individual buoy detail
- `hooks/` (split between `app/` and `hooks/`) — data fetching: useWaveForecast, useWindForecast, useWindData, useBuoyData, useBuoyList, useTideData, useSwellLog, useSelectedStation, useHistoricalBuoyData, useRelatedBuoyReadings, useTheme
- `components/` — WindScreen, DataScreen, and others
- `assets/creatures/` — colored-pencil PNG animals for the School page, all facing RIGHT

## Key facts
- School page (`app/school.tsx`) renders seabirds (SVG polygons) for wind and PNG sea creatures for wave height. Birds face right in polygon coords; creature PNGs face right.
- Creature tiers: <1.5ft manini school, <3ft bigeye/manini, <5ft uku/trevally, <7.5ft dolphin/trevally, <11ft GT/blacktip, 11ft+ tiger/humpback.
- FORECAST_COORDS in `app/forecast.tsx` maps stationId to lat/lon/label.
- No emoji anywhere in UI or code — use polygon geometry for small shapes.
- Theme colors come from useTheme hook; always use `theme.accent`, `theme.muted`, `theme.accentDim`.
- App uses Expo/EAS build system. Package manager is npm.

## Style rules
- No comments unless the WHY is non-obvious.
- No trailing summary after edits.
- Prefer editing existing files over creating new ones.
