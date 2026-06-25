import { Stats, Prediction, Odds, TeamForm, OddMarket } from '../types';

/**
 * Align and guarantee a scoreline matches the output win probabilities.
 * Mathematically links score outcome with win probability vector to eliminate contradictions.
 */
export function alignScorelineWithProbabilities(
  scoreline: string,
  homeProb: number,
  drawProb: number,
  awayProb: number
): string {
  if (!scoreline || scoreline === '?-?') {
    scoreline = '1-1';
  }
  
  const cleanScore = scoreline.replace(':', '-');
  const [hStr, aStr] = cleanScore.split('-');
  let h = parseInt(hStr);
  let a = parseInt(aStr);
  if (isNaN(h)) h = 1;
  if (isNaN(a)) a = 1;

  // Enforce consistent score based on dominant probability
  if (homeProb > awayProb && homeProb >= 0.40) {
    if (h <= a) {
      h = Math.max(1, a + 1);
    }
  } else if (awayProb > homeProb && awayProb >= 0.40) {
    if (a <= h) {
      a = Math.max(1, h + 1);
    }
  } else {
    // Expected draw or very close match
    if (h !== a) {
      const balanced = Math.max(1, Math.round((h + a) / 2));
      h = balanced;
      a = balanced;
    }
  }
  return `${h}-${a}`;
}

/**
 * Sigmoid function to convert value difference to probability.
 */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Factorial function for Poisson calculation.
 */
function factorial(n: number): number {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

/**
 * Poisson distribution: P(X=k) = (lambda^k * e^-lambda) / k!
 */
export function poissonProbability(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

/**
 * Calculate the probability of a result (i-j) using Poisson for two teams.
 */
function getMatchResultProb(homeLambda: number, awayLambda: number, homeGoals: number, awayGoals: number): number {
  return poissonProbability(homeLambda, homeGoals) * poissonProbability(awayLambda, awayGoals);
}

/**
 * Calculates weighted average of goals from last matches.
 * Weights: 1.0 (most recent) down to 0.1 (oldest).
 */
export function calculateWeightedAverage(lastGoals: number[]): number {
  if (lastGoals.length === 0) return 0;
  
  let totalWeight = 0;
  let sumWeighted = 0;
  
  // Take at most 10 recent matches
  const recent = lastGoals.slice(0, 10);
  
  recent.forEach((goals, i) => {
    const weight = Math.max(0.1, 1 - (i * 0.1));
    sumWeighted += goals * weight;
    totalWeight += weight;
  });
  
  return sumWeighted / totalWeight;
}

export const LEAGUE_HOME_ADVANTAGE: { [key: string]: number } = {
  'Premier League': 0.24,
  'La Liga': 0.26,
  'LaLiga': 0.26,
  'Bundesliga': 0.28,
  'Serie A': 0.23,
  'Ligue 1': 0.22,
  'MLS': 0.35,
  'Liga MX': 0.32,
  'Brasileirão': 0.38,
  'Eredivisie': 0.25,
  'Primera División Ecuador': 0.40,
  'LigaPro': 0.40
};

/**
 * Advanced Poisson Prediction Model.
 */
export function calculatePoissonModel(
  homeForm: TeamForm | null,
  awayForm: TeamForm | null,
  liveStats?: Stats | null,
  minute: number = 0,
  currentScore: { home: number, away: number } = { home: 0, away: 0 },
  leagueHomeAdvantage: number = 0.20
): Prediction & { poissonBttsProb?: number } {
  // 1. Calculate Media Ponderada for Goals For and Against
  const getWeightedGoals = (form: TeamForm | null, type: 'for' | 'against'): number => {
    if (!form || form.recent.length < 3) {
      // Use seasonal averages from standings if fixtures are sparse
      if (form) {
        return type === 'for' ? form.avgGoalsFor : form.avgGoalsAgainst;
      }
      return 1.4;
    }
    
    // Mix goals with xG if available for higher precision
    const data = form.recent.map(m => {
      const actual = type === 'for' ? m.goalsFor : m.goalsAgainst;
      const expected = type === 'for' ? m.xg : m.xgAgainst;
      return expected > 0 ? (actual * 0.4) + (expected * 0.6) : actual;
    });
    
    // Take weighted average
    const totalWeight = data.reduce((acc, _, idx) => acc + Math.max(0.1, 1 - (idx * 0.1)), 0);
    const sumWeighted = data.reduce((acc, val, idx) => acc + val * Math.max(0.1, 1 - (idx * 0.1)), 0);
    const weightedAvg = sumWeighted / (totalWeight || 1);
    
    return weightedAvg * 1.25; // Increased scaling for realistic variance
  };

  const gfMediaLocal = getWeightedGoals(homeForm, 'for');
  const gcMediaLocal = getWeightedGoals(homeForm, 'against');
  const gfMediaVisitante = getWeightedGoals(awayForm, 'for');
  const gcMediaVisitante = getWeightedGoals(awayForm, 'against');

  // 2. Adjust Lambdas for more dynamic goal projections using calibrated home advantage
  let lambdaHome = (gfMediaLocal + gcMediaVisitante) / 2 + leagueHomeAdvantage;
  let lambdaAway = (gfMediaVisitante + gcMediaLocal) / 2 + 0.10; // Adjusted visitor bias

  // 3. Adjust for Live Match State if applicable
  if (minute > 0) {
    const remainingTimeRatio = Math.max(0, (90 - minute) / 90);
    // Use current xG as a heavy signal for live lambda
    if (liveStats) {
      lambdaHome = (lambdaHome * remainingTimeRatio * 0.25) + (liveStats.xgHome * (1 - remainingTimeRatio) * 0.75);
      lambdaAway = (lambdaAway * remainingTimeRatio * 0.25) + (liveStats.xgAway * (1 - remainingTimeRatio) * 0.75);
    } else {
      lambdaHome *= remainingTimeRatio;
      lambdaAway *= remainingTimeRatio;
    }
  }

  // Add tactical variability and drift
  // Bias táctico fijo calibrado (sin varianza aleatoria)
  lambdaHome = Math.max(0.1, lambdaHome + 0.05);
  lambdaAway = Math.max(0.1, lambdaAway);

  // 3. Compute outcome matrix (up to 8 goals each)
  let homeWinProb = 0;
  let awayWinProb = 0;
  let drawProb = 0;
  let bttsProb = 0;
  let over15Prob = 0;
  let over25Prob = 0;
  let over35Prob = 0;

  const scoreHome = Number(currentScore.home) || 0;
  const scoreAway = Number(currentScore.away) || 0;

  let maxProb = -1;
  let predictedScoreline = '?-?';

  for (let h = 0; h <= 8; h++) {
    for (let a = 0; a <= 8; a++) {
      const prob = getMatchResultProb(lambdaHome, lambdaAway, h, a);
      
      const totalH = scoreHome + h;
      const totalA = scoreAway + a;
      const totalGoals = totalH + totalA;

      if (prob > maxProb) {
        maxProb = prob;
        predictedScoreline = `${totalH}-${totalA}`;
      }

      if (totalH > totalA) homeWinProb += prob;
      else if (totalA > totalH) awayWinProb += prob;
      else drawProb += prob;

      if (totalH > 0 && totalA > 0) bttsProb += prob;
      if (totalGoals > 1.5) over15Prob += prob;
      if (totalGoals > 2.5) over25Prob += prob;
      if (totalGoals > 3.5) over35Prob += prob;
    }
  }

  const purePoissonBtts = bttsProb;

  // 4. BTTS Refinement based on historical frequency
  let bttsHistoricalFreq = 0.5;
  let bttsReason = 'Proyección estadística basada en Poisson.';
  
  if (homeForm && awayForm) {
    const homeBTTS = homeForm.recent.filter(m => m.goalsFor > 0 && m.goalsAgainst > 0).length / (homeForm.recent.length || 1);
    const awayBTTS = awayForm.recent.filter(m => m.goalsFor > 0 && m.goalsAgainst > 0).length / (awayForm.recent.length || 1);
    bttsHistoricalFreq = (homeBTTS + awayBTTS) / 2;
    
    // Combine Poisson prob with historical frequency
    bttsProb = (bttsProb * 0.4) + (bttsHistoricalFreq * 0.6);
    
    if (bttsProb > 0.62) {
      bttsReason = `Alta frecuencia de ambos marcan (${(bttsHistoricalFreq * 100).toFixed(0)}%) en encuentros recientes de ambos equipos.`;
    } else if (bttsProb < 0.45) {
      bttsReason = `Baja probabilidad histórica y estadística de que ambos equipos anoten.`;
    } else {
      bttsReason = `Tendencia mixta en la capacidad goleadora/defensiva de los equipos.`;
    }
  }

  // Confidence calculation penalizing when form.recent.length < 5
  let recentCount = 5;
  if (homeForm && awayForm) {
    recentCount = Math.min(homeForm.recent.length, awayForm.recent.length);
  } else if (homeForm) {
    recentCount = homeForm.recent.length;
  } else if (awayForm) {
    recentCount = awayForm.recent.length;
  }
  const penalty = Math.min(1, recentCount / 5);
  const confidence = Math.min(0.95, (0.5 + (Math.abs(homeWinProb - awayWinProb) * 0.4) + (maxProb * 0.5)) * penalty);

  return {
    homeWinProb,
    drawProb,
    awayWinProb,
    scoreline: predictedScoreline, // Direct scoreline from maximum Poisson probability (unaligned)
    source: 'HEURISTIC', 
    confidence,
    btts: bttsProb > 0.6, // Higher threshold for "Yes"
    bttsProb,
    poissonBttsProb: purePoissonBtts,
    over15Prob,
    over25Prob,
    over35Prob,
    bttsReasoning: bttsReason
  };
}

/**
 * Custom BTTS calculation formula provided by the user.
 * Combines average xG, over 2.5 probability, and head-to-head performance.
 */
export function calcularBTTSPropio(
  xgLocal: number, 
  xgVisitante: number, 
  overProb?: number, 
  h2hStats?: { bttsPorcentaje?: number }
): number {
  // Fórmula combinando múltiples factores
  let bttsProb = 50; // base
  
  // Factor 1: xG promedio de ambos
  const xgPromedio = (xgLocal + xgVisitante) / 2;
  bttsProb += (xgPromedio - 1.2) * 10;
  
  // Factor 2: Over 2.5 de la API (si existe)
  if (overProb !== undefined) bttsProb += (overProb - 50) * 0.3;
  
  // Factor 3: Historial H2H
  if (h2hStats && h2hStats.bttsPorcentaje !== undefined && h2hStats.bttsPorcentaje > 50) {
    bttsProb += 8;
  }
  
  return Math.min(85, Math.max(25, Math.round(bttsProb)));
}

/**
 * Hybrid Prediction Logic based on a weighted ensemble model.
 * Combines Poisson (Statistical), ML (Pattern recognition), and Market (Bayesian) inputs.
 */
export function calculateHybridPrediction(
  eventId: string,
  stats: Stats | null | undefined,
  mlPrediction: Prediction | null,
  odds: OddMarket | null,
  form?: { home: TeamForm | null, away: TeamForm | null },
  minute: number = 0,
  currentScore: { home: number, away: number } = { home: 0, away: 0 },
  leagueName?: string
): Prediction {
  const sources: Prediction[] = [];
  
  // 1. Resolve Calibrated League Home Advantage
  let homeAdvantage = 0.20;
  if (leagueName) {
    const matchedKey = Object.keys(LEAGUE_HOME_ADVANTAGE).find(k => 
      leagueName.toLowerCase().includes(k.toLowerCase())
    );
    if (matchedKey) {
      homeAdvantage = LEAGUE_HOME_ADVANTAGE[matchedKey];
    }
  }

  // 2. Statistical Poisson Model (Historical basis)
  if (form?.home && form?.away) {
    const poisson = calculatePoissonModel(form.home, form.away, stats, minute, currentScore, homeAdvantage);
    poisson.confidence *= 1.2; // Increase weight of proven mathematical model
    sources.push(poisson);
  }

  // 3. ML Prediction (Black-box pattern matching)
  if (mlPrediction && mlPrediction.over25Prob !== undefined) {
    sources.push({ ...mlPrediction, confidence: mlPrediction.confidence || 0.6 });
  }

  // 4. Market Prediction (The 'Wisdom of the Crowd')
  if (odds && odds.home_win && odds.draw && odds.away_win) {
    const implHome = 1 / odds.home_win;
    const implDraw = 1 / odds.draw;
    const implAway = 1 / odds.away_win;
    const total = implHome + implDraw + implAway;
    
    // Market BTTS if available
    let marketBTTSProb = 0.5;
    if (odds.btts_yes) {
      marketBTTSProb = (1 / odds.btts_yes) / ((1 / odds.btts_yes) + (1 / (odds.btts_no || 2)));
    }

    sources.push({
      homeWinProb: implHome / total,
      drawProb: implDraw / total,
      awayWinProb: implAway / total,
      source: 'MARKET',
      confidence: 0.8, 
      scoreline: '?-?',
      btts: marketBTTSProb > 0.55,
      bttsProb: marketBTTSProb,
      over25Prob: odds.over_25_goals ? (1 / odds.over_25_goals) / ((1 / odds.over_25_goals) + (1 / (odds.under_25_goals || 2))) : 0.5
    });
  }

  // If no sources, return fallback
  if (sources.length === 0) {
    return {
      homeWinProb: 0.38,
      drawProb: 0.28,
      awayWinProb: 0.34,
      source: 'GENERIC',
      confidence: 0.1,
      scoreline: '1-1',
      btts: false,
      bttsProb: 0.48,
      over25Prob: 0.48
    };
  }

  // 5. Ensemble Weighting (Bayesian Weighting)
  let totalWeight = 0;
  let finalHome = 0;
  let finalDraw = 0;
  let finalAway = 0;
  let finalBTTS = 0;
  let finalOver25 = 0;

  sources.forEach(s => {
    finalHome += s.homeWinProb * s.confidence;
    finalDraw += s.drawProb * s.confidence;
    finalAway += s.awayWinProb * s.confidence;
    finalBTTS += (s.bttsProb || 0.5) * s.confidence;
    finalOver25 += (s.over25Prob || 0.5) * s.confidence;
    totalWeight += s.confidence;
  });

  // 6. Normalization & Final Confidence
  const s = finalHome + finalDraw + finalAway;
  
  const finalHomeProb = finalHome / s;
  const finalDrawProb = finalDraw / s;
  const finalAwayProb = finalAway / s;

  // 7. Ensemble BTTS 3-Way Integration
  // Poisson BTTS Puro (0.4) + Histórico (0.3) + Propio (0.3)
  let bttsHistoricalFreq = 0.5;
  if (form?.home && form?.away) {
    const homeRecent = form.home.recent || [];
    const awayRecent = form.away.recent || [];
    const homeBTTS = homeRecent.filter(m => m.goalsFor > 0 && m.goalsAgainst > 0).length / (homeRecent.length || 1);
    const awayBTTS = awayRecent.filter(m => m.goalsFor > 0 && m.goalsAgainst > 0).length / (awayRecent.length || 1);
    bttsHistoricalFreq = (homeBTTS + awayBTTS) / 2;
  }

  const xgLocal = form?.home?.avgXGFor ?? stats?.xgHome ?? 1.3;
  const xgVisitante = form?.away?.avgXGFor ?? stats?.xgAway ?? 1.1;
  const overProb = odds?.over_25_goals ? ((1 / odds.over_25_goals) * 100) : (mlPrediction?.over25Prob ? mlPrediction.over25Prob * 100 : undefined);
  const bttsPropioPct = calcularBTTSPropio(xgLocal, xgVisitante, overProb);
  const bttsPropioProb = bttsPropioPct / 100;

  const poissonSource = sources.find(src => src.source === 'HEURISTIC') as (Prediction & { poissonBttsProb?: number }) | undefined;
  const poissonPureBtts = poissonSource?.poissonBttsProb ?? poissonSource?.bttsProb ?? 0.5;

  const customBTTSProb = (poissonPureBtts * 0.4) + (bttsHistoricalFreq * 0.3) + (bttsPropioProb * 0.3);

  // Direct scoreline from first valid source's raw Poisson output (no post-hoc alignment)
  let rawScoreline = sources[0]?.scoreline || '1-1';
  if (rawScoreline === '?-?' && sources[1]?.scoreline && sources[1]?.scoreline !== '?-?') {
    rawScoreline = sources[1].scoreline;
  }

  // Refine BTTS Reasoning for high-level ensemble
  let bttsReasonFinal = sources.find(src => src.bttsReasoning)?.bttsReasoning || "Consenso de modelos estadísticos.";
  
  const prediction: Prediction = {
    homeWinProb: finalHomeProb,
    drawProb: finalDrawProb,
    awayWinProb: finalAwayProb,
    bttsProb: customBTTSProb,
    over25Prob: finalOver25 / totalWeight,
    source: 'ENSEMBLE_FIXED_V3',
    confidence: Math.min(0.98, totalWeight / sources.length),
    scoreline: rawScoreline, // Direct Poisson scoreline
    btts: customBTTSProb > 0.61, // Selectivity threshold
    bttsReasoning: bttsReasonFinal
  };

  return prediction;
}

/**
 * Momentum algorithm: -1 to +1 (Bayesian Pressure Matrix)
 */
export function calculateMomentum(stats: Stats | null | undefined): number {
  if (!stats) return 0;
  
  // Weights for different metrics (v2 logic)
  const weights = {
    shots: 0.4,
    sot: 0.8,
    xg: 1.5,
    dangerousAttacks: 0.35,
    corners: 0.25,
    attacks: 0.1
  };

  const homePressure = 
    ((stats.shotsHome || 0) * weights.shots) + 
    ((stats.shotsOnTargetHome || 0) * weights.sot) +
    ((stats.xgHome || 0) * weights.xg) +
    ((stats.dangerousAttacksHome || 0) * weights.dangerousAttacks) +
    ((stats.attacksHome || 0) * weights.attacks) +
    ((stats.cornersHome || 0) * weights.corners);
    
  const awayPressure = 
    ((stats.shotsAway || 0) * weights.shots) + 
    ((stats.shotsOnTargetAway || 0) * weights.sot) +
    ((stats.xgAway || 0) * weights.xg) +
    ((stats.dangerousAttacksAway || 0) * weights.dangerousAttacks) +
    ((stats.attacksAway || 0) * weights.attacks) +
    ((stats.cornersAway || 0) * weights.corners);
    
  const total = homePressure + awayPressure;
  
  if (total === 0 || isNaN(total)) return 0;
  // Normalized between -1 (Pure Away pressure) and +1 (Pure Home pressure)
  return (homePressure - awayPressure) / total;
}

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

