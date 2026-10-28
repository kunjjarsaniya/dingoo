# 🎲 Dingoo — Real-Time Multiplayer Bingo

[![Live on Vercel](https://img.shields.io/badge/Live-dingoo.vercel.app-EA3E24?style=flat&logo=vercel)](https://dingoo.vercel.app)
[![Next.js 16](https://img.shields.io/badge/Next.js-16%20(React%2019)-black?style=flat&logo=next.js)](https://nextjs.org)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-Authoritative%20Sync-010101?style=flat&logo=socket.io)](https://socket.io)
[![Prisma ORM](https://img.shields.io/badge/Prisma-6.4.1-2D3748?style=flat&logo=prisma)](https://prisma.io)

**Dingoo** is a tactile, lightning-fast multiplayer Bingo web application. Play synchronously with friends, family, and coworkers with physical cut-paper cards, satisfying 3D press controls, authoritative 40-second turn timers, and seamless reconnection.

🌐 **Production Website:** [https://dingoo.vercel.app](https://dingoo.vercel.app)

---

## ✨ Key Features

- **⚡ Instant Sub-5ms Broadcast:** In-memory authoritative game loop ensures zero latency when players tap numbers. Background database persistence decouples network lag.
- **🔄 Bulletproof Reconnect & Rejoin:** Refreshed your browser or closed the tab? Jump right back in! The system preserves your seat, card layout, and marked tiles without `GAME_STARTED` or `DUPLICATE_NAME` errors.
- **⏱️ 40-Second Server Turn Timers:** Automatic 40-second turn countdown bar with animated visual progress. If a player stalls or leaves, their turn auto-skips to keep the match exciting.
- **🎴 Custom Card Sizes (5×5 to 10×10):** Hosts can customize card dimensions from compact 5×5 (numbers 1..25) up to grand 10×10 grids (numbers 1..100) with 5-line matching rules.
- **🎨 Hallmark Hum Aesthetic:** Tactile cut-paper layout, physical drop shadows, curled corner stamps, and responsive desktop and mobile design.
- **📋 1-Tap Room Code Copy:** Quick copy with instant tactile tooltip confirmation.

---

## 🏗️ Architecture & Deployment

```
   ┌─────────────────────────────────────────────────────────┐
   │                   Dingoo Web Client                     │
   │           Hosted on Vercel (dingoo.vercel.app)          │
   │            Next.js 16 + React 19 + Tailwind v4          │
   └────────────────────────────┬────────────────────────────┘
                                │
               WebSocket / HTTP │ NEXT_PUBLIC_SOCKET_URL
                                ▼
   ┌─────────────────────────────────────────────────────────┐
   │                  Dingoo Game Server                     │
   │         Hosted on Render / Railway / Fly.io / VPS       │
   │       Node.js + Express 5 + Socket.IO + In-Memory Cache │
   └────────────────────────────┬────────────────────────────┘
                                │
                                │ Prisma ORM
                                ▼
   ┌─────────────────────────────────────────────────────────┐
   │                   Neon Cloud PostgreSQL                 │
   │               Serverless Database (US-East-1)           │
   └─────────────────────────────────────────────────────────┘
```

> **Why separate frontend and backend hosting?**  
> Vercel is a serverless platform designed for edge/serverless rendering. Persistent real-time WebSocket state machines (with active timers and room connections) require a long-running Node.js process (such as [Render](https://render.com), [Railway](https://railway.app), [Fly.io](https://fly.io), or a VPS).

---

## 🚀 Live Deployment Guide

### Part 1: Deploy Backend (Render / Railway)

1. Create a free account at [Render](https://render.com) or [Railway](https://railway.app).
2. Create a new **Web Service** connected to your GitHub repository.
3. Configure the service settings:
   - **Environment:** `Node`
   - **Build Command:** `pnpm install && pnpm prisma:generate`
   - **Start Command:** `pnpm server`
   - **Plan:** Free / Starter
4. Add the following **Environment Variables**:
   - `DATABASE_URL`: `postgresql://...` (your Neon / Supabase PostgreSQL connection string)
   - `ALLOWED_ORIGINS`: `http://localhost:3000,https://dingoo.vercel.app,https://*.vercel.app`
   - `PORT`: `10000` (or leave default on Render)
   - `ROOM_TTL_HOURS`: `24`
   - `COUNTDOWN_SECONDS`: `3`
   - `LOG_LEVEL`: `info`
5. Click **Deploy**. Copy your public backend URL (e.g. `https://dingoo-backend.onrender.com`).

---

### Part 2: Deploy Frontend on Vercel (`https://dingoo.vercel.app`)

1. Go to [Vercel](https://vercel.com) and click **"Add New Project"**.
2. Import your GitHub repository.
3. In the project settings:
   - **Framework Preset:** `Next.js`
   - **Root Directory:** `./`
   - **Build Command:** `pnpm build`
4. Expand **Environment Variables** and add:
   - `NEXT_PUBLIC_SOCKET_URL`: `https://your-backend-service.onrender.com` (from Part 1)
5. Click **Deploy**.
6. Once deployed, navigate to **Settings > Domains** in your Vercel project and assign your custom domain: `dingoo.vercel.app`.

---

## 💻 Local Development

### 1. Prerequisites
- Node.js 22+
- pnpm (`npm install -g pnpm`)

### 2. Setup Environment
```bash
cp .env.example .env
```
Ensure `DATABASE_URL` is configured in `.env`.

### 3. Install Dependencies
```bash
pnpm install
```

### 4. Database Setup
```bash
pnpm prisma:generate
pnpm prisma db push
```

### 5. Run Locally
In terminal 1 (Backend Server):
```bash
pnpm server:dev
```
*Health Check: `http://localhost:4000/health`*

In terminal 2 (Frontend App):
```bash
pnpm dev
```
*Frontend: `http://localhost:3000`*

---

## 🧪 Testing & Verification

Run Vitest unit tests:
```bash
pnpm test
```

Run 3-player real-time multiplayer simulation:
```bash
pnpm simulate
```

---

## 📦 Push to GitHub

To push this codebase to your GitHub repository:

```bash
# 1. Add your remote repository URL (replace with your repo)
git remote add origin https://github.com/<your-username>/<your-repo-name>.git

# 2. Stage all files
git add .

# 3. Commit changes
git commit -m "feat: complete Dingoo branding, SEO, Vercel deployment setup, and real-time engine"

# 4. Push to main branch
git push -u origin main
```

---

## 📄 License

MIT License. Crafted with ❤️ for great game nights.
