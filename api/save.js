export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
  if (!scriptUrl) {
    return res.status(500).json({ error: 'GOOGLE_SCRIPT_URL environment variable is not set.' });
  }

  try {
    const payload = req.body;

    const response = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error("Google Sheets Script Error:", response.status, errText);
        return res.status(response.status).json({ error: `Google Sheets error: ${response.status}` });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error("Internal Server Error fetching Google Apps Script:", error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
