export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is not set.' });
  }

  try {
    // The frontend should send the entire payload ready for the Gemini API
    const payload = req.body;
    
    if (!payload || !payload.contents) {
      return res.status(400).json({ error: 'Invalid or missing payload in request body' });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error("Gemini API Error:", response.status, errText);
        return res.status(response.status).json({ error: `Gemini API error: ${response.status}` });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error("Internal API Error:", error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
