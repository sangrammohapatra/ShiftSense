# ShiftSense — Wage Intelligence Platform

ShiftSense is a statutory wage compliance platform built for India's informal workforce. Workers in construction, security, domestic service, factory, and transport sectors register and log daily shifts by sending a WhatsApp message — no app download required, no smartphone literacy assumed. The platform parses each message using Claude AI, calculates the worker's legal entitlement under the Minimum Wages Act 1948 and the Factories Act 1948 (including overtime at double rate), applies EPF and ESI deductions where applicable, and instantly replies with a full wage breakdown in Hindi and English. If a wage shortfall exceeding ₹50 is detected, a formal dispute notice PDF is auto-generated and delivered — citing the exact statutory sections — ready to submit to the District Labour Commissioner.

Employers access a React web dashboard to manage their workforce, view compliance metrics, monitor open disputes, and download auto-generated monthly payroll compliance reports (PDF + email). Minimum wage rates for each Indian state and occupation category are stored in MongoDB and updated monthly via a Puppeteer scraper that reads official government labour portal notifications. The entire system runs in Docker with Bull.js queues for background PDF generation, Redis for conversation state and job management, and AWS S3 for document storage.

---

## Prerequisites

- **Node.js 20+** and npm — for local development without Docker
- **Docker 24+** and Docker Compose v2 — for containerised deployment
- **Twilio account** — WhatsApp Business API sandbox or approved sender
- **Anthropic API key** — Claude Sonnet for shift message parsing
- **AWS account** — S3 bucket in `ap-south-1` for PDF storage
- **Gmail account** (or SMTP provider) — for monthly report emails

---

## Quick Start (Docker)

```bash
# 1. Clone the repository
git clone https://github.com/your-org/shiftsense.git
cd shiftsense

# 2. Create environment file from template
cp .env.example server/.env

# 3. Fill in required values (open server/.env in your editor)
#    Required: MONGO_URI, TWILIO_SID, TWILIO_TOKEN, TWILIO_WHATSAPP_FROM,
#              CLAUDE_API_KEY, AWS_BUCKET, AWS_REGION, AWS_ACCESS_KEY,
#              AWS_SECRET_KEY, JWT_SECRET, SMTP_USER, SMTP_PASS

# 4. Build and start all services
docker-compose up --build

# Services will be available at:
#   React dashboard  → http://localhost:3000
#   Express API      → http://localhost:5000
#   MongoDB          → localhost:27017
#   Redis            → localhost:6379
```

## Seed Wage Data (Run Once)

After the containers are running, seed the minimum wage database with 2024–25 rates for 10 Indian states:

```bash
docker-compose exec scraper node seedWages.js
```

This inserts 50 WageRule documents (10 states × 5 occupations) with rates sourced from state gazette notifications effective April 2024. The monthly scraper cron will update these automatically on the 1st of each month at 02:00 IST.

---

## Local Development (Without Docker)

```bash
# Install all dependencies
cd shiftsense && npm install
cd server && npm install
cd ../client && npm install
cd ../scraper && npm install

# Start MongoDB and Redis locally (or use Docker for just these services)
docker-compose up mongodb redis -d

# Copy and fill environment file
cp .env.example server/.env

# Start server + client concurrently from root
cd ..
npm run dev
# API → http://localhost:5000
# Dashboard → http://localhost:5173 (Vite dev server with HMR)

# Seed wages
cd scraper && node seedWages.js
```

---

## WhatsApp Worker Registration Flow

Workers interact with ShiftSense exclusively via WhatsApp. No app installation is required.

**Step 1 — Save the number**
The worker saves the ShiftSense WhatsApp number (configured in `TWILIO_WHATSAPP_FROM`) to their phone.

**Step 2 — Send any message**
The worker texts "Hi" or any message. The bot responds:
> 🙏 ShiftSense में आपका स्वागत है! / Welcome to ShiftSense!
> आपका नाम क्या है? / What is your full name?

**Step 3 — Name**
Worker replies with their name, e.g. "Raju Sharma"

**Step 4 — State**
Bot asks for the 2-letter state code. Worker replies "MH" (Maharashtra).

**Step 5 — Occupation**
Bot presents a numbered menu:
```
1. construction
2. security
3. domestic
4. factory
5. driver
```
Worker replies "1".

**Step 6 — Aadhaar last 4**
Bot asks for the last 4 digits of Aadhaar for identity uniqueness. Worker replies "5678".

**Step 7 — Registration complete**
> ✅ Registration complete! To log a shift, send: shift 9am-6pm construction

**Step 8 — Log a shift**
Worker texts: `shift 9am-8pm` or `shift 9 baje se 8 baje tak`

Bot replies instantly with a full wage breakdown:
```
✅ Shift Logged — 15 Jun 2025
Hours worked: 11h
Overtime: +3h (2× rate)
Min wage: ₹692/day
Regular pay:   ₹519.00
OT pay (2×):   ₹259.50
Gross owed:    ₹778.50
EPF (12%):    -₹93.42
Net take-home: ₹685.08
```

**Step 9 — Dispute (if underpaid)**
If the shortfall exceeds ₹50, the reply includes:
> ⚠️ Reply DISPUTE to generate your legal notice.

Worker texts "DISPUTE" and receives a PDF download link within seconds.

---

## Employer Dashboard

1. Visit `http://localhost:3000/register`
2. Create an employer account with company name, email, state, and phone
3. Link workers via the Workers page using their WhatsApp number
4. The dashboard shows:
   - Total linked workers
   - Shifts logged this month
   - Total wage shortfall this month
   - Open disputes
   - 6-month shift vs dispute bar chart
   - Recent disputed shifts table
5. Monthly PDF reports are emailed automatically and available to download from the Reports page

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **WhatsApp Interface** | Twilio WhatsApp API | Inbound/outbound worker messages |
| **NLP Parser** | Anthropic Claude Sonnet | Extract structured shift data from free text |
| **Backend API** | Node.js + Express | REST API, JWT auth, middleware |
| **Database** | MongoDB Atlas / mongo:7 | Workers, shifts, wage rules, disputes |
| **Cache & Queues** | Redis + Bull.js | Conversation state, background job processing |
| **PDF Generation** | PDFKit | Dispute letters + monthly reports (in-memory) |
| **File Storage** | AWS S3 | PDF persistence and signed URL delivery |
| **Email** | Nodemailer (Gmail SMTP) | Monthly report delivery |
| **Web Scraping** | Puppeteer | Monthly minimum wage notification scraper |
| **Scheduling** | node-cron | Monthly report cron (1st of month, 06:00 IST) |
| **Frontend** | React 18 + Vite | Employer dashboard SPA |
| **State Management** | Zustand | JWT auth store with localStorage persistence |
| **Data Fetching** | TanStack React Query | Server state, caching, background refetch |
| **Charts** | Recharts | Shift vs dispute bar chart |
| **Forms** | react-hook-form | Login, register, profile edit forms |
| **Styling** | Tailwind CSS | Utility-first styles |
| **Static Serving** | Nginx (Alpine) | Production SPA serving + API proxy |
| **Containerisation** | Docker + Compose | Full-stack orchestration |

---

## API Routes

### Authentication — `/api/v1/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/register` | Public | Create employer account, returns JWT |
| `POST` | `/login` | Public | Verify credentials, returns JWT |
| `GET` | `/me` | JWT | Get authenticated employer profile |
| `PATCH` | `/me` | JWT | Update company name, phone, state, GST |

### Workers — `/api/v1/workers`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | JWT | List linked workers (filterable: state, occupation, search) |
| `POST` | `/link` | JWT | Link a WhatsApp-registered worker by phone number |
| `DELETE` | `/unlink/:id` | JWT | Soft-unlink a worker (sets is_active = false) |
| `GET` | `/:workerId` | JWT | Worker profile + last 30 shifts + monthly shortfall |
| `PATCH` | `/:workerId` | JWT | Update worker name, state, occupation, claimed_daily_wage |
| `GET` | `/shifts/:workerId` | JWT | Shift history (last 90 days or ?month=YYYY-MM) |

### Dashboard — `/api/v1/dashboard`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/stats` | JWT | Aggregate metrics: workers, shifts, shortfall, disputes, 6-month chart |

### Reports — `/api/v1/reports`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | JWT | List all generated reports (from S3 listing) |
| `POST` | `/generate` | JWT | Enqueue report generation job for current month |
| `GET` | `/status/:jobId` | JWT | Poll Bull job progress (0–100%) |
| `GET` | `/download/:month` | JWT | Get 1-hour pre-signed S3 download URL |

### Webhook — `/api/v1/webhook`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/whatsapp` | Twilio Signature | Inbound WhatsApp message handler (registration + shift logging + disputes) |

---

## Environment Variables

Copy `.env.example` to `server/.env` and fill in all values:

```
PORT                    Express server port (default 5000)
MONGO_URI               MongoDB connection string
REDIS_URL               Redis connection URL
JWT_SECRET              Secret for signing JWTs (min 32 chars)
JWT_EXPIRES_IN          JWT expiry (default 7d)
TWILIO_SID              Twilio Account SID
TWILIO_TOKEN            Twilio Auth Token
TWILIO_WHATSAPP_FROM    Twilio WhatsApp sender (whatsapp:+14155238886)
CLAUDE_API_KEY          Anthropic API key (sk-ant-...)
AWS_BUCKET              S3 bucket name for PDFs
AWS_REGION              AWS region (ap-south-1)
AWS_ACCESS_KEY          AWS IAM access key
AWS_SECRET_KEY          AWS IAM secret key
SMTP_HOST               SMTP server (smtp.gmail.com)
SMTP_PORT               SMTP port (587)
SMTP_USER               SMTP username / Gmail address
SMTP_PASS               SMTP password / Gmail App Password
MONTHLY_REPORT_EMAIL    From address for report emails
WEBHOOK_BASE_URL        Public URL of server (for Twilio signature validation)
SKIP_TWILIO_VALIDATION  Set true in local dev to skip signature check
```

---

## Licence

MIT — built for India's informal workforce.
