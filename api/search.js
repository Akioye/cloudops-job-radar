export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured in Vercel environment variables.' });

  const { roles, countries, days, minSalary, extraKeywords } = req.body;
  if (!roles || !roles.length) return res.status(400).json({ error: 'No roles provided.' });
  if (!countries || !countries.length) return res.status(400).json({ error: 'No countries selected.' });

  const today = new Date().toISOString().split('T')[0];

  // Build country-aware job board list
  const boardMap = {
    'United States': 'LinkedIn, Indeed, Greenhouse, Lever, Workday, Wellfound, Dice',
    'Canada':        'LinkedIn, Indeed Canada, Workopolis, Glassdoor CA, WellFound',
    'United Kingdom':'LinkedIn, Indeed UK, TotalJobs, CWJobs, Reed.co.uk',
    'Germany':       'LinkedIn, Indeed DE, StepStone, XING, Glassdoor DE',
    'Netherlands':   'LinkedIn, Indeed NL, Nationale Vacaturebank, Monsterboard',
    'France':        'LinkedIn, Indeed FR, Welcome to the Jungle, Apec',
    'Ireland':       'LinkedIn, Indeed IE, IrishJobs.ie, Jobs.ie',
    'Spain':         'LinkedIn, Indeed ES, InfoJobs, Tecnoempleo',
    'Poland':        'LinkedIn, Indeed PL, Pracuj.pl, NoFluffJobs',
    'Portugal':      'LinkedIn, Indeed PT, Landing.jobs, Sapo Emprego',
  };

  const countryList = countries.join(', ');
  const boardList = [...new Set(countries.flatMap(c => (boardMap[c] || 'LinkedIn, Indeed').split(', ')))].join(', ');
  const salNote = minSalary ? ` Only include roles with salary above $${parseInt(minSalary).toLocaleString()} or equivalent.` : '';
  const kwNote  = extraKeywords ? ` Extra focus: ${extraKeywords}.` : '';

  const prompt = `Today is ${today}. Search for currently posted fully remote job openings for these roles: ${roles.join(', ')}. Target countries: ${countryList}. Posted within the last ${days} days.${salNote}${kwNote}

Search these job boards: ${boardList}. Also check company career pages. Focus on tech companies, cloud-native startups, consulting firms, and enterprises actively hiring.

Return ONLY a JSON array (no markdown, no preamble, no explanation) of 15-20 jobs with this exact structure:
[{"company":"Name","title":"Exact Title","country":"United States","salary":"$120k-$150k" or null,"applyUrl":"https://...","postedDate":"YYYY-MM-DD or relative like '2 days ago'","resumeKeywords":["kw1","kw2","kw3","kw4","kw5"],"techSkills":["s1","s2","s3","s4","s5"]}]

"country" must be one of the target countries. Use real job URLs. resumeKeywords = ATS-optimized resume phrases. techSkills = specific technologies required. Return ONLY valid JSON array, nothing else.`;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
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
