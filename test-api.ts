const token = process.env.BZZOIRO_API_KEY;

async function testMain() {
  const headers = { 'Authorization': `Token ${token}`, 'Accept': 'application/json' };
  
  try {
    const resPred = await fetch('https://sports.bzzoiro.com/api/v2/predictions/?limit=20', { headers });
    if (resPred.ok) {
       const data = await resPred.json();
       for (const r of data.results) {
         const eventId = r.event?.id;
         console.log(`Checking player stats for ${eventId} (${r.event?.home_team} vs ${r.event?.away_team})...`);
         const pStatsRes = await fetch(`https://sports.bzzoiro.com/api/v2/events/${eventId}/player-stats/`, { headers });
         if (pStatsRes.ok) {
            const psData = await pStatsRes.json();
            const results = psData.player_stats || psData.results || (Array.isArray(psData) ? psData : null);
            if (results && results.length > 0) {
               console.log("Found player stats sample item:", JSON.stringify(results[0], null, 2));
               return;
            }
         }
       }
       console.log("No player stats found in any of the events checked.");
    }
  } catch (err: any) {
    console.error("Error direct:", err.message || err);
  }
}

testMain();
