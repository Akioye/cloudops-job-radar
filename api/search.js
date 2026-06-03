export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured in Vercel environment variables.' });

  const { roles, countries, days, minSalary, extraKeywords, sourceMode, resultCount } = req.body;
  if (!roles || !roles.length) return res.status(400).json({ error: 'No roles provided.' });
  if (!countries || !countries.length) return res.status(400).json({ error: 'No countries selected.' });

  const today = new Date().toISOString().split('T')[0];
  const count = parseInt(resultCount) || 20;
  const salNote = minSalary ? ` Only include roles with salary above $${parseInt(minSalary).toLocaleString()} or equivalent.` : '';
  const kwNote  = extraKeywords ? ` Extra focus: ${extraKeywords}.` : '';

  // Indeed is always banned regardless of mode
  const indeedBan = `NEVER return any results from indeed.com, indeed.co.uk, or any Indeed domain. Indeed is permanently banned from all results.`;

  let sourceInstructions = '';

  if (sourceMode === 'company') {
    sourceInstructions = `
SOURCE MODE: DIRECT COMPANY CAREER PAGES ONLY
${indeedBan}

A company career page means the URL domain belongs to the company itself — their own website.
VALID: stripe.com/jobs, careers.cloudflare.com, hashicorp.com/jobs, datadoghq.com/careers, netflix.jobs, amazon.jobs, gitlab.com/jobs, figma.com/careers, mongodb.com/careers, elastic.co/careers, twilio.com/jobs, fastly.com/careers, pagerduty.com/careers, snyk.io/careers, cockroachlabs.com/careers, coreweave.com/careers, fly.io/jobs, teleport.com/careers, doppler.com/careers, gruntwork.io/careers

INVALID (third-party platforms — do NOT use in this mode):
lever.co, greenhouse.io, ashby.com, workday.com, himalayas.app, remotive.com, wellfound.com, weworkremotely.com, linkedin.com, glassdoor.com, ziprecruiter.com, remote.co, smartrecruiters.com, jobvite.com, icims.com, bamboohr.com

Search directly on company domains: search "[company] careers remote ${roles[0]} site:[companydomain].com"`;

  } else if (sourceMode === 'linkedin') {
    sourceInstructions = `
SOURCE MODE: LINKEDIN ONLY
${indeedBan}
All applyUrl values must be linkedin.com/jobs URLs.
Search linkedin.com/jobs for remote roles in ${countries.join(', ')}.`;

  } else {
    // 'all' mode — everything except Indeed
    sourceInstructions = `
SOURCE MODE: ALL QUALITY SOURCES (Indeed permanently excluded)
${indeedBan}

Search ALL of the following sources and spread results across them:

TIER 1 — Direct company career pages (highest quality):
stripe.com/jobs, careers.cloudflare.com, hashicorp.com/jobs, datadoghq.com/careers, netflix.jobs, amazon.jobs, gitlab.com/jobs, mongodb.com/careers, elastic.co/careers, twilio.com/jobs, snyk.io/careers, pagerduty.com/careers, cockroachlabs.com/careers, coreweave.com/careers, fly.io/jobs, teleport.com/careers, gruntwork.io/careers, doppler.com/careers, figma.com/careers, fastly.com/careers, newrelic.com/about/careers

TIER 2 — Quality tech job boards:
- LinkedIn: linkedin.com/jobs
- Greenhouse: boards.greenhouse.io
- Lever: jobs.lever.co
- Ashby: jobs.ashby.com
- Wellfound: wellfound.com/jobs (startup-focused, high quality)
- We Work Remotely: weworkremotely.com (remote-only)
- Remotive: remotive.com (remote-only tech)
- Himalayas: himalayas.app (remote-only, curated)
- Remote.co: remote.co/remote-jobs
- NoFluffJobs: nofluffJobs.com (Europe-focused, transparent salaries)
- Jobspresso: jobspresso.co
- Working Nomads: workingnomads.com
- Stack Overflow Jobs: stackoverflow.com/jobs
- Otta: otta.com (UK/Europe focused)
- EuropeRemotely: europeremotely.com

Mix results from multiple tiers — don't cluster on just one source.`;
  }

  const prompt = `Today is ${today}. You are a specialist job search agent. Your task is to find REAL, CURRENTLY OPEN, fully remote job postings.

ROLES: ${roles.join(', ')}
COUNTRIES: ${countries.join(', ')}
POSTED WITHIN: last ${days} days — this is critical, only return jobs posted on or after ${new Date(Date.now() - days * 86400000).toISOString().split('T')[0]}
${salNote}${kwNote}

${sourceInstructions}

DATE ACCURACY RULES — VERY IMPORTANT:
- Only include jobs you can confirm were posted within the last ${days} days
- If you find a job but cannot confirm the posting date, do NOT include it
- Use the actual posting date from the job listing — do not guess or approximate
- Format dates as YYYY-MM-DD where possible, or "X days ago" if that's what the listing shows
- DO NOT include jobs that say "30+ days ago", "1 month ago", or have no date visible
- If a listing says "Just posted", "Today", "1 day ago", "2 days ago" — these are ideal, prioritise them

QUALITY RULES:
- No more than 1 job per company
- Each applyUrl must be unique and working
- Only include roles that are genuinely remote (not hybrid, not office-based)
- Target well-known tech companies, SaaS firms, cloud-native companies, funded startups
- Spread results across different companies and sources

Return ONLY a raw JSON array — no markdown, no explanation, no text before or after:
[{"company":"Name","title":"Exact Job Title","country":"United States","salary":"$120k-$150k or null","applyUrl":"https://...","postedDate":"2026-06-01","resumeKeywords":["kw1","kw2","kw3","kw4","kw5"],"techSkills":["s1","s2","s3","s4","s5"]}]

"country" must be one of: ${countries.join(', ')}
"salary" must be null if not listed — do not fabricate salary figures
Return ONLY the JSON array. No other text.`;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 6000,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 12 }],
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await anthropicRes.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = (data.content || []).map(b => b.type === 'text' ? b.text : '').filter(Boolean).join('\n');

    // Robust JSON extraction — bracket-depth walker
    let jobs = null;
    let depth = 0, inStr = false, escape = false, arrStart = -1;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inStr) { escape = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '[') { if (depth === 0) arrStart = i; depth++; }
      else if (ch === ']') {
        depth--;
        if (depth === 0 && arrStart !== -1) {
          try {
            const parsed = JSON.parse(text.slice(arrStart, i + 1));
            if (Array.isArray(parsed) && parsed.length > 0) { jobs = parsed; break; }
          } catch { arrStart = -1; }
        }
      }
    }

    if (!jobs || !jobs.length) return res.status(500).json({ error: 'No job data returned. Try again.' });

    // Always strip Indeed URLs regardless of mode
    jobs = jobs.filter(j => {
      if (!j.applyUrl) return false;
      try {
        const domain = new URL(j.applyUrl).hostname.toLowerCase();
        return !domain.includes('indeed.com');
      } catch { return false; }
    });

    // Company mode — additionally strip all third-party ATS/board URLs
    if (sourceMode === 'company') {
      const blacklist = ['lever.co','greenhouse.io','ashby.com','workday.com','dover.com',
        'himalayas.app','remotive.com','wellfound.com','weworkremotely.com','linkedin.com',
        'glassdoor.com','ziprecruiter.com','jobspresso.co','remote.co','monster.com',
        'simplyhired.com','dice.com','smartrecruiters.com','jobvite.com','icims.com',
        'taleo.net','successfactors.com','breezy.hr','bamboohr.com','nofluffjobs.com',
        'otta.com','europeremotely.com','workingnomads.com','stackoverflow.com'];
      jobs = jobs.filter(j => {
        try {
          const domain = new URL(j.applyUrl).hostname.toLowerCase();
          return !blacklist.some(b => domain.includes(b));
        } catch { return false; }
      });
    }

    return res.status(200).json({ jobs });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
