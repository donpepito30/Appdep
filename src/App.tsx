import React from 'react';
import { useMatchStore } from './hooks/useMatchStore';
import { TeamModalProvider } from './contexts/TeamModalContext';
import { UIProvider } from './contexts/UIContext';
import { AppRouter } from './router/AppRouter';

function App() {
  const {
    matches,
    upcomingMatches,
    selectedMatchId,
    setSelectedMatchId,
    liveData,
    lastStats,
    groupedByMarket,
    getMarketProbabilities,
    getMatchBadge,
    topPicks,
    groupedByDay,
    dayLabels,
    teamForms,
    syncMatchDetail,
    triggerImmediateSync,
    v2Predictions,
    enrichedData,
    frozenPredictions
  } = useMatchStore();

  return (
    <AppRouter
      matches={matches}
      upcomingMatches={upcomingMatches || []}
      selectedMatchId={selectedMatchId}
      setSelectedMatchId={setSelectedMatchId}
      liveData={liveData}
      lastStats={lastStats}
      groupedByMarket={groupedByMarket}
      getMarketProbabilities={getMarketProbabilities}
      getMatchBadge={getMatchBadge}
      topPicks={topPicks || []}
      groupedByDay={groupedByDay}
      dayLabels={dayLabels}
      teamForms={teamForms}
      syncMatchDetail={syncMatchDetail}
      triggerImmediateSync={triggerImmediateSync}
      v2Predictions={v2Predictions || []}
      enrichedData={enrichedData || {}}
      frozenPredictions={frozenPredictions || {}}
    />
  );
}

export default function AppWrapper() {
  return (
    <TeamModalProvider>
      <UIProvider>
        <App />
      </UIProvider>
    </TeamModalProvider>
  );
}
