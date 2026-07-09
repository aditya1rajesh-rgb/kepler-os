# AI Marketing Platform

An internal premium AI marketing dashboard.

## Tech Stack
- **Framework:** Vite + React
- **Icons:** Lucide React
- **Animations:** Framer Motion (Ready for use)
- **Styling:** Vanilla CSS with custom properties (Dark Theme)
- **Routing:** React Router v6

## Architecture
The application is built with a modular approach:
- **App Shell:** Centralized layout in `src/components/layout`.
- **Atomic Components:** Reusable UI elements in `src/components/ui`.
- **Independent Modules:** Each page/module is wrapped in an `ErrorBoundary` to ensure independent failure.
- **Glassmorphism:** Premium-grade UI using backdrop filters and deep dark color palettes.

## Navigation
- **Home:** Workspace management overview.
- **Brand Intelligence:** Strategy and identity management.
- **SEO & AEO:** Search and Answer Engine Optimization.
- **Ad Campaigns:** Performance marketing management.
- **Outreach Sequences:** Automated communication workflows.
- **Social Media:** Multi-platform social management.

## Getting Started
1. `npm install`
2. `npm run dev`

## Staging
- **Live URL:** https://kepler-os-two.vercel.app
- **Access:** sign up in-app with your email + a password — instant, no email confirmation on staging.
- **Deploys:** push to the `staging` branch → Vercel rebuilds the frontend, and Supabase migrations + edge functions deploy via GitHub Actions.

See [`docs/STAGING-DEPLOYMENT.md`](docs/STAGING-DEPLOYMENT.md) for the full runbook.
