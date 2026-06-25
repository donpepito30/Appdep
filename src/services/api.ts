import { Event, Stats, Prediction, Odds, Incident, Player, Manager, H2HHistory, Competition, MatchDetail, OddMarket, EventMetadata, LineupData, PlayerMatchStats, TVChannel, Broadcast, TeamForm } from '../types';
import { alignScorelineWithProbabilities } from '../lib/prediction';

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
            
            // Handle structured Layout: { stats: { home, away } }
            if (data.stats && data.stats.home && data.stats.away) {
              const h = data.stats.home;
              const a = data.stats.away;
              
              const toNum = (v: any, fallback = 0): number => {
                if (v === null || v === undefined) return fallback;
                if (typeof v === 'number') return v;
                if (typeof v === 'object') {
                  const inner = v.actual ?? v.value ?? v.total ?? v.pct;
                  return typeof inner === 'number' ? inner : (inner !== undefined && inner !== null ? parseFloat(String(inner)) : fallback);
                }
                if (typeof v === 'string') {
                  const clean = v.replace('%', '').trim();
                  const parsed = parseFloat(clean);
                  return isNaN(parsed) ? fallback : parsed;
                }
                return fallback;
              };

              return {
                possessionHome: toNum(h.ball_possession ?? h.possession, 50),
                possessionAway: toNum(a.ball_possession ?? a.possession, 50),
                shotsHome: toNum(h.total_shots ?? h.shots, 0),
                shotsAway: toNum(a.total_shots ?? a.shots, 0),
                shotsOnTargetHome: toNum(h.shots_on_target ?? h.shots_on_target_avg, 0),
                shotsOnTargetAway: toNum(a.shots_on_target ?? a.shots_on_target_avg, 0),
                shotsOffTargetHome: toNum(h.shots_off_target, 0),
                shotsOffTargetAway: toNum(a.shots_off_target, 0),
                xgHome: toNum(h.xg ?? h.expected_goals, 0),
                xgAway: toNum(a.xg ?? a.expected_goals, 0),
                cornersHome: toNum(h.corner_kicks ?? h.corners, 0),
                cornersAway: toNum(a.corner_kicks ?? a.corners, 0),
                foulsHome: toNum(h.fouls, 0),
                foulsAway: toNum(a.fouls, 0),
                yellowCardsHome: toNum(h.yellow_cards, 0),
                yellowCardsAway: toNum(a.yellow_cards, 0),
                redCardsHome: toNum(h.red_cards, 0),
                redCardsAway: toNum(a.red_cards, 0),
                attacksHome: toNum(h.attack ?? h.attacks, 0),
                attacksAway: toNum(a.attack ?? a.attacks, 0),
                dangerousAttacksHome: toNum(h.dangerous_attack ?? h.dangerous_attacks, 0),
                dangerousAttacksAway: toNum(a.dangerous_attack ?? a.dangerous_attacks, 0),
                savesHome: toNum(h.goalkeeper_saves ?? h.saves, 0),
                savesAway: toNum(a.goalkeeper_saves ?? a.saves, 0),
                bigChancesHome: toNum(h.big_chances, 0),
                bigChancesAway: toNum(a.big_chances, 0),
                passesHome: toNum(h.passes, 0),
                passesAway: toNum(a.passes, 0),
                accuratePassesHome: toNum(h.accurate_passes, 0),
                accuratePassesAway: toNum(a.accurate_passes, 0),
                momentum_score: toNum(data.momentum ?? h.momentum, 0)
              } as Stats;
            }

            // Handle results array (array of {type: string, home: any, away: any})
            const results = data.results || 
                            (Array.isArray(data.stats) ? data.stats : null) || 
                            (Array.isArray(data.statistics) ? data.statistics : null) || 
                            (Array.isArray(data) ? data : null);
            
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
      const transformer = (data: any) => {
        if (!data) return null;
        
        const m = data.markets || {};
        const scoreM = m.score || {};
        const resM = m.match_result || {};
        const mmM = m.over_under || {};
        const amM = m.btts || {};
        const xgM = m.expected_goals || {};
        const model = data.modelo || data.model || {};
        const recs = data.recomendaciones || data.recommendations || {};

        const parseProb = (v: any, fallback = 0) => {
          if (v === undefined || v === null) return fallback;
          const n = Number(v);
          if (isNaN(n)) return fallback;
          return n > 1 ? n / 100 : n;
        };

        const valAnalysis = data.analisis_valor || data.value_analysis;

        const expectedHomeGoals = xgM.home !== undefined ? Number(xgM.home) : undefined;
        const expectedAwayGoals = xgM.away !== undefined ? Number(xgM.away) : undefined;

        return {
          homeWinProb: parseProb(resM.prob_home),
          drawProb: parseProb(resM.prob_draw),
          awayWinProb: parseProb(resM.prob_away),
          scoreline: scoreM.most_likely || data.scoreline,
          source: `BZZOIRO_AI_${model.version || 'v2'}`,
          confidence: model.confidence || 0.85,
          btts: !!(recs.btts),
          bttsProb: parseProb(amM.prob_yes),
          over15Prob: parseProb(mmM.prob_over_15),
          over25Prob: parseProb(mmM.prob_over_25),
          over35Prob: parseProb(mmM.prob_over_35),
          expectedHomeGoals,
          expectedAwayGoals,
          valueAnalysis: valAnalysis ? {
            expectedRoi: Number(valAnalysis.roi || valAnalysis.expected_roi || 0),
            valueScore: Number(valAnalysis.score || valAnalysis.value_score || 0),
            isValue: !!(valAnalysis.es_valor || valAnalysis.is_value),
            recommendedStake: Number(valAnalysis.stake || valAnalysis.recommended_stake || 1),
            market: valAnalysis.mercado || valAnalysis.market || recs.opportunity_market,
            odds: Number(valAnalysis.cuota || valAnalysis.odds || 0),
            probability: parseProb(valAnalysis.probabilidad || valAnalysis.probability || 0),
            percentage: Number(valAnalysis.ventaja || valAnalysis.percentage || valAnalysis.roi || valAnalysis.roi_percentage || 0)
          } : undefined,
          recommendations: {
            favorito: recs.favorito || recs.favorite,
            favorite_prob: recs.favorite_prob,
            bet_favorite: !!(recs.bet_favorite || recs.recommend_favorite),
            over_15: !!recs.over_15,
            over_25: !!recs.over_25,
            over_35: !!recs.over_35,
            btts: !!recs.btts,
            ganador: !!recs.winner,
            value_detected: !!(recs.bet_favorite || recs.winner || recs.over_25 || recs.value_detected || (valAnalysis && (valAnalysis.es_valor || valAnalysis.is_value))),
            opportunity_market: recs.bet_favorite ? 'Favorito con Valor' : recs.over_25 ? 'Over 2.5 Probable' : recs.btts ? 'BTTS Sí' : undefined
          }
        } as Prediction;
      };

      const tryFetchPrediction = async (path: string) => {
        try {
          return await fetchSeguro(path, onUpdate, transformer, { silent404: true, cacheTTL: 60000 });
        } catch {
          return null;
        }
      };

      const encoded = encodeURIComponent('predicción');
      let res = await tryFetchPrediction(`eventos/${eventId}/${encoded}/`);

      if (!res) {
        res = await tryFetchPrediction(`events/${eventId}/prediction/`);
      }

      if (!res) {
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
      }

      return res;
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
      return await fetchSeguro(`predictions/?page=${page}`, onUpdate, (data) => {
        if (!data || !data.results) return [];
        return data.results.map((item: any) => {
          const e = item.event || {};
          const m = item.markets || {};
          
          const resFull = m.match_result || {};
          const bttsMarket = m.btts || {};
          const mmMarket = m.over_under || {};
          const scoreMarket = m.score || {};
          const xgMarket = m.expected_goals || {};
          const model = item.modelo || item.model || {};
          const recs = item.recomendaciones || item.recommendations || {};

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
            xgHome: xgMarket.home || e.xg_home,
            xgAway: xgMarket.away || e.xg_away,
          };

          const parseProb = (v: any) => {
            if (v === undefined || v === null) return 0;
            const n = Number(v);
            if (isNaN(n)) return 0;
            return n > 1 ? n / 100 : n;
          };

          const valAnalysis = item.analisis_valor || item.value_analysis;

          const hp = parseProb(resFull.prob_home);
          const dp = parseProb(resFull.prob_draw);
          const ap = parseProb(resFull.prob_away);
          const rawScore = scoreMarket.most_likely || '1-1';
          const alignedScore = alignScorelineWithProbabilities(rawScore, hp, dp, ap);

          const prediction: Prediction = {
            homeWinProb: hp,
            drawProb: dp,
            awayWinProb: ap,
            scoreline: alignedScore,
            source: `BZZOIRO_AI_${model.version || 'v2'}`,
            confidence: model.confidence || 0.85,
            btts: !!(recs.btts),
            bttsProb: parseProb(bttsMarket.prob_yes || 0.5),
            over15Prob: parseProb(mmMarket.prob_over_15 || 0.75),
            over25Prob: parseProb(mmMarket.prob_over_25 || 0.5),
            over35Prob: parseProb(mmMarket.prob_over_35 || 0.25),
            expectedHomeGoals: xgMarket.home !== undefined ? Number(xgMarket.home) : undefined,
            expectedAwayGoals: xgMarket.away !== undefined ? Number(xgMarket.away) : undefined,
            valueAnalysis: valAnalysis ? {
              expectedRoi: Number(valAnalysis.roi || valAnalysis.expected_roi || 0),
              valueScore: Number(valAnalysis.score || valAnalysis.value_score || 0),
              isValue: !!(valAnalysis.es_valor || valAnalysis.is_value),
              recommendedStake: Number(valAnalysis.stake || valAnalysis.recommended_stake || 1),
              market: valAnalysis.mercado || valAnalysis.market || recs.opportunity_market,
              odds: Number(valAnalysis.cuota || valAnalysis.odds || 0),
              probability: parseProb(valAnalysis.probabilidad || valAnalysis.probability || 0),
              percentage: Number(valAnalysis.ventaja || valAnalysis.percentage || valAnalysis.roi || valAnalysis.roi_percentage || 0)
            } : undefined,
            recommendations: {
              favorito: recs.favorito || recs.favorite,
              favorite_prob: recs.favorite_prob,
              bet_favorite: !!(recs.bet_favorite || recs.recommend_favorite),
              over_15: !!recs.over_15,
              over_25: !!recs.over_25,
              over_35: !!recs.over_35,
              btts: !!recs.btts,
              ganador: !!recs.winner,
              value_detected: !!(recs.bet_favorite || recs.winner || recs.over_25 || recs.value_detected || (valAnalysis && (valAnalysis.es_valor || valAnalysis.is_value))),
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



  getOdds: async (eventId: string, onUpdate?: (data: OddMarket | null) => void, options?: { signal?: AbortSignal }): Promise<OddMarket | null> => {
    try {
      return await fetchSeguro(
        `events/${eventId}/odds/`,
        onUpdate,
        (data) => {
          if (!data) return null;
          // La API devuelve un array de OddsItemV2Schema
          const items: any[] = Array.isArray(data) 
            ? data 
            : (data.results || []);
          if (items.length === 0) return null;

          // Construir el objeto OddMarket plano desde los items
          const odds: OddMarket = {};
          items.forEach((item: any) => {
            const market = item.market;
            const outcome = item.outcome;
            const price = Number(item.decimal_odds);
            if (!price || isNaN(price)) return;

            if (market === '1x2') {
              if (outcome === 'HOME') odds.home_win = price;
              else if (outcome === 'DRAW') odds.draw = price;
              else if (outcome === 'AWAY') odds.away_win = price;
            } else if (market === 'btts') {
              if (outcome === 'yes') odds.btts_yes = price;
              else if (outcome === 'no') odds.btts_no = price;
            } else if (market === 'over_under_15') {
              if (outcome === 'over') odds.over_15_goals = price;
              else if (outcome === 'under') odds.under_15_goals = price;
            } else if (market === 'over_under_25') {
              if (outcome === 'over') odds.over_25_goals = price;
              else if (outcome === 'under') odds.under_25_goals = price;
            } else if (market === 'over_under_35') {
              if (outcome === 'over') odds.over_35_goals = price;
              else if (outcome === 'under') odds.under_35_goals = price;
            }
          });

          return Object.keys(odds).length > 0 ? odds : null;
        },
        { silent404: true, cacheTTL: 180000, signal: options?.signal }
      );
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
            ...inc,
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

  getH2H: async (eventId: string, _t2?: string, onUpdate?: (data: H2HHistory[]) => void): Promise<H2HHistory[]> => {
    try {
      return await fetchSeguro(
        `events/${eventId}/h2h/`,
        onUpdate,
        (data) => {
          if (!data) return [];
          // La API devuelve aggregate stats + recent_matches
          const recent = data.recent_matches || data.results || 
                         (Array.isArray(data) ? data : []);
          return recent.map((h: any) => ({
            date: h.event_date || h.date || '',
            homeTeam: h.home_team || '',
            awayTeam: h.away_team || '',
            homeTeamId: h.home_team_id,
            awayTeamId: h.away_team_id,
            league: h.league_name || h.league || '',
            homeScore: h.home_score ?? 0,
            awayScore: h.away_score ?? 0,
            xgHome: h.xg_home ?? 0,
            xgAway: h.xg_away ?? 0,
            possessionHome: h.possession_home ?? 50,
          })) as H2HHistory[];
        },
        { silent404: true, cacheTTL: 86400000 }
      );
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
      if (countryCode) q.append('country_code', countryCode);
      if (name) q.append('name', name);
      q.append('limit', limit.toString());
      return await fetchSeguro(`tv-channels/?${q.toString()}`, undefined, (data) => data?.results || [], { cacheTTL: 3600000 });
    } catch { return []; }
  },

  getTVChannelEmissions: async (channelId: number, options?: { leagueId?: number, seasonId?: number }): Promise<Broadcast[]> => {
    try {
      const q = new URLSearchParams();
      if (options?.leagueId) q.append('league_id', options.leagueId.toString());
      if (options?.seasonId) q.append('season_id', options.seasonId.toString());
      return await fetchSeguro(`tv-channels/${channelId}/broadcasts/?${q.toString()}`, undefined, (data) => data?.results || [], { cacheTTL: 3600000 });
    } catch { return []; }
  },

  getEventBroadcasts: async (eventId: string, countryCode?: string): Promise<Broadcast[]> => {
    try {
      const q = new URLSearchParams();
      if (countryCode) q.append('country_code', countryCode);
      return await fetchSeguro(`events/${eventId}/broadcasts/?${q.toString()}`, undefined, (data) => data?.results || [], { cacheTTL: 3600000 });
    } catch { return []; }
  },

  getGlobalBroadcasts: async (params: { leagueId?: number, teamId?: number, countryCode?: string, dateFrom?: string, dateTo?: string }): Promise<Broadcast[]> => {
    try {
      const q = new URLSearchParams();
      if (params.leagueId) q.append('league_id', params.leagueId.toString());
      if (params.teamId) q.append('team_id', params.teamId.toString());
      if (params.countryCode) q.append('country_code', params.countryCode);
      if (params.dateFrom) q.append('date_from', params.dateFrom);
      if (params.dateTo) q.append('date_to', params.dateTo);
      return await fetchSeguro(`broadcasts/?${q.toString()}`, undefined, (data) => data?.results || [], { cacheTTL: 3600000 });
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
      return await fetchSeguro(`events/${eventId}/odds/comparison/`, onUpdate, (data) => {
        if (!data) return [];
        return data.results || (Array.isArray(data) ? data : []);
      }, { silent404: true, cacheTTL: 60000 });
    } catch {
      return [];
    }
  },

  getPredictionsPrimaryEvents: async (): Promise<Event[]> => {
    try {
      const today = new Date();
      const tomorrow = new Date();
      tomorrow.setDate(today.getDate() + 1);

      const dateFrom = today.toISOString().split('T')[0];
      const dateTo = tomorrow.toISOString().split('T')[0];

      return await fetchSeguro(`events/?status=notstarted&date_from=${dateFrom}&date_to=${dateTo}&limit=100`, undefined, (data) => {
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
            status: 'SCHEDULED',
            leagueName: e.competition?.name || e.league?.name || e.leagueName || 'Desconocido',
            leagueId: String(e.league_id || e.league?.id || e.competition?.id || e.competition_id || ''),
            homeLogo: hLogo,
            awayLogo: aLogo,
            homeTeamId: hId,
            awayTeamId: aId,
            last_updated: e.last_updated
          };
        });
      }, { cacheTTL: 60000 });
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

// ============================================================
// NUEVAS FUNCIONES PARA CONGELACIÓN Y VALIDACIÓN DE VALOR
// ============================================================

/**
 * Convierte fixtures en TeamForm (extraído de useMatchStore para reutilización)
 */
export function transformToForm(fixtures: any[], teamId: string): TeamForm {
  const recent = (fixtures || []).slice(0, 10).map(f => {
    const isHome = String(f.homeTeamId || f.home_team_id) === String(teamId);
    const homeScore = f.homeScore ?? f.home_score ?? 0;
    const awayScore = f.awayScore ?? f.away_score ?? 0;
    const goalsFor = isHome ? homeScore : awayScore;
    const goalsAgainst = isHome ? awayScore : homeScore;
    
    let xgH = f.xgHome ?? f.xg_home;
    let xgA = f.xgAway ?? f.xg_away;
    
    if ((xgH === undefined || xgH === null) && f.stats) {
      const statsArr = Array.isArray(f.stats) ? f.stats : (f.stats.results || []);
      if (Array.isArray(statsArr)) {
        statsArr.forEach((s: any) => {
          const type = (s.type || s.name || '').toLowerCase();
          if (type === 'xg' || type.includes('expected goals')) {
            xgH = s.home ?? s.value_home;
            xgA = s.away ?? s.value_away;
          }
        });
      }
    }

    const xgFor = isHome ? (xgH ?? 0) : (xgA ?? 0);
    const xgAgainst = isHome ? (xgA ?? 0) : (xgH ?? 0);

    return {
      result: goalsFor > goalsAgainst ? 'W' as const : goalsFor === goalsAgainst ? 'D' as const : 'L' as const,
      score: `${homeScore}-${awayScore}`,
      opponent: isHome ? (f.awayTeamName || f.away_team_name || f.awayTeam) : (f.homeTeamName || f.home_team_name || f.homeTeam),
      xg: typeof xgFor === 'number' ? xgFor : (Number(xgFor) || 0),
      xgAgainst: typeof xgAgainst === 'number' ? xgAgainst : (Number(xgAgainst) || 0),
      date: f.date || f.event_date || f.startTime,
      goalsFor,
      goalsAgainst
    };
  });

  const totalMatches = recent.length || 1;
  const avgGoalsFor = recent.reduce((acc, r) => acc + r.goalsFor, 0) / totalMatches;
  const avgGoalsAgainst = recent.reduce((acc, r) => acc + r.goalsAgainst, 0) / totalMatches;
  const avgXGFor = recent.reduce((acc, r) => acc + r.xg, 0) / totalMatches;
  const avgXGAgainst = recent.reduce((acc, r) => acc + r.xgAgainst, 0) / totalMatches;

  return {
    recent,
    avgXGFor,
    avgXGAgainst,
    avgGoalsFor,
    avgGoalsAgainst
  };
}

/**
 * Valida si una apuesta tiene valor real comparando probabilidad estimada vs cuota de mercado
 */
export function computeLocalValue(
  match: { homeTeam: string; awayTeam: string },
  probs: { market: string; label: string; prob: number }[],
  odds: OddMarket | null
): { isValue: boolean; percentage: number; market: string; odds: number; probability: number } | null {
  if (!odds || probs.length === 0) return null;

  const top = probs[0];
  if (!top || top.prob < 0.45) return null;

  let odd: number | undefined;
  switch (top.market) {
    case 'BTTS': odd = odds.btts_yes; break;
    case 'OVER': odd = odds.over_25_goals; break;
    case 'OVER15': odd = odds.over_15_goals; break;
    case 'OVER35': odd = odds.over_35_goals; break;
    case '1X2':
      if (top.label === 'Local') odd = odds.home_win;
      else if (top.label === 'Visitante') odd = odds.away_win;
      else odd = odds.draw;
      break;
    default: odd = undefined;
  }

  if (!odd || odd < 1.5) return null;

  const impliedProb = 1 / odd;
  const edge = top.prob - impliedProb;
  const percentage = (edge / impliedProb) * 100;

  // Solo marcar valor si el edge > 8% y la probabilidad supera 55%
  if (percentage > 8 && top.prob > 0.55) {
    return {
      isValue: true,
      percentage,
      market: top.label,
      odds: odd,
      probability: top.prob,
    };
  }

  return null;
}

