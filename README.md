# OutreachOS
 
**I built my own CRM instead of paying for one.**
 
Streak's free trial expired. I refused to pay for features I knew I could build. So I built them. This is that product.
 
OutreachOS is a privacy-first, offline-capable personal CRM for students doing cold email outreach — internship hunting, job searching, or anyone who needs to systematically manage relationships without a $50/month subscription hanging over their head.
 
Everything runs locally on your machine. No cloud. No telemetry. No vendor lock-in.
 
---
 
## What it does
 
- **People & Pipeline** — A clean contact database with a drag-and-drop Kanban board. Track every relationship from first email to offer.
- **Contact Intelligence** — A living profile for every contact. Write your own notes, track interaction history, see exactly where things stand before you hit send.
- **Email Integration** — Connect Gmail or Outlook via OAuth and send directly from OutreachOS. Mail merge templates with variables. Schedule sends. Full email history per contact.
- **Two-Step Import** — Drag in a LinkedIn CSV export and map columns in two clicks. Smart duplicate detection handles the rest.
- **Templates** — Reusable email templates with merge variables (`{{firstName}}`, `{{company}}`, `{{role}}`). Write once, personalise at scale.
- **Privacy by default** — SQLite database encrypted with SQLCipher AES-256. OAuth tokens encrypted with AES-256-GCM. Master key in your OS Keychain. Your data never leaves your machine.
 
---
 
## Why I built it
 
Like every junior, I started my internship search in Google Sheets. It worked for the first 20 cold emails, but broke down completely by the 100th.
 
Existing CRMs were designed for sales teams chasing enterprise quotas — not students targeting SWE roles. I didn't need to track $50k ARR pipelines. I just needed a fast, local tool that gave me deep context before I hit send.
 
So I built it myself.
 
---
 
## Download
 
Grab the latest build from [GitHub Releases](https://github.com/Gitter09/outreach-os/releases):
 
| Platform | Format |
|---|---|
| macOS | `.dmg` |
| Windows | `.exe` |
| Linux | `.AppImage` |
 
---
 
## Tech Stack
 
| Layer | Technology |
|---|---|
| Core | Rust (Tauri 2.0, Edition 2021) |
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS + shadcn/ui |
| Database | SQLite with SQLCipher (sqlx 0.8+) |
| Runtime | Bun |
 
---
 
## Running locally
 
```bash
# Install dependencies
bun install
 
# Dev mode with hot reload
bun run tauri dev
 
# Production build
bun run tauri build
```
 
---
 
## Roadmap
 
These are the things I'm actively thinking about or working toward. No timelines — this is a passion project.
 
**Coming next:**
- Multi-step email campaigns — set up a sequence, OutreachOS handles the follow-ups
- Email open & click tracking — know when someone actually read your message
- Full pipeline configuration — custom stages, colors, ordering
- Dashboard — a real one, with actual data
- Keyboard shortcuts — the full set, not just ⌘K
- Tag filtering on the People page
- Onboarding flow — so new users aren't dropped into an empty app with no idea what to do
 
**On the horizon:**
- Tasks — a job-search specific to-do list tied to contacts and companies
- Emails page — a lightweight inbox so you don't have to context-switch to Gmail
- Automation rules — if a contact replies, move them forward automatically
- Company entity — group contacts by company, track applications per org
 
---
 
## Decisions I made while building this
 
**Local-first, always.** No server means no recurring cost, no data leaving your machine, and no dependency on my uptime. The tradeoff: no sync across devices in v0.1. Worth it.
 
**Deferred the AI layer.** I had planned AI-assisted email drafting for v0.1. I cut it deliberately to ship faster. A product that ships without AI beats a product that never ships with it.
 
**Free, not freemium.** There's no $9 tier. This is a personal project I'm sharing publicly. If it grows into something more, I'll cross that bridge when I get there — but today, it's just free.
 
---
 
## License
 
OutreachOS is source-available and free to use. You can read the code, fork it, build on it, and share it. You just can't sell it or build a paid product on top of it without talking to me first.
 
---
 
*Built by [Harshit Singh](https://github.com/Gitter09)*