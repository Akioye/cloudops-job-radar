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

  let sourceInstructions = '';

  if (sourceMode === 'company') {
    sourceInstructions = `
SOURCE MODE: COMPANY CAREER PAGES ONLY — THIS IS STRICT

A "company career page" means the URL domain matches the company's own brand name.
VALID examples:
- stripe.com/jobs → Stripe's own site ✅
- careers.cloudflare.com → Cloudflare's own site ✅
- netflix.jobs → Netflix's own site ✅
- hashicorp.com/jobs → HashiCorp's own site ✅
- datadoghq.com/careers → Datadog's own site ✅
- gruntwork.io/careers → Gruntwork's own site ✅
- careers.google.com → Google's own site ✅
- amazon.jobs → Amazon's own site ✅
- gitlab.com/jobs → GitLab's own site ✅
- figma.com/careers → Figma's own site ✅

INVALID — these are third-party platforms, NOT company sites, NEVER use them:
- lever.co ❌
- greenhouse.io ❌
- ashby.com ❌
- workday.com ❌
- dover.com ❌
- himalayas.app ❌
- remotive.com ❌
- wellfound.com ❌
- weworkremotely.com ❌
- indeed.com ❌
- linkedin.com ❌
- glassdoor.com ❌
- ziprecruiter.com ❌
- jobspresso.co ❌
- remote.co ❌
- monster.com ❌
- simplyhired.com ❌
- dice.com ❌

RULE: If the URL domain does not contain the company's own name/brand, REJECT IT. Do not include that job.

HOW TO FIND THEM:
- Search "site:careers.[companyname].com remote [role]"
- Search "[company name] careers remote [role] 2026"
- Search "[company name] jobs remote devops cloud engineer"
- Go directly to known tech company career pages: stripe.com/jobs, cloudflare.com/careers, hashicorp.com/jobs, datadoghq.com/careers, mongodb.com/careers, elastic.co/careers, confluent.io/careers, fastly.com/careers, twilio.com/jobs, pagerduty.com/careers, newrelic.com/about/careers, rubrik.com/careers, lacework.com/careers, snyk.io/careers, gitlab.com/jobs, atlassian.com/company/careers, github.com/about/careers, cloudsmith.com/careers, teleport.com/careers, gruntwork.io/careers, doppler.com/careers, dbt labs.com/careers, fivetran.com/careers, airbyte.com/careers, cockroachlabs.com/careers, coreweave.com/careers, pinecone.io/careers, modal.com/careers, fly.io/jobs

Only return a job if you have verified the direct company career page URL.`;

  } else if (sourceMode === 'linkedin') {
    sourceInstructions = `
SOURCE MODE: LINKEDIN ONLY
- All applyUrl values must be linkedin.com/jobs URLs
- Search linkedin.com/jobs for remote ${roles.join(', ')} in ${countries.join(', ')}`;

  } else if (sourceMode === 'indeed') {
    sourceInstructions = `
SOURCE MODE: INDEED ONLY
- All applyUrl values must be indeed.com URLs
- Search indeed.com for remote ${roles.join(', ')} in ${countries.join(', ')}`;

  } else {
    sourceInstructions = `
SOURCE MODE: ALL SOURCES
- Search across Indeed, LinkedIn, and company career pages
- Prefer direct company career page links where available`;
  }

  const prompt = `Today is ${today}. You are a job search specialist. Find real, currently open, fully remote job postings for: ${roles.join(', ')}. Target countries: ${countries.join(', ')}. Posted within the last ${days} days.${salNote}${kwNote}

${sourceInstructions}

ADDITIONAL RULES:
- No more than 1 job per company
- Each applyUrl must be unique
- Target well-known tech companies, SaaS companies, cloud-native firms, unicorn startups
- Return exactly ${count} jobs

Return ONLY a raw JSON array, no markdown, no explanation, no preamble:
[{"company":"Stripe","title":"Senior DevOps Engineer","country":"United States","salary":"$150k-$180k","applyUrl":"https://stripe.com/jobs/listing/...","postedDate":"2026-05-30","resumeKeywords":["kw1","kw2","kw3","kw4","kw5"],"techSkills":["s1","s2","s3","s4","s5"]}]

"country" must be one of: ${countries.join(', ')}. Return ONLY the JSON array.`;

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
    const start = text.indexOf('[');
    const end   = text.lastIndexOf(']');
    if (start === -1 || end === -1) return res.status(500).json({ error: 'No job data returned. Try again.' });

    // Post-process: if company mode, strip any jobs where the URL domain doesn't look like a company site
    let jobs = JSON.parse(text.slice(start, end + 1));

    if (sourceMode === 'company') {
      const blacklist = ['lever.co','greenhouse.io','ashby.com','workday.com','dover.com',
        'himalayas.app','remotive.com','wellfound.com','weworkremotely.com','indeed.com',
        'linkedin.com','glassdoor.com','ziprecruiter.com','jobspresso.co','remote.co',
        'monster.com','simplyhired.com','dice.com','smartrecruiters.com','jobvite.com',
        'icims.com','taleo.net','successfactors.com','breezy.hr','bamboohr.com'];
      jobs = jobs.filter(j => {
        if (!j.applyUrl) return false;
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
