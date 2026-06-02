# ☁ CloudOps Job Radar

Remote job search dashboard — Cloud, DevOps, Platform, SRE, Solutions Architect, AWS.
Powered by Claude AI + live web search. Deployed on Vercel (free tier).

---

## Project Structure

```
cloudops-job-radar/
├── api/
│   └── search.js       ← Vercel serverless function (Anthropic API proxy)
├── public/
│   └── index.html      ← Frontend dashboard
├── vercel.json         ← Vercel routing config
├── package.json
└── README.md
```

---

## Deploy to Vercel in 5 minutes

### Step 1 — Get your Anthropic API key
1. Go to https://console.anthropic.com
2. Click **API Keys** → **Create Key**
3. Copy the key (starts with `sk-ant-...`)

### Step 2 — Push to GitHub
1. Create a free GitHub account at https://github.com if you don't have one
2. Create a new repository (name it `cloudops-job-radar`)
3. Upload all these files into it (drag and drop works in GitHub's web UI)

### Step 3 — Deploy on Vercel
1. Go to https://vercel.com and sign up free (use your GitHub account)
2. Click **Add New Project**
3. Import your `cloudops-job-radar` GitHub repository
4. Click **Deploy** (Vercel auto-detects the config)

### Step 4 — Add your API key
1. In Vercel, go to your project → **Settings** → **Environment Variables**
2. Add a new variable:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** your key from Step 1
   - **Environment:** Production, Preview, Development (tick all three)
3. Click **Save**
4. Go to **Deployments** → click the three dots on your latest deployment → **Redeploy**

### Step 5 — Open your live dashboard
Vercel gives you a URL like `https://cloudops-job-radar.vercel.app`
Open it, hit **Scan for jobs now**, and it works.

---

## Setting up your 15:00 and 02:00 alarms

Set two daily phone alarms with the label being your Vercel URL.
When the alarm fires, open the link and tap Scan.

---

## Cost

- **Vercel:** Free (Hobby plan covers this easily — serverless functions included)
- **Anthropic API:** ~$0.01–0.03 per scan (Claude Sonnet pricing)
  - At 2 scans/day = ~$0.60/month

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "ANTHROPIC_API_KEY not configured" | Add the env variable in Vercel Settings and redeploy |
| "No job data returned" | The AI search timed out — try again or widen your filters |
| Blank page | Check browser console; make sure files are in the right folders |
| 404 on /api/search | Confirm `api/search.js` is in the repo root's `api/` folder |
