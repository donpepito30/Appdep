import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Event, H2HHistory } from '../types';

export interface PredictionAnalysisData {
  homeForm: string[];
  awayForm: string[];
  homeFixtures: any[];
  awayFixtures: any[];
  h2h: H2HHistory[];
  homeXG: number;
  awayXG: number;
  homeAvgGoals: number;
  awayAvgGoals: number;
  loading: boolean;
  error: string | null;
}

/**
 * Hook to fetch all necessary data for AI prediction analysis.
 */
export function usePredictionData(match: Event | null, enabled: boolean = true): PredictionAnalysisData {
  const [data, setData] = useState<PredictionAnalysisData>({
    homeForm: [],
    awayForm: [],
    homeFixtures: [],
    awayFixtures: [],
    h2h: [],
    homeXG: 0,
    awayXG: 0,
    homeAvgGoals: 0,
    awayAvgGoals: 0,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!enabled || !match?.homeTeamId || !match?.awayTeamId) {
      return;
    }

    const controller = new AbortController();

    async function fetchData() {
      setData(prev => ({ ...prev, loading: true, error: null }));
      
      try {
        const [homeFix, awayFix, h2hRaw] = await Promise.all([
          api.getFixtures(match!.homeTeamId!, 5, 120, { signal: controller.signal }),
          api.getFixtures(match!.awayTeamId!, 5, 120, { signal: controller.signal }),
          api.getH2H(match!.homeTeamId!, match!.awayTeamId!)
        ]);

        const getFormArray = (fix: any[], teamId: string) => {
          return fix.map(f => {
            const isHome = String(f.homeTeamId) === teamId;
            const gf = isHome ? f.homeScore! : f.awayScore!;
            const ga = isHome ? f.awayScore! : f.homeScore!;
            if (gf > ga) return 'W';
            if (gf < ga) return 'L';
            return 'D';
          });
        };

        const calculateAvgGoals = (fix: any[], teamId: string) => {
          if (fix.length === 0) return 0;
          const total = fix.reduce((acc, f) => {
            const isHome = String(f.homeTeamId) === teamId;
            return acc + (isHome ? (f.homeScore || 0) : (f.awayScore || 0));
          }, 0);
          return total / fix.length;
        };

        const calculateAvgXG = (fix: any[], teamId: string) => {
          if (fix.length === 0) return 0;
          const total = fix.reduce((acc, f) => {
            const isHome = String(f.homeTeamId) === teamId;
            const xgResult = isHome ? (f.xgHome || 0) : (f.xgAway || 0);
            return acc + (typeof xgResult === 'number' ? xgResult : (parseFloat(String(xgResult)) || 0));
          }, 0);
          return total / fix.length;
        };

        const h2hScores = h2hRaw.slice(0, 5);

        setData({
          homeForm: getFormArray(homeFix, match!.homeTeamId!),
          awayForm: getFormArray(awayFix, match!.awayTeamId!),
          homeFixtures: homeFix,
          awayFixtures: awayFix,
          h2h: h2hScores,
          homeAvgGoals: calculateAvgGoals(homeFix, match!.homeTeamId!),
          awayAvgGoals: calculateAvgGoals(awayFix, match!.awayTeamId!),
          homeXG: calculateAvgXG(homeFix, match!.homeTeamId!),
          awayXG: calculateAvgXG(awayFix, match!.awayTeamId!),
          loading: false,
          error: null,
        });

      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('[usePredictionData] Error:', err);
          setData(prev => ({ 
            ...prev, 
            loading: false, 
            error: err.message || 'Error al obtener datos de predicción' 
          }));
        }
      }
    }

    fetchData();

    return () => controller.abort();
  }, [match?.id, match?.homeTeamId, match?.awayTeamId, match?.homeTeam, match?.awayTeam]);

  return data;
}
