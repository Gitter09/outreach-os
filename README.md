# JobDex
Official Website: [jobdex.tech](https://jobdex.tech)

**I built my own CRM instead of paying for one.**
 
Streak's free trial expired. I refused to pay for features I knew I could build. So I built them. This is that product.
 
JobDex is a privacy-first, offline-capable personal CRM for students doing cold email outreach — internship hunting, job searching, or anyone who needs to systematically manage relationships without a $50/month subscription hanging over their head.
 
Everything runs locally on your machine. No cloud. No telemetry. No vendor lock-in.
 
---
 
## What it does
 
- **People & Pipeline** — A contact database with table and Kanban views. Custom stages, colours, drag-to-reorder. Track every relationship from first message to offer.
- **Contact profiles** — A full profile for every contact: notes, attached files, upcoming events, activity timeline, email history. Everything in one place before you hit send.
- **Email Integration** — Connect Gmail or Outlook via OAuth. Send directly from JobDex, schedule sends, and use merge variables (`{{first_name}}`, `{{company}}`). Full thread history per contact.
- **Templates & Signatures** — Reusable email templates with merge variables. Manage signatures once in Settings, select them at compose time.
- **Tags & Filtering** — Tag contacts however makes sense to you, then filter the People page by tag.
- **Onboarding** — First-time users get a proper welcome and walkthrough instead of an empty screen.
- **Keyboard shortcuts** — Cmd+N, Cmd+Shift+C, Cmd+1–5, Cmd+/, and more. Full list in-app via Cmd+/.
- **Import / Export / Restore** — Import from LinkedIn CSV. Export all your data to JSON. Restore from a backup file.
- **Privacy by default** — SQLite encrypted with SQLCipher AES-256. OAuth tokens encrypted with AES-256-GCM. Master key in your OS Keychain. Your data never leaves your machine.
 
---
 
## Why I built it
 
Like every junior, I started my internship search in Google Sheets. It worked for the first 20 cold emails, but broke down completely by the 100th.
 
Existing CRMs were designed for sales teams chasing enterprise quotas — not students targeting SWE roles. I didn't need to track $50k ARR pipelines. I just needed a fast, local tool that gave me deep context before I hit send.
 
So I built it myself.
 
---
 
## Download
 
Grab the latest build from [GitHub Releases](https://github.com/Gitter09/jobdex/releases):
 
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
 
## Email setup (Gmail / Outlook)

JobDex connects to email via OAuth. To use email features locally:

**Gmail:** Create an OAuth 2.0 credential in Google Cloud Console with the Gmail API enabled. Set the redirect URI to `http://localhost:52338/oauth/callback`. Save your client ID and secret to `~/.jobdex/credentials.json`:
```json
{ "client_id": "...", "client_secret": "..." }
```

**Outlook:** Create an app in Azure Entra with `Mail.ReadWrite`, `Mail.Send`, and `offline_access` scopes. Add `http://localhost:52338/oauth/callback` as a redirect URI. Save your client ID to Settings → Email → Outlook Client ID.

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
 
No timelines — this is a passion project.
 
**Coming next:**
- Multi-step email campaigns — set up a sequence, JobDex handles the follow-ups
- Email open & click tracking — know when someone actually read your message
- Tasks page — a job-search to-do list tied to contacts
- Dashboard — real stats: emails sent, replies, pipeline movement
- Automation rules — if a contact replies, move them forward automatically
 
**On the horizon:**
- Full unified inbox
- Company entity — group contacts by org, track applications per company
 
---
 
## Decisions I made while building this
 
**Local-first, always.** No server means no recurring cost, no data leaving your machine, and no dependency on my uptime. The tradeoff: no sync across devices in v0.1. Worth it.
 
**Deferred the AI layer.** I had planned AI-assisted email drafting for v0.1. I cut it deliberately to ship faster. A product that ships without AI beats a product that never ships with it.
 
**Free, not freemium.** There's no $9 tier. This is a personal project I'm sharing publicly. If it grows into something more, I'll cross that bridge when I get there — but today, it's just free.
 
---
 
## License
 
JobDex is source-available and free to use. You can read the code, fork it, build on it, and share it. You just can't sell it or build a paid product on top of it without talking to me first.
 
---
 
*Built by [Harshit Singh](https://github.com/Gitter09)*