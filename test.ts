import fetch from 'node-fetch';

if (!process.env.BZZOIRO_API_KEY) {
  console.error('BZZOIRO_API_KEY no definida en variables de entorno');
  process.exit(1);
}

async function test() {
  const apiKey = process.env.BZZOIRO_API_KEY;
  const targetUrl = `https://sports.bzzoiro.com/api/v2/events/`;
  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Accept": "application/json",
      }
    });
    console.log("Status:", response.status);
    const data = await response.json();
    console.log(JSON.stringify(data).substring(0, 500));
  } catch(e) {
    console.error(e);
  }
}
test();
