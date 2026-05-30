/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility for combining Tailwind classes safely.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Common types for the application
 */
export interface Event {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  startTime: string;
  status: 'LIVE' | 'FINISHED' | 'SCHEDULED';
  leagueName: string;
  leagueId?: string;
  homeLogo?: string;
  awayLogo?: string;
  xgHome?: number;
  xgAway?: number;
  currentMinute?: number;
  addedTime?: number;
  liveWebsocket?: boolean;
  homeTeamId?: string;
  awayTeamId?: string;
  last_updated?: string;
}

export interface Incident {
  minute: number;
  type: 'GOAL' | 'CARD' | 'SUBSTITUTION';
  team: 'HOME' | 'AWAY';
  player?: string;
  detail: string;
  sequence?: number;
}

export interface Stats {
  possessionHome: number;
  possessionAway: number;
  shotsHome: number;
  shotsAway: number;
  shotsOnTargetHome: number;
  shotsOnTargetAway: number;
  xgHome: number;
  xgAway: number;
  xP_home?: number; // Expected Points Home
  xP_away?: number; // Expected Points Away
  cornersHome: number;
  cornersAway: number;
  foulsHome?: number;
  foulsAway?: number;
  yellowCardsHome?: number;
  yellowCardsAway?: number;
  redCardsHome?: number;
  redCardsAway?: number;
  attacksHome?: number;
  attacksAway?: number;
  dangerousAttacksHome?: number;
  dangerousAttacksAway?: number;
  shotsOffTargetHome?: number;
  shotsOffTargetAway?: number;
  blockedShotsHome?: number;
  blockedShotsAway?: number;
  bigChancesHome?: number;
  bigChancesAway?: number;
  savesHome?: number;
  savesAway?: number;
  passesHome?: number;
  passesAway?: number;
  accuratePassesHome?: number;
  accuratePassesAway?: number;
  momentum_score?: number; // Normalized -100 to 100
}

export interface Prediction {
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  scoreline?: string;
  winProbHome?: number;
  source: string;
  confidence: number;
  btts: boolean;
  bttsProb?: number;
  over15Prob?: number;
  over25Prob?: number;
  over35Prob?: number;
  valueAnalysis?: {
    expectedRoi: number;
    valueScore: number; // 0-10
    marketEfficiency?: number;
    isValue?: boolean;
    recommendedStake?: number; // Kelly Criterion based if possible
    market?: string;
    odds?: number;
    probability?: number;
    percentage?: number;
  };
  recommendations?: {
    favorito?: 'H' | 'A' | 'D';
    favorite_prob?: number;
    bet_favorite?: boolean;
    over_15?: boolean;
    over_25?: boolean;
    over_35?: boolean;
    btts?: boolean;
    ganador?: boolean;
    value_detected?: boolean;
    opportunity_market?: string;
  };
  reasoning?: string;
  bttsReasoning?: string;
}

export interface OddMarket {
  home_win?: number;
  draw?: number;
  away_win?: number;
  over_15_goals?: number;
  over_25_goals?: number;
  over_35_goals?: number;
  under_15_goals?: number;
  under_25_goals?: number;
  under_35_goals?: number;
  btts_yes?: number;
  btts_no?: number;
}

export interface Odds {
  home: number;
  draw: number;
  away: number;
  bookmaker: string;
}
export interface Player {
  id: string;
  name: string;
  age: number;
  position: string;
  marketValue: string;
  currentTeam: string;
  photoUrl?: string;
  stats: {
    lastMatches: { id: string; date: string; result: string; rating: number }[];
    goals: number;
    xg: number;
    assists: number;
    avgRating: number;
  };
}

export interface LineupPlayer {
  id: string | number;
  name: string;
  short_name?: string;
  jersey_number?: number;
  position: string; // e.g., 'G', 'D', 'M', 'F'
  ai_score?: number;
  x?: number; // Optional for tactical board positioning
  y?: number;
}

export interface LineupTeam {
  team_id: number | string;
  team_name: string;
  formation: string;
  confidence?: number; // Only for predicted
  players: LineupPlayer[];
  substitutes: LineupPlayer[];
}

export interface LineupData {
  event_id: number | string;
  lineup_status: 'confirmed' | 'predicted' | 'unavailable';
  beta?: boolean;
  lineups: {
    home: LineupTeam;
    away: LineupTeam;
  } | null;
  unavailable_players: {
    home: { id: number; name: string; status: string; reason: string }[];
    away: { id: number; name: string; status: string; reason: string }[];
  } | null;
  updated_at: string | null;
}

export interface EventMetadata {
  event_id: number | string;
  jerseys?: {
    home: { player: any; GK: any };
    away: { player: any; GK: any };
  };
  venue?: {
    id: number | string;
    name: string;
    city?: string;
  };
  managers?: {
    home?: { id: number | string; name: string };
    away?: { id: number | string; name: string };
  };
  funfacts: { type_id: number; sentence: string }[];
  ai_preview?: {
    text: string;
    generated_at: string;
  };
}

export interface PlayerMatchStats {
  id: number;
  player_id: number;
  event_id: number;
  team_id: number;
  minutes_played: number;
  rating: number;
  goals: number;
  goal_assist: number;
  expected_goals: number;
  expected_assists: number;
  total_shots: number;
}

export interface TeamForm {
  recent: { 
    result: 'W' | 'L' | 'D'; 
    score: string; 
    opponent: string; 
    xg: number; 
    xgAgainst: number;
    date: string;
    goalsFor: number;
    goalsAgainst: number;
  }[];
  avgXGFor: number;
  avgXGAgainst: number;
  avgGoalsFor: number;
  avgGoalsAgainst: number;
}

export interface MatchDetail extends Event {
  lineups: {
    home: LineupPlayer[];
    away: LineupPlayer[];
    homeFormation: string;
    awayFormation: string;
  };
  form: {
    home: TeamForm;
    away: TeamForm;
  };
  h2h: H2HHistory[];
  stats: Stats;
  prediction: Prediction;
  odds: Odds[];
  incidents: Incident[];
}

export interface Manager {
  id: string;
  name: string;
  winRate: number;
  formations: { formation: string; count: number }[];
  xgFor: number;
  xgAgainst: number;
  over25Prob: number;
  photoUrl?: string;
}

export interface H2HHistory {
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamId?: string | number;
  awayTeamId?: string | number;
  league?: string;
  homeScore: number;
  awayScore: number;
  xgHome: number;
  xgAway: number;
  possessionHome: number;
}

export interface TVChannel {
  id: number;
  name: string;
  country_code: string;
  link: string;
}

export interface Broadcast {
  id: number;
  event_id: number;
  home_team_id: number;
  home_team: string;
  away_team_id: number;
  away_team: string;
  league_id: number;
  league_name: string;
  event_date: string;
  country_code: string;
  channel_id: number;
  channel_name: string;
  channel_link: string;
  scheduled_start_time: string;
}

export interface Competition {
  id: string;
  name: string;
  country: string;
  logoUrl?: string;
  teams: { id: string; name: string; position: number; form: string[] }[];
}
