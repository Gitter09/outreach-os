Here's a **completely free architecture** for scraping data and generating 50 emails per day:

## Architecture Overview

**Tech Stack**: Python + GitHub Actions + Gemini API + Gmail SMTP

### Component Breakdown

**1. Web Scraping Layer**
- **Tool**: Scrapy (open-source Python framework)[1]
- **Why**: Handles large-scale crawling, asynchronous requests, and data extraction pipelines without cost[1]
- **Alternative**: BeautifulSoup + Requests for simpler static pages
- **Storage**: Scraped data stored as JSON/CSV in GitHub repository or Google Drive

**2. LLM Processing Layer**
- **Primary API**: Google Gemini 2.0 Flash Experimental
  - 1M tokens per minute, 1K requests/day[2][3]
  - Enough for 50 emails (~1,000 tokens each = 50K total tokens/day)
- **Backup API**: Together AI Llama 3.3 70B (60K TPM)[4]
- **Function**: Process scraped data → generate personalized email content

**3. Email Delivery Layer**
- **Service**: Gmail SMTP[5]
- **Limit**: 500 emails/day (free Gmail account)[6][5]
- **Configuration**: 
  - SMTP server: smtp.gmail.com
  - Port: 465 (SSL) or 587 (TLS)
  - No credit card required

**4. Orchestration & Automation**
- **Platform**: GitHub Actions (completely free for public repos)[7][8]
- **Free tier**: Unlimited minutes for public repositories[9][7]
- **Scheduling**: Cron syntax for daily execution[9]
- **Alternative**: n8n (self-hosted via Docker - $0 cost)[10][11]

## Implementation Flow

```
1. GitHub Actions Cron Trigger (daily at 6 AM IST)
   ↓
2. Python Script: Scrapy extracts target data
   ↓
3. Data Processing: Clean and structure scraped data
   ↓
4. Gemini API: Generate 50 personalized emails
   ↓
5. Gmail SMTP: Send emails (batch of 50)
   ↓
6. Logging: Save results to GitHub repo
```

### Code Structure

**File Organization:**
```
your-repo/
├── .github/
│   └── workflows/
│       └── daily-scrape-email.yml  # GitHub Actions workflow
├── scrapers/
│   └── target_scraper.py           # Scrapy spider
├── email_generator.py              # Gemini API integration
├── email_sender.py                 # Gmail SMTP handler
├── config.py                       # API keys (use GitHub Secrets)
├── data/
│   └── scraped_data.json           # Temporary storage
└── requirements.txt
```

**GitHub Actions Workflow** (daily-scrape-email.yml):
```yaml
name: Daily Email Campaign
on:
  schedule:
    - cron: '30 0 * * *'  # 6 AM IST daily
  workflow_dispatch:       # Manual trigger

jobs:
  scrape-and-email:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - run: pip install -r requirements.txt
      - run: python scrapers/target_scraper.py
      - run: python email_generator.py
      - run: python email_sender.py
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          GMAIL_PASSWORD: ${{ secrets.GMAIL_APP_PASSWORD }}
```

### Key Features

**Cost Breakdown:**
- Scraping: $0 (Scrapy open-source)
- LLM API: $0 (Gemini free tier)
- Email sending: $0 (Gmail SMTP)
- Hosting/Automation: $0 (GitHub Actions public repo)
- **Total monthly cost: $0**

**Scalability within free tier:**
- Daily emails: Up to 500 (Gmail limit)[5]
- LLM tokens: 4M/day (enough for ~4,000 emails)[3]
- GitHub Actions: Unlimited runtime (public repo)[8][7]

### Alternative Free Architecture (Self-Hosted)

If you prefer local control on your MacBook Air M3:

**Option 2: Docker + n8n + Gemini + Gmail**
- **Orchestrator**: n8n (self-hosted via Docker - free)[11][10]
- **Scheduling**: n8n's built-in cron triggers
- **Benefits**: Visual workflow editor, 700+ integrations, runs locally
- **Cost**: $0 (only electricity for M3 Air)
- **Setup time**: <10 minutes[10]

**Option 3: Supabase Edge Functions**
- **Platform**: Supabase free tier[12]
- **Limits**: Hundreds of thousands of function executions/month[12]
- **Benefits**: Cloud-hosted, generous bandwidth, PostgreSQL included
- **Best for**: If you need a database alongside automation

## Recommended Setup for You

Given your technical background and M3 MacBook Air [memory], I recommend:

**Primary**: GitHub Actions + Scrapy + Gemini + Gmail
- Deploy in public repo for unlimited compute[7]
- Schedule via cron for automated daily execution
- Store API keys in GitHub Secrets for security

**Backup**: Run n8n locally via Docker when you need visual debugging[11][10]

This architecture handles your 50 emails/day requirement with 10x headroom for growth, all completely free.[2][5][7]

Sources
[1] 5 Best Free Web Scraping Tools for 2026 | ScrapingBee https://www.scrapingbee.com/blog/best-free-web-scraping-tools/
[2] Gemini API Rate Limits Explained: Complete 2026 Guide with ... https://www.aifreeapi.com/en/posts/gemini-api-rate-limit-explained
[3] Gemini API Rate Limits 2026: Complete Per-Tier Guide with ... https://www.aifreeapi.com/en/posts/gemini-api-rate-limits-per-tier
[4] Llama 3.3 70B 🦙 is now available on Together AI for free! | Together AI https://www.linkedin.com/posts/togethercomputer_llama-33-70b-is-now-available-on-together-activity-7284996824229101570-ppJ2
[5] How to Use the Gmail SMTP Server to Send Emails for Free https://kinsta.com/blog/gmail-smtp-server/
[6] Send 10000 emails with Gmail [Updated 2026] https://www.gmass.co/blog/you-can-now-send-10000-emails-with-gmass-and-gmail/
[7] Usage limits, billing, and administration - GitHub Docs https://docs.github.com/en/actions/administering-github-actions/usage-limits-billing-and-administration?azure-portal=true
[8] Is there a limit on usage by public repos? #70492 - GitHub https://github.com/orgs/community/discussions/70492
[9] How to schedule Python scripts with GitHub Actions https://www.python-engineer.com/posts/run-python-github-actions/
[10] Automate Everything with n8n — Free, Local Setup in Under 10 Mins! https://www.reddit.com/r/selfhosted/comments/1mxflx5/automate_everything_with_n8n_free_local_setup_in/
[11] Self-host n8n for FREE automations | Full setup tutorial https://www.youtube.com/watch?v=uCe0IzejSBU&vl=en
[12] Supabase Edge Functions: Are They Free? https://ceiapoa.com.br/blog/supabase-edge-functions-are-they
[13] Why are these publications missing? Uncovering the reasons behind the exclusion of documents in free‐access scholarly databases https://asistdl.onlinelibrary.wiley.com/doi/10.1002/asi.24839
[14] A Web Scraper for Data Mining Purposes https://sistemasi.ftik.unisi.ac.id/index.php/stmsi/article/view/4107
[15] Social media automated account (bot) detection system architecture https://ists.knu.ua//en/article/view/4725
[16] Utilization of web-based stationary rainfall data for near-real-time derivation of spatial landslide susceptibility https://www.semanticscholar.org/paper/c9ebc9fb2dc64b5d069fc0dbc82659cf10ec5e83
[17] Development of ALEN: An Advanced Voice Assistant with Comprehensive Functionalities https://ieeexplore.ieee.org/document/11063823/
[18] Mining GitHub for research and education: challenges and opportunities http://www.emerald.com/ijwis/article/16/4/451-473/165262
[19] Python Requests Essentials https://www.semanticscholar.org/paper/fa9fd600d20bd2c979c72d76b4cd3b89da1cf1f4
[20] MILLA A Multimodal Interactive Language Agent https://www.semanticscholar.org/paper/229cdf9c0834c96dbc7459b695e5f788b9840504
[21] Fundus: A Simple-to-Use News Scraper Optimized for High Quality
  Extractions https://arxiv.org/html/2403.15279v1
[22] Dr Web: a modern, query-based web data retrieval engine https://arxiv.org/html/2504.05311v1
[23] DigiMOF: A Database of Metal–Organic Framework Synthesis Information Generated via Text Mining https://pubs.acs.org/doi/10.1021/acs.chemmater.3c00788
[24] AutoScraper: A Progressive Understanding Web Agent for Web Scraper
  Generation http://arxiv.org/pdf/2404.12753.pdf
[25] VERITAS-NLI : Validation and Extraction of Reliable Information Through
  Automated Scraping and Natural Language Inference https://arxiv.org/html/2410.09455v1
[26] Trafilatura: A Web Scraping Library and Command-Line Tool for Text Discovery and Extraction https://aclanthology.org/2021.acl-demo.15.pdf
[27] SpeCrawler: Generating OpenAPI Specifications from API Documentation
  Using Large Language Models https://arxiv.org/pdf/2402.11625.pdf
[28] Cleaner Pretraining Corpus Curation with Neural Web Scraping https://arxiv.org/pdf/2402.14652.pdf
[29] Web Scraper - The #1 web scraping extension https://webscraper.io
[30] The Best Web Scraping APIs for 2026 - Proxyway https://proxyway.com/best/best-web-scraping-apis
[31] Best Web Scraping APIs for 2026 | Benchmark Analysis - Zyte https://www.zyte.com/blog/best-web-scraping-apis-2026/
[32] scrapestack - Free Proxy & Web Scraping API https://scrapestack.com
[33] 5 Top Free Hosting Platforms for Python Apps https://www.cerebrium.ai/articles/5-top-free-hosting-platforms-for-python-apps
[34] Best Open-Source Web Scraping Libraries in 2026 - Firecrawl https://www.firecrawl.dev/blog/best-open-source-web-scraping-libraries
[35] Any free serverless platform for functions(pandas and http)? https://www.reddit.com/r/learnpython/comments/1792fhg/any_free_serverless_platform_for_functionspandas/
[36] Resource Usage and Optimization Opportunities in Workflows of GitHub Actions https://dl.acm.org/doi/10.1145/3597503.3623303
[37] Early Detection of Cyberattacks in Banking Networks via a Fractional Partial Differential Equation Model https://onlinelibrary.wiley.com/doi/10.1155/jama/4338391
[38] Right to the city – not for everyone? The dark side of growing agency of cities https://www.tandfonline.com/doi/full/10.1080/09654313.2025.2517749
[39] Zero Cost Approach for NLP Based, Serverless Voicemail Monitoring Automation Pipeline https://ieeexplore.ieee.org/document/11045449/
[40] RAMAC: Multimodal Risk-Aware Offline Reinforcement Learning and the Role of Behavior Regularization https://arxiv.org/abs/2510.02695
[41] An adaptive hierarchical approach to lidar-based autonomous robotic navigation https://spiedigitallibrary.org/conference-proceedings-of-spie/10639/2303770/An-adaptive-hierarchical-approach-to-lidar-based-autonomous-robotic-navigation/10.1117/12.2303770.full
[42] SCTCMG 2018 International Scientific Conference “Social and Cultural Transformations in the Context of Modern Globalism” SUBJECT PROFESSIONAL ACTIVITY OF A TEACHER: METHODOLOGICAL FRAMEWORK AND THEORETICAL DESIGN https://www.semanticscholar.org/paper/68d952bd8527407d48826f1a4411084dfb5aa424
[43] A Week In Shanghai: A View From The Trenches In The Convergence Of http://peer.asee.org/4685
[44] "Additional Evidence" under the Individuals with Disabilities Education Act: The Need for Rigor https://www.semanticscholar.org/paper/5cb3844c830b66239660d884800c9e973c27ce50
[45] Educational Governance and Administration https://www.semanticscholar.org/paper/fb7373d4fa8561779ff59d3dc0544f1c674deaa2
[46] An Empirical Study on Workflows and Security Policies in Popular GitHub
  Repositories http://arxiv.org/pdf/2305.16120.pdf
[47] Managing Larger Data on a GitHub Repository https://joss.theoj.org/papers/10.21105/joss.00971.pdf
[48] GitBug-Actions: Building Reproducible Bug-Fix Benchmarks with GitHub
  Actions http://arxiv.org/pdf/2310.15642.pdf
[49] The Hidden Costs of Automation: An Empirical Study on GitHub Actions
  Workflow Maintenance http://arxiv.org/pdf/2409.02366.pdf
[50] Toward Automatically Completing GitHub Workflows https://arxiv.org/pdf/2308.16774.pdf
[51] Hiku: Pull-Based Scheduling for Serverless Computing https://arxiv.org/pdf/2502.15534.pdf
[52] GitBug-Actions: Building Reproducible Bug-Fix Benchmarks with GitHub Actions https://dl.acm.org/doi/pdf/10.1145/3639478.3640023
[53] Automated DevOps Pipeline Generation for Code Repositories using Large
  Language Models https://arxiv.org/pdf/2312.13225.pdf
[54] Actions limits https://docs.github.com/en/actions/reference/limits
[55] Billing and usage - GitHub Docs https://docs.github.com/en/actions/concepts/billing-and-usage
[56] Actions limits - GitHub Docs https://docs.github.com/en/actions/reference/actions-limits
[57] Free tier edge function count confusion · supabase · Discussion #27294 https://github.com/orgs/supabase/discussions/27294

