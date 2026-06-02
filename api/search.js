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

  // Build source instructions based on mode
  let sourceInstructions = '';
  if (sourceMode === 'company') {
    sourceInstructions = `
SOURCE RULES — COMPANY CAREER PAGES ONLY:
- STRICTLY return jobs from direct company career pages and ATS platforms ONLY
- DO NOT return any results from Indeed, LinkedIn, Glassdoor, ZipRecruiter, Monster, or ANY job aggregator
- ONLY use: boards.greenhouse.io, jobs.lever.co, jobs.ashby.com, app.dover.com, workday.com, icims.com, wellfound.com, remotive.com, weworkremotely.com, himalayas.app, remote.co, jobspresso.co, workingnomads.com, nofluffjobs.com
- Also search company career pages directly: careers.cloudflare.com, hashicorp.com/jobs, gruntwork.io/careers, careers.google.com, aws.amazon.com/careers, jobs.netflix.com, stripe.com/jobs, datadoghq.com/careers, mongodb.com/careers, elastic.co/careers, confluent.io/careers, fastly.com/careers
- Every applyUrl must be a direct link to the job on the company's own hiring system`;
  } else if (sourceMode === 'linkedin') {
    sourceInstructions = `
SOURCE RULES — LINKEDIN ONLY:
- ONLY return jobs posted on LinkedIn
- All applyUrl links must be linkedin.com/jobs URLs
- Search linkedin.com/jobs for remote ${roles.join(', ')} roles in ${countries.join(', ')}`;
  } else if (sourceMode === 'indeed') {
    sourceInstructions = `
SOURCE RULES — INDEED ONLY:
- ONLY return jobs posted on Indeed
- All applyUrl links must be indeed.com URLs
- Search indeed.com for remote ${roles.join(', ')} roles in ${countries.join(', ')}`;
  } else {
    // 'all' — no restriction
    sourceInstructions = `
SOURCE RULES — ALL SOURCES:
- Search across all job boards: Indeed, LinkedIn, Greenhouse, Lever, Ashby, Wellfound, Remotive, We Work Remotely, Himalayas, company career pages
- Prioritise direct company career page links over aggregators where possible`;
  }

  const prompt = `Today is ${today}. You are a job search specialist. Search for real, currently open, fully remote job postings for these roles: ${roles.join(', ')}. Target countries: ${countries.join(', ')}. Posted within the last ${days} days.${salNote}${kwNote}

${sourceInstructions}

GENERAL RULES:
- Each job must have a UNIQUE direct application URL — no duplicates
- No more than 1 job per company — spread results across different employers
- Prioritise well-known tech companies, unicorn startups, SaaS companies, cloud-native firms
- Return exactly ${count} jobs if available

Return ONLY a JSON array (no markdown, no preamble, no explanation) of up to ${count} jobs:
[{"company":"Name","title":"Exact Title","country":"United States","salary":"$120k-$150k" or null,"applyUrl":"https://...","postedDate":"YYYY-MM-DD or relative","resumeKeywords":["kw1","kw2","kw3","kw4","kw5"],"techSkills":["s1","s2","s3","s4","s5"]}]

"country" must be one of: ${countries.join(', ')}. Return ONLY valid JSON array, nothing else.`;

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

    const jobs = JSON.parse(text.slice(start, end + 1));
    return res.status(200).json({ jobs });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
