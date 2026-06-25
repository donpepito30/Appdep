/**
 * Versión server-side de las llamadas a la API externa.
 * No usa localStorage ni caché en memoria (la gestiona el endpoint).
 * Solo para uso en server.ts
 */

const API_BASE = 'https://sports.bzzoiro.com/api/v2';

async function fetchExternal<T = any>(endpoint: string, token: string): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}/${endpoint.replace(/^\/+/, '')}`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Token ${token}`,
      'Accept': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status} - ${response.statusText}`);
  }
  return response.json();
}

export async function getEvent(eventId: string, token: string): Promise<any> {
  return fetchExternal(`events/${eventId}/`, token);
}

export async function getStats(eventId: string, token: string): Promise<any> {
  return fetchExternal(`events/${eventId}/stats/`, token).catch(() => null);
}

export async function getPrediction(eventId: string, token: string): Promise<any> {
  // Intentar primero el endpoint en español
  const encoded = encodeURIComponent('predicción');
  try {
    return await fetchExternal(`eventos/${eventId}/${encoded}/`, token);
  } catch {
    // Fallback a inglés
    return fetchExternal(`events/${eventId}/prediction/`, token).catch(() => null);
  }
}

export async function getOdds(eventId: string, token: string): Promise<any> {
  return fetchExternal(`events/${eventId}/odds`, token).catch(() => null);
}

export async function getFixtures(teamId: string, token: string, days = 60, limit = 10): Promise<any[]> {
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - days);
  const dateStr = dateFrom.toISOString().split('T')[0];
  try {
    const data = await fetchExternal(`teams/${teamId}/fixtures/?date_from=${dateStr}&limit=${limit}`, token);
    return data.results || [];
  } catch {
    return [];
  }
}
