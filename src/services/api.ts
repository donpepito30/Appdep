import { Event, Stats, Prediction, Odds, Incident, Player, Manager, H2HHistory, Competition, MatchDetail, OddMarket, EventMetadata, LineupData, PlayerMatchStats, TVChannel, Broadcast } from '../types';

const API_BASE = '/api/v2';

// ---------------------------
// CACHE Y CONTADOR
// ---------------------------

export const failCache: Record<string, number> = {};
export const respuestasCache: Record<string, { data: any; timestamp: number }> = {};
export const logoCache: Record<string, string | null> = {};
export const nameCache: Record<string, string | null> = {};
export const fallosLogos = new Set<string>();

/**
 * Optimized image proxy URL generator
 * Types: team, league, player, manager, venue
 */
export const getImgUrl = (type: 'team' | 'league' | 'player' | 'manager' | 'venue', id: string | number) => {
  if (!id || id === 'null' || id === 'undefined') return null;
  return `https://sports.bzzoiro.com/img/${type}/${id}/`;
};

const inFlight = new Map<string, Promise<any>>();
const queue: (() => Promise<any>)[] = [];
let activeRequests = 0;
const MAX_CONCURRENT = 5;

async function processQueue() {
  if (activeRequests >= MAX_CONCURRENT || queue.length === 0) return;
  const next = queue.shift();
  if (next) {
    activeRequests++;
    try {
      await next();
    } finally {
      activeRequests--;
      processQueue();
    }
  }
}

// Helper to update team cache centrally
function updateTeamCache(id: string, name?: string, logo?: string) {
  if (!id) return;
  const sid = String(id);
  if (name && (!nameCache[sid] || nameCache[sid] === 'Unknown' || nameCache[sid]?.includes('Unknown'))) {
    nameCache[sid] = name;
  }
  // Try to use the proxy URL if we have an ID, otherwise fallback to provided logo
  const proxyUrl = getImgUrl('team', sid);
  if (!logoCache[sid]) {
    logoCache[sid] = proxyUrl || logo || null;
  }
}

// Subscriptores para la UI del contador
const counterSubscribers = new Set<(count: number, dateStr: string) => void>();
const statusSubscribers = new Set<(status: 'connected' | 'error' | 'unauthorized') => void>();

export function subscribeToApiCounter(callback: (count: number, dateStr: string) => void) {
  counterSubscribers.add(callback);
  callback(getApiCount().count, getApiCount().dateStr);
  return () => counterSubscribers.delete(callback);
}

export function subscribeToApiStatus(callback: (status: 'connected' | 'error' | 'unauthorized') => void) {
  statusSubscribers.add(callback);
  return () => statusSubscribers.delete(callback);
}

let currentApiStatus: 'connected' | 'error' | 'unauthorized' = 'connected';
function setApiStatus(status: 'connected' | 'error' | 'unauthorized') {
  currentApiStatus = status;
  statusSubscribers.forEach(cb => cb(status));
}

function getApiCount() {
  const dateStr = new Date().toISOString().split('T')[0];
  let count = 0;
  try {
    const saved = JSON.parse(localStorage.getItem('API_COUNTER') || '{}');
    if (saved.dateStr === dateStr) {
      count = saved.count;
    } else {
      localStorage.setItem('API_COUNTER', JSON.stringify({ count: 0, dateStr }));
    }
  } catch(e) {}
  return { count, dateStr };
}

function incrementApiCount() {
  const { count, dateStr } = getApiCount();
  const newCount = count + 1;
  localStorage.setItem('API_COUNTER', JSON.stringify({ count: newCount, dateStr }));
  counterSubscribers.forEach(cb => cb(newCount, dateStr));
}

// ---------------------------
// FETCH SEGURO
// ---------------------------

async function fetchSeguro<T>(
  endpoint: string, 
  onUpdate?: (data: T) => void,
  transform?: (data: any) => T,
  options: { maxRetries?: number; cacheTTL?: number; silent404?: boolean; timeout?: number; signal?: AbortSignal } = { maxRetries: 2, cacheTTL: 300000, silent404: false, timeout: 30000 }
): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `/api/v2/${endpoint.replace(/^\/+/, '')}`;
  
  // 1. Validar si ya falló recientemente (404, 400) - Timeout de 5 mins
  if (failCache[url] && Date.now() - failCache[url] < 300000) {
    if (transform) return transform(null) as T;
    return null as unknown as T;
  }

  // 2. Caché de respuestas con éxito y limpieza periódica (cada 100 llamadas o cuando es muy grande)
  const cacheTTL = options.cacheTTL || 300000;
  
  if (Object.keys(respuestasCache).length > 200) {
    const now = Date.now();
    for (const k in respuestasCache) {
      if (now - respuestasCache[k].timestamp > cacheTTL) {
        delete respuestasCache[k];
      }
    }
  }

  if (respuestasCache[url] && Date.now() - respuestasCache[url].timestamp < cacheTTL) {
    const cachedData = respuestasCache[url].data;
    const finalData = transform ? transform(cachedData) : cachedData as T;
    if (onUpdate) onUpdate(finalData);
    return finalData;
  }

  const token = sessionStorage.getItem('BSD_API_KEY') || localStorage.getItem('BSD_API_KEY');

  // 3. Colapsar peticiones en vuelo idénticas
  if (inFlight.has(url)) {
    return inFlight.get(url);
  }

  const networkFetch = (retries: number): Promise<T> => {
    return new Promise((resolve, reject) => {
      const task = async () => {
        const controller = new AbortController();
        const timeoutMs = options.timeout || 30000;
        const timeoutId = setTimeout(() => {
          controller.abort('Timeout reached');
        }, timeoutMs);
        
        let abortHandler: (() => void) | undefined;
        if (options.signal) {
          abortHandler = () => controller.abort(options.signal?.reason);
          options.signal.addEventListener('abort', abortHandler);
          if (options.signal.aborted) {
            controller.abort(options.signal.reason);
          }
        }
        
        try {
          const headers: Record<string, string> = {
            'Accept': 'application/json',
          };

          if (token) {
            headers['Authorization'] = `Token ${token}`;
          }

          incrementApiCount();
          
          const response = await fetch(url, { 
            headers,
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);

          if (response.status === 401 || response.status === 403) {
            setApiStatus('unauthorized');
            localStorage.removeItem('BSD_API_KEY');
            sessionStorage.removeItem('BSD_API_KEY');
            throw new Error('API Key inválida o expirada. Reconfigúrala.');
          }

          setApiStatus('connected');

          if ([400, 404, 405, 429].includes(response.status)) {
            if (response.status === 400 || response.status === 404) {
              failCache[url] = Date.now();
            }
            throw new Error(`Endpoint error HTTP ${response.status} (No retry)`);
          }

          if (!response.ok) {
            const error: any = new Error(`Error de servidor: ${response.status}`);
            error.status = response.status;
            throw error;
          }
          
          const contentType = response.headers.get('content-type');
          if (contentType && !contentType.includes('application/json')) {
            throw new Error(`El servidor no devolvió JSON (Status: ${response.status}).`);
          }

          const data = await response.json();
          respuestasCache[url] = { data, timestamp: Date.now() };
          
          const result = transform ? transform(data) : data as T;
          if (onUpdate) onUpdate(result);
          resolve(result);
        } catch (error: any) {
          clearTimeout(timeoutId);
          
          const isTimeout = error.name === 'AbortError' || (error.message && error.message.includes('Timeout'));
          const is404 = error.message && error.message.includes('HTTP 404');
          
          if (isTimeout) {
            // console.warn(`[API TIMEOUT] ${url} (after ${timeoutMs}ms)`);
          } else if (!is404 || !options.silent404) {
            // console.error(`[API ERROR] ${url}:`, error.message || error);
          }
          
          const errMsg = (error.message || '').toLowerCase();
          const isRetryable = isTimeout ||
                             error.name === 'TypeError' ||
                             errMsg.includes('fetch') || 
                             errMsg.includes('network') || 
                             errMsg.includes('failed to fetch') ||
                             [500, 502, 503, 504].includes(error.status);

          if (retries > 0 && isRetryable) {
            const delay = isTimeout ? 2000 : 1000;
            await new Promise(r => setTimeout(r, delay));
            // Re-queue for retry at the end of the queue to avoid blocking
            queue.push(() => task());
            processQueue();
          } else {
            if (!is404) setApiStatus('error');
            reject(error);
          }
        } finally {
          if (options.signal && abortHandler) {
            options.signal.removeEventListener('abort', abortHandler);
          }
          inFlight.delete(url);
        }
      };

      queue.push(task);
      processQueue();
    });
  };

  const promise = networkFetch(options.maxRetries || 1).catch(err => {
    return (transform ? transform(null) : null) as T;
  });
  
  inFlight.set(url, promise);
  return promise;
}

export const api = {
  getLiveEvents: async (onUpdate?: (data: Event[]) => void): Promise<Event[]> => {
    try {
      return await fetchSeguro('events/live/', onUpdate, (data) => {
        if (!data) return [];
        const rawEvents = data.results || data.events || (Array.isArray(data) ? data : []);
        return rawEvents.map((e: any) => {
          const hId = String(e.home_team_id || e.home_team?.id || '');
          const aId = String(e.away_team_id || e.away_team?.id || '');
          const hLogo = e.home_team?.logo_url || e.home_team_logo || e.home_logo || e.homeTeamLogo;
          const aLogo = e.away_team?.logo_url || e.away_team_logo || e.away_logo || e.awayTeamLogo;
          const hName = e.home_team?.name || e.home_team_name || e.home_team || e.homeTeam || 'Unknown Home';
          const aName = e.away_team?.name || e.away_team_name || e.away_team || e.awayTeam || 'Unknown Away';
          
          updateTeamCache(hId, hName, hLogo);
          updateTeamCache(aId, aName, aLogo);

          return {
            id: String(e.id),
            homeTeam: nameCache[hId] || hName,
            awayTeam: nameCache[aId] || aName,
            homeScore: e.home_score ?? 0,
            awayScore: e.away_score ?? 0,
            startTime: e.event_date || e.start_time || e.startTime || '',
            status: (e.status === 'inprogress' || e.status === 'live') ? 'LIVE' : (e.status === 'finished' ? 'FINISHED' : 'SCHEDULED'),
            leagueName: e.league_name || e.league?.name || e.competition?.name || 'Unknown League',
            leagueId: String(e.league_id || e.league?.id || e.competition?.id || e.competition_id || ''),
            homeLogo: hLogo,
            awayLogo: aLogo,
            xgHome: e.xg_home,
            xgAway: e.xg_away,
            currentMinute: e.current_minute || e.minute,
            addedTime: e.added_time,
            liveWebsocket: e.live_websocket,
            homeTeamId: hId,
            awayTeamId: aId,
            last_updated: e.last_updated
          };
        });
      }, { cacheTTL: 35000 }); // TTL alineado con la caché Redis de 30s en el servidor BSD (evita peticiones innecesarias)
    } catch {
      return [];
    }
  },

  getUpcomingEvents: async (): Promise<Event[]> => {
    try {
      const today = new Date();
      const future = new Date(today);
      future.setDate(today.getDate() + 3);
      
      const dateFrom = today.toISOString().split('T')[0];
      const dateTo = future.toISOString().split('T')[0];
      
      return await fetchSeguro(`events/?date_from=${dateFrom}&date_to=${dateTo}&limit=50`, undefined, (data) => {
        if (!data) return [];
        const rawEvents = data.results || data.events || (Array.isArray(data) ? data : []);
        return rawEvents.map((e: any) => {
          const hId = String(e.home_team_id || e.home_team?.id || e.homeTeamId || '');
          const aId = String(e.away_team_id || e.away_team?.id || e.awayTeamId || '');
          const hLogo = e.home_team?.logo_url || e.home_team_logo || e.homeTeamLogo;
          const aLogo = e.away_team?.logo_url || e.away_team_logo || e.awayTeamLogo;
          const hName = e.home_team?.name || e.home_team_name || e.home_team || e.homeTeam || 'Unknown Home';
          const aName = e.away_team?.name || e.away_team_name || e.away_team || e.awayTeam || 'Unknown Away';

          updateTeamCache(hId, hName, hLogo);
          updateTeamCache(aId, aName, aLogo);

          return {
            id: String(e.id),
            homeTeam: nameCache[hId] || hName,
            awayTeam: nameCache[aId] || aName,
            homeScore: e.home_score ?? 0,
            awayScore: e.away_score ?? 0,
            startTime: e.event_date || e.start_time || e.startTime || e.date || new Date().toISOString(),
            status: (e.status === 'inprogress' || e.status === 'live') ? 'LIVE' : (e.status === 'finished' ? 'FINISHED' : 'SCHEDULED'),
            leagueName: e.competition?.name || e.league?.name || e.leagueName || 'Desconocido',
            leagueId: String(e.league_id || e.league?.id || e.competition?.id || e.competition_id || ''),
            homeLogo: hLogo,
            awayLogo: aLogo,
            xgHome: e.xg_home || e.xgHome,
            xgAway: e.xg_away || e.xgAway,
            homeTeamId: hId,
            awayTeamId: aId,
          };
        });
      }, { cacheTTL: 1800000 }); // 30 mins for upcoming fixtures list
    } catch {
      return [];
    }
  },

  getTeam: async (id: string, options?: { signal?: AbortSignal }): Promise<any> => {
    try {
      if (!id) return null;
      if (fallosLogos.has(id)) return null;
      
      // If we have both name and logo in cache, return a synthetic response
      if (nameCache[id] && logoCache[id]) {
        return { id, name: nameCache[id], logo: logoCache[id] };
      }

      const res = await fetchSeguro(`teams/${id}`, undefined, (data) => {
        if (!data) return null;
        updateTeamCache(id, data.name, data.logo || data.logo_url || data.image_path);
        return data;
      }, { cacheTTL: 86400000, signal: options?.signal }); // Day cache for team static info
      
      if (!res) {
        fallosLogos.add(id);
      }
      return res;
    } catch {
      fallosLogos.add(id);
      return null;
    }
  },

  getTeams: async (limit = 100): Promise<any[]> => {
    try {
      return await fetchSeguro(`teams/?limit=${limit}`, undefined, (data) => data ? (data.results || []) : [], { cacheTTL: 3600000 }); // 1h cache
    } catch {
      return [];
    }
  },

  getFixtures: async (teamId: string, limit = 10, days = 60, options?: { signal?: AbortSignal }): Promise<any[]> => {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);
    const dateStr = dateFrom.toISOString().split('T')[0];
    try {
      return await fetchSeguro(`teams/${teamId}/fixtures/?date_from=${dateStr}&limit=${limit}`, undefined, (data) => {
        if (!data) return [];
        const results = data.results || [];
        return results.map((f: any) => ({
          id: f.id,
          date: f.date || f.start_time || f.event_date,
          homeTeam: f.home_team || f.homeTeam,
          awayTeam: f.away_team || f.awayTeam,
          homeTeamId: f.home_team_id,
          awayTeamId: f.away_team_id,
          homeScore: f.home_score,
          awayScore: f.away_score,
          xgHome: f.xg_home || f.xgHome,
          xgAway: f.xg_away || f.xgAway,
          stats: f.statistics || f.stats // Potential rich stats
        }));
      }, { maxRetries: 1, cacheTTL: 600000, signal: options?.signal });
    } catch {
      return [];
    }
  },

  getStats: async (eventId: string, onUpdate?: (data: Stats) => void, options?: { signal?: AbortSignal }): Promise<Stats | null> => {
    try {
      // BSD v2 stats can be at multiple paths. We'll try the most likely ones.
      // 1. events/{id}/stats/ (sub-resource)
      // 2. stats/?event_id={id} (query param)
      // 3. events/{id}/statistics/ (v1 legacy)

      // Helper to attempt a fetch and return transformed data
      const tryFetch = async (path: string) => {
        try {
          const res = await fetchSeguro(path, undefined, (data) => {
            if (!data) return null;
            
            // Handle results array (array of {type: string, home: any, away: any})
            const results = data.results || (Array.isArray(data) ? data : null);
            
            if (results && Array.isArray(results)) {
              const stats: any = {};
              results.forEach((item: any) => {
                const type = (item.type || item.name || '').toLowerCase();
                const h = item.home ?? item.value_home;
                const a = item.away ?? item.value_away;
                
                const parseVal = (v: any) => {
                  if (v === null || v === undefined) return 0;
                  return typeof v === 'string' ? parseFloat(v.replace('%', '')) : v;
                };

                if (type.includes('possession')) {
                  stats.possessionHome = parseVal(h);
                  stats.possessionAway = parseVal(a);
                } else if (type.includes('shots on goal') || type.includes('shots on target')) {
                  stats.shotsOnTargetHome = parseVal(h);
                  stats.shotsOnTargetAway = parseVal(a);
                } else if (type.includes('shots off target')) {
                  stats.shotsOffTargetHome = parseVal(h);
                  stats.shotsOffTargetAway = parseVal(a);
                } else if (type.includes('shots') && !type.includes('target')) {
                  stats.shotsHome = parseVal(h);
                  stats.shotsAway = parseVal(a);
                } else if (type.includes('corner')) {
                  stats.cornersHome = parseVal(h);
                  stats.cornersAway = parseVal(a);
                } else if (type.includes('foul')) {
                  stats.foulsHome = parseVal(h);
                  stats.foulsAway = parseVal(a);
                } else if (type.includes('yellow card')) {
                  stats.yellowCardsHome = parseVal(h);
                  stats.yellowCardsAway = parseVal(a);
                } else if (type.includes('red card')) {
                  stats.redCardsHome = parseVal(h);
                  stats.redCardsAway = parseVal(a);
                } else if (type === 'xg' || type.includes('expected goals')) {
                  stats.xgHome = parseVal(h);
                  stats.xgAway = parseVal(a);
                } else if (type.includes('dangerous attacks') || type.includes('ataques peligrosos')) {
                  stats.dangerousAttacksHome = parseVal(h);
                  stats.dangerousAttacksAway = parseVal(a);
                } else if (type.includes('attacks') || type.includes('ataques')) {
                  stats.attacksHome = parseVal(h);
                  stats.attacksAway = parseVal(a);
                } else if (type.includes('save') || type.includes('paradas')) {
                  stats.savesHome = parseVal(h);
                  stats.savesAway = parseVal(a);
                } else if (type.includes('big chances') || type.includes('ocasiones claras')) {
                  stats.bigChancesHome = parseVal(h);
                  stats.bigChancesAway = parseVal(a);
                } else if (type.includes('passes') && !type.includes('accurate')) {
                  stats.passesHome = parseVal(h);
                  stats.passesAway = parseVal(a);
                } else if (type.includes('accurate passes')) {
                  stats.accuratePassesHome = parseVal(h);
                  stats.accuratePassesAway = parseVal(a);
                }
              });
              
              if (Object.keys(stats).length > 0) {
                return {
                  possessionHome: stats.possessionHome ?? 50,
                  possessionAway: stats.possessionAway ?? 50,
                  shotsHome: stats.shotsHome ?? 0,
                  shotsAway: stats.shotsAway ?? 0,
                  shotsOnTargetHome: stats.shotsOnTargetHome ?? 0,
                  shotsOnTargetAway: stats.shotsOnTargetAway ?? 0,
                  shotsOffTargetHome: stats.shotsOffTargetHome,
                  xgHome: stats.xgHome ?? 0,
                  xgAway: stats.xgAway ?? 0,
                  cornersHome: stats.cornersHome ?? 0,
                  cornersAway: stats.cornersAway ?? 0,
                  foulsHome: stats.foulsHome ?? 0,
                  foulsAway: stats.foulsAway ?? 0,
                  yellowCardsHome: stats.yellowCardsHome ?? 0,
                  yellowCardsAway: stats.yellowCardsAway ?? 0,
                  redCardsHome: stats.redCardsHome ?? 0,
                  redCardsAway: stats.redCardsAway ?? 0,
                  attacksHome: stats.attacksHome,
                  attacksAway: stats.attacksAway,
                  dangerousAttacksHome: stats.dangerousAttacksHome,
                  dangerousAttacksAway: stats.dangerousAttacksAway,
                  savesHome: stats.savesHome,
                  savesAway: stats.savesAway,
                  bigChancesHome: stats.bigChancesHome,
                  bigChancesAway: stats.bigChancesAway,
                  passesHome: stats.passesHome,
                  passesAway: stats.passesAway,
                  accuratePassesHome: stats.accuratePassesHome,
                  accuratePassesAway: stats.accuratePassesAway,
                  momentum_score: data.momentum ?? data.momentum_score ?? (stats.dangerousAttacksHome ? (stats.dangerousAttacksHome - (stats.dangerousAttacksAway || 0)) : 0),
                  xP_home: data.xP_home ?? data.xp_home,
                  xP_away: data.xP_away ?? data.xp_away,
                } as Stats;
              }
            }

            // Fallback to flat object
            const s = data.live_stats || data.stats || data;
            if (s && (s.possession_home !== undefined || s.shots_home !== undefined)) {
                return {
                  possessionHome: s.possession_home ?? s.possessionHome ?? 50,
                  possessionAway: s.possession_away ?? s.possessionAway ?? 50,
                  shotsHome: s.shots_home ?? s.shotsHome ?? 0,
                  shotsAway: s.shots_away ?? s.shotsAway ?? 0,
                  shotsOnTargetHome: s.shots_on_target_home ?? s.shotsOnTargetHome ?? 0,
                  shotsOnTargetAway: s.shots_on_target_away ?? s.shotsOnTargetAway ?? 0,
                  xgHome: s.xg_home ?? s.xgHome ?? 0,
                  xgAway: s.xg_away ?? s.xgAway ?? 0,
                  cornersHome: s.corners_home ?? s.cornersHome ?? 0,
                  cornersAway: s.corners_away ?? s.cornersAway ?? 0,
                  foulsHome: s.fouls_home ?? s.foulsHome ?? 0,
                  foulsAway: s.fouls_away ?? s.foulsAway ?? 0,
                  yellowCardsHome: s.yellow_cards_home ?? s.yellowCardsHome ?? 0,
                  yellowCardsAway: s.yellow_cards_away ?? s.yellowCardsAway ?? 0,
                  momentum_score: s.momentum ?? s.momentum_score,
                  xP_home: s.xP_home ?? s.xp_home,
                  xP_away: s.xP_away ?? s.xp_away,
                } as Stats;
            }
            return null;
          }, { silent404: true, cacheTTL: 35000, signal: options?.signal }); // TTL de 35s alineado con caché Redis BSD
          return res;
        } catch {
          return null;
        }
      };

      // Try sequentially (or could be Promise.any if we want speed but risky for rate limits)
      let stats = await tryFetch(`events/${eventId}/stats/`);
      if (!stats) stats = await tryFetch(`stats/?event_id=${eventId}`);
      if (!stats) stats = await tryFetch(`events/${eventId}/statistics/`);

      if (stats && onUpdate) onUpdate(stats);
      return stats;
    } catch {
      return null;
    }
  },

  getPredictionDetailed: async (eventId: string, onUpdate?: (data: Prediction | null) => void): Promise<Prediction | null> => {
    try {
      // Prioritize v2 endpoint
      const res = await fetchSeguro(`eventos/${eventId}/predicción/`, onUpdate, (data) => {
        if (!data) return null;
        
        const m = data.mercados || {};
        const scoreM = m['puntuación'] || m['puntuacion'] || {};
        const resM = m['resultado_partido'] || {};
        const mmM = m['más_menos'] || {};
        const amM = m['ambos marcan'] || {};
        const model = data.modelo || {};
        const recs = data.recomendaciones || {};

        const parseProb = (v: any, fallback = 0) => {
          if (v === undefined || v === null) return fallback;
          const n = Number(v);
          if (isNaN(n)) return fallback;
          return n > 1 ? n / 100 : n;
        };

        return {
          homeWinProb: parseProb(resM.prob_local || resM.prob_1),
          drawProb: parseProb(resM.prob_empate || resM.prob_x),
          awayWinProb: parseProb(resM.prob_visitante || resM.prob_2),
          scoreline: scoreM.más_probable || scoreM.scoreline || data.scoreline,
          source: `BZZOIRO_AI_${model.versión || 'v2'}`,
          confidence: model.confianza || 0.85,
          btts: !!(recs.btts),
          bttsProb: parseProb(amM.prob_sí || amM.yes),
          over15Prob: parseProb(mmM.prob_más_15 || mmM.over_15),
          over25Prob: parseProb(mmM.prob_más_25 || mmM.over_25),
          over35Prob: parseProb(mmM.prob_más_35 || mmM.over_35),
          valueAnalysis: data.analisis_valor ? {
            expectedRoi: Number(data.analisis_valor.roi || 0),
            valueScore: Number(data.analisis_valor.score || 0),
            isValue: !!data.analisis_valor.es_valor,
            recommendedStake: Number(data.analisis_valor.stake || 1),
            market: data.analisis_valor.mercado || recs.opportunity_market,
            odds: Number(data.analisis_valor.cuota || 0),
            probability: parseProb(data.analisis_valor.probabilidad || 0),
            percentage: Number(data.analisis_valor.ventaja || data.analisis_valor.percentage || data.analisis_valor.roi || 0)
          } : undefined,
          recommendations: {
            favorito: recs.favorito,
            favorite_prob: recs.favorite_prob,
            bet_favorite: !!recs.bet_favorite,
            over_15: !!recs.over_15,
            over_25: !!recs.over_25,
            over_35: !!recs.over_35,
            btts: !!recs.btts,
            ganador: !!recs.ganador,
            value_detected: !!(recs.bet_favorite || recs.ganador || recs.over_25 || (data.analisis_valor && data.analisis_valor.es_valor)),
            opportunity_market: recs.bet_favorite ? 'Favorito con Valor' : recs.over_25 ? 'Over 2.5 Probable' : recs.btts ? 'BTTS Sí' : undefined
          }
        } as Prediction;
      }, { silent404: true, cacheTTL: 60000 });

      if (res) return res;

      // Fallback to simpler predictions endpoint if v2 fails or is 404
      return await fetchSeguro(`predictions/${eventId}`, onUpdate, (data) => {
        if (!data) return null;
        let p1 = Number(data.prob_home ?? data.home_win ?? 0);
        let px = Number(data.prob_draw ?? data.draw ?? 0);
        let p2 = Number(data.prob_away ?? data.away_win ?? 0);
        if (p1 > 1) { p1/=100; px/=100; p2/=100; }

        return {
          homeWinProb: p1,
          drawProb: px,
          awayWinProb: p2,
          scoreline: data.scoreline || data.predicted_score,
          source: 'BZZOIRO_V1_LEGACY',
          confidence: 0.7,
          btts: !!data.btts,
          bttsProb: (data.btts_prob || 0.5) > 1 ? (data.btts_prob/100) : (data.btts_prob || 0.5),
        } as Prediction;
      }, { silent404: true, cacheTTL: 60000 });
    } catch {
      return null;
    }
  },

  getBatchPredictions: async (eventIds: string[]): Promise<Record<string, Prediction | null>> => {
    const results: Record<string, Prediction | null> = {};
    const batchSize = 3;
    
    for (let i = 0; i < eventIds.length; i += batchSize) {
      const batch = eventIds.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(id => api.getPredictionDetailed(id))
      );
      batch.forEach((id, index) => {
        results[id] = batchResults[index];
      });
      if (i + batchSize < eventIds.length) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
    return results;
  },

  getV2Predictions: async (page = 1, onUpdate?: (data: { event: Event, prediction: Prediction }[]) => void): Promise<{ event: Event, prediction: Prediction }[]> => {
    try {
      return await fetchSeguro(`predicciones/?page=${page}`, onUpdate, (data) => {
        if (!data || !data.results) return [];
        return data.results.map((item: any) => {
          const e = item.event || {};
          const m = item.mercados || item.markets || {};
          
          // Spec markets: resultado_partido, goles_esperados, más_menos, ambos marcan, puntuación
          const resFull = m['resultado_partido'] || {};
          const bttsMarket = m['ambos marcan'] || m['ambos_equipos_marcan'] || {};
          const mmMarket = m['más_menos'] || m['over_under'] || {};
          const scoreMarket = m['puntuación'] || m['puntuacion'] || {};
          const xgMarket = m['goles_esperados'] || {};
          const model = item.modelo || {};
          const recs = item.recomendaciones || {};

          const hId = String(e.home_team_id || e.home_team?.id || '');
          const aId = String(e.away_team_id || e.away_team?.id || '');
          const hName = e.home_team || e.home_team?.name || 'Home';
          const aName = e.away_team || e.away_team?.name || 'Away';
          
          updateTeamCache(hId, hName);
          updateTeamCache(aId, aName);

          const event: Event = {
            id: String(e.id),
            homeTeam: nameCache[hId] || hName,
            awayTeam: nameCache[aId] || aName,
            homeScore: e.home_score ?? 0,
            awayScore: e.away_score ?? 0,
            startTime: e.event_date || e.start_time || '',
            status: e.status === 'finished' ? 'FINISHED' : (e.status === 'live' ? 'LIVE' : 'SCHEDULED'),
            leagueName: e.league_name || e.league?.name || 'League',
            leagueId: String(e.league_id || e.league?.id || ''),
            homeLogo: getImgUrl('team', hId) || undefined,
            awayLogo: getImgUrl('team', aId) || undefined,
            xgHome: xgMarket.local || e.xg_home,
            xgAway: xgMarket.visitante || e.xg_away,
          };

          const parseProb = (v: any) => {
            if (v === undefined || v === null) return 0;
            const n = Number(v);
            if (isNaN(n)) return 0;
            return n > 1 ? n / 100 : n;
          };

          const prediction: Prediction = {
            homeWinProb: parseProb(resFull.prob_local || resFull.prob_1),
            drawProb: parseProb(resFull.prob_empate || resFull.prob_x),
            awayWinProb: parseProb(resFull.prob_visitante || resFull.prob_2),
            scoreline: scoreMarket.más_probable || scoreMarket.scoreline,
            source: `BZZOIRO_AI_${model.versión || 'v2'}`,
            confidence: model.confianza || 0.85,
            btts: !!(recs.btts),
            bttsProb: parseProb(bttsMarket.prob_sí || bttsMarket.yes || 0.5),
            over15Prob: parseProb(mmMarket.prob_más_15 || 0.75),
            over25Prob: parseProb(mmMarket.prob_más_25 || mmMarket.over_25 || 0.5),
            over35Prob: parseProb(mmMarket.prob_más_35 || 0.25),
            recommendations: {
              favorito: recs.favorito,
              favorite_prob: recs.favorite_prob,
              bet_favorite: !!recs.bet_favorite,
              over_15: !!recs.over_15,
              over_25: !!recs.over_25,
              over_35: !!recs.over_35,
              btts: !!recs.btts,
              ganador: !!recs.ganador,
              value_detected: !!(recs.bet_favorite || recs.ganador || recs.over_25),
              opportunity_market: recs.bet_favorite ? 'Favorito con Valor' : recs.over_25 ? 'Over 2.5 Probable' : recs.btts ? 'BTTS Sí' : undefined
            }
          };

          return { event, prediction };
        });
      }, { cacheTTL: 120000 }); 
    } catch {
      return [];
    }
  },



  getOdds: async (eventId: string, onUpdate?: (data: any) => void, options?: { signal?: AbortSignal }): Promise<OddMarket | null> => {
    try {
      return await fetchSeguro(`events/${eventId}/odds`, onUpdate, (data) => data ? (data.odds || null) : null, { silent404: true, cacheTTL: 180000, signal: options?.signal }); // TTL de 3 min según documentación BSD
    } catch {
      return null;
    }
  },

  getIncidents: async (eventId: string, onUpdate?: (data: Incident[]) => void): Promise<Incident[]> => {
    try {
      return await fetchSeguro(`events/${eventId}/incidents`, onUpdate, (data) => {
        if (!data) return [];
        const raw = data.results || data.incidents || (Array.isArray(data) ? data : []);
        return raw.map((inc: any) => {
          let type: 'GOAL' | 'CARD' | 'SUBSTITUTION' = 'GOAL';
          const t = String(inc.type || inc.incident_type || '').toLowerCase();
          if (t.includes('card')) type = 'CARD';
          else if (t.includes('subst')) type = 'SUBSTITUTION';
          else if (t.includes('goal')) type = 'GOAL';

          return {
            minute: inc.minute || inc.time || 0,
            type,
            team: inc.is_home === true || inc.team_id === inc.home_team_id ? 'HOME' : 'AWAY',
            player: inc.player_name || inc.player || inc.name,
            detail: inc.detail || inc.incident_detail || (type === 'GOAL' ? 'Goal!' : ''),
            sequence: inc.sequence
          } as Incident;
        });
      }, { cacheTTL: 10000 });
    } catch {
      return [];
    }
  },

  searchPlayers: async (query: string, onUpdate?: (data: Player[]) => void): Promise<Player[]> => {
    try {
      // The prompt mentioned teams/?search=... but let's keep searchPlayers mapped to teams or players
      return await fetchSeguro(`teams/?search=${encodeURIComponent(query)}`, undefined, (data) => data ? (data.players || data.results || (Array.isArray(data) ? data : [])) : []);
    } catch {
      return [];
    }
  },

  getManager: async (id: string, onUpdate?: (data: Manager | null) => void): Promise<Manager | null> => {
    try {
      return await fetchSeguro(`managers/${id}/`, onUpdate);
    } catch {
      return null;
    }
  },

  getH2H: async (t1: string, t2: string, onUpdate?: (data: H2HHistory[]) => void): Promise<H2HHistory[]> => {
    try {
      const p1 = encodeURIComponent(t1);
      const p2 = encodeURIComponent(t2);
      return await fetchSeguro(`h2h/${p1}/${p2}/`, onUpdate, (data) => data ? (data.results || data.h2h || (Array.isArray(data) ? data : [])) : [], { silent404: true, cacheTTL: 86400000 }); // 24h cache for H2H
    } catch {
      return [];
    }
  },

  getLeagues: async (onUpdate?: (data: Competition[]) => void): Promise<Competition[]> => {
    try {
      return await fetchSeguro('leagues/', onUpdate, (data) => {
        if (!data) return [];
        const raw = data.results || data.competitions || (Array.isArray(data) ? data : []);
        return raw.map((l: any) => ({
          id: String(l.id),
          name: l.name,
          country: l.country?.name || l.country || 'International',
          logoUrl: getImgUrl('league', l.id) || l.logo || l.image_path,
          teams: [] // This will be populated by standings
        }));
      }, { cacheTTL: 86400000 }); // 24h cache for leagues
    } catch {
      return [];
    }
  },

  getLeagueDetails: async (leagueId: string): Promise<any | null> => {
    try {
      return await fetchSeguro(`leagues/${leagueId}/`, undefined, undefined, { silent404: true });
    } catch {
      return null;
    }
  },

  getStandings: async (leagueId: string, seasonId?: string, onUpdate?: (data: any[]) => void): Promise<any[]> => {
    try {
      const endpoint = seasonId 
        ? `leagues/${leagueId}/standings/?season_id=${seasonId}` 
        : `leagues/${leagueId}/standings/`;
      return await fetchSeguro(endpoint, onUpdate, (data) => {
        if (!data) return [];
        const standings = data.standings || data.results || (Array.isArray(data) ? data : []);
        
        // Update cache for each team in standings
        standings.forEach((team: any) => {
          const tId = String(team.team_id || team.id || team.team?.id || '');
          const tName = team.team_name || team.team?.name || team.name || '';
          const tLogo = team.team_logo || team.team?.logo || team.logo || team.image_path;
          if (tId && tName) {
            updateTeamCache(tId, tName, tLogo);
          }
        });
        
        return standings;
      }, { silent404: true, cacheTTL: 3600000 }); // 1h cache for standings
    } catch {
      return [];
    }
  },

  getMatchDetail: async (id: string, onUpdate?: (data: MatchDetail) => void): Promise<MatchDetail | null> => {
    try {
      return await fetchSeguro(`matches/${id}/detail/`, onUpdate);
    } catch {
      return null;
    }
  },

  getEventMetadata: async (eventId: string, onUpdate?: (data: EventMetadata | null) => void): Promise<EventMetadata | null> => {
    try {
      return await fetchSeguro(`events/${eventId}/metadata/`, onUpdate, (data) => {
        if (!data) return null;
        return {
          event_id: eventId,
          jerseys: data.jerseys,
          funfacts: data.funfacts || [],
          ai_preview: data.ai_preview,
          venue: data.venue ? {
            id: data.venue.id,
            name: data.venue.name,
            city: data.venue.city
          } : undefined,
          managers: data.managers ? {
            home: data.managers.home ? { id: data.managers.home.id, name: data.managers.home.name } : undefined,
            away: data.managers.away ? { id: data.managers.away.id, name: data.managers.away.name } : undefined,
          } : undefined
        } as EventMetadata;
      }, { silent404: true, cacheTTL: 60000 });
    } catch {
      return null;
    }
  },

  getEventLineups: async (eventId: string, onUpdate?: (data: LineupData | null) => void): Promise<LineupData | null> => {
    try {
      return await fetchSeguro(`events/${eventId}/lineups/`, onUpdate, undefined, { silent404: true, cacheTTL: 60000 });
    } catch {
      return null;
    }
  },

  getEventPlayerStats: async (eventId: string, onUpdate?: (data: PlayerMatchStats[]) => void): Promise<PlayerMatchStats[]> => {
    try {
      return await fetchSeguro(`events/${eventId}/player-stats/`, onUpdate, (data) => {
        if (!data) return [];
        return data.player_stats || data.results || (Array.isArray(data) ? data : []);
      }, { silent404: true, cacheTTL: 30000 });
    } catch {
      return [];
    }
  },

  getTVChannels: async (countryCode?: string, name?: string, limit = 50): Promise<TVChannel[]> => {
    try {
      const q = new URLSearchParams();
      if (countryCode) q.append('código_de_país', countryCode);
      if (name) q.append('nombre', name);
      q.append('límite', limit.toString());
      return await fetchSeguro(`canales-de-tv/?${q.toString()}`, undefined, (data) => data?.results || [], { cacheTTL: 3600000 });
    } catch { return []; }
  },

  getTVChannelEmissions: async (channelId: number, options?: { leagueId?: number, seasonId?: number }): Promise<Broadcast[]> => {
    try {
      const q = new URLSearchParams();
      if (options?.leagueId) q.append('ID_liga', options.leagueId.toString());
      if (options?.seasonId) q.append('ID_temporada', options.seasonId.toString());
      return await fetchSeguro(`canales-de-tv/${channelId}/emisiones/?${q.toString()}`, undefined, (data) => data?.results || [], { cacheTTL: 3600000 });
    } catch { return []; }
  },

  getEventBroadcasts: async (eventId: string, countryCode?: string): Promise<Broadcast[]> => {
    try {
      const q = new URLSearchParams();
      if (countryCode) q.append('código_de_país', countryCode);
      return await fetchSeguro(`eventos/${eventId}/difusiones/?${q.toString()}`, undefined, (data) => data?.results || [], { cacheTTL: 3600000 });
    } catch { return []; }
  },

  getGlobalBroadcasts: async (params: { leagueId?: number, teamId?: number, countryCode?: string, dateFrom?: string, dateTo?: string }): Promise<Broadcast[]> => {
    try {
      const q = new URLSearchParams();
      if (params.leagueId) q.append('ID_liga', params.leagueId.toString());
      if (params.teamId) q.append('ID_equipo', params.teamId.toString());
      if (params.countryCode) q.append('código_de_país', params.countryCode);
      if (params.dateFrom) q.append('fecha_desde', params.dateFrom);
      if (params.dateTo) q.append('fecha_hasta', params.dateTo);
      return await fetchSeguro(`difusiones/?${q.toString()}`, undefined, (data) => data?.results || [], { cacheTTL: 3600000 });
    } catch { return []; }
  },

  getShotmap: async (eventId: string, onUpdate?: (data: any[]) => void): Promise<any[]> => {
    try {
      return await fetchSeguro(`events/${eventId}/shotmap/`, onUpdate, (data) => {
        if (!data) return [];
        return data.results || (Array.isArray(data) ? data : []);
      }, { silent404: true, cacheTTL: 120000 });
    } catch {
      return [];
    }
  },

  compareOdds: async (eventId: string, onUpdate?: (data: any[]) => void): Promise<any[]> => {
    try {
      return await fetchSeguro(`events/${eventId}/odds?market=compare`, onUpdate, (data) => {
        if (!data) return [];
        return data.results || (Array.isArray(data) ? data : []);
      }, { silent404: true, cacheTTL: 60000 });
    } catch {
      return [];
    }
  },

  getSocialItems: async (params: { event?: string, team?: string, player?: string, manager?: string }, onUpdate?: (data: any[]) => void): Promise<any[]> => {
    try {
      const qParams = new URLSearchParams();
      if (params.event) qParams.append('event', params.event);
      if (params.team) qParams.append('team', params.team);
      if (params.player) qParams.append('player', params.player);
      if (params.manager) qParams.append('manager', params.manager);
      
      const qs = qParams.toString();
      const endpoint = qs ? `social/?${qs}` : `social/`;
      return await fetchSeguro(endpoint, onUpdate, (data) => {
        if (!data) return [];
        return data.results || (Array.isArray(data) ? data : []);
      }, { silent404: true, cacheTTL: 60000 });
    } catch {
      return [];
    }
  }
};
