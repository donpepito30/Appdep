import React, { createContext, useContext, useState } from 'react';
import { Event } from '../types';
import { useTeamModal } from './TeamModalContext';

export type ActiveTabType = 'live' | 'upcoming' | 'predictions' | 'surebets' | 'tvguide' | 'market' | 'competition';

interface UIContextType {
  selectedMatchId: string | null;
  setSelectedMatchId: (id: string | null) => void;
  activeTab: ActiveTabType;
  setActiveTab: (tab: ActiveTabType) => void;
  openModal: (type: string, props?: any) => void;
  closeModal: (type?: string) => void;
  openTeamModal: (team: any) => void;
  openPlayerModal: (playerId: string) => void;
  
  // States of modals for convenience
  globalPlayerId: string | null;
  analysisMatch: Event | null;
  showDiagnostic: boolean;
  bettingHubOpen: boolean;
  setShowDiagnostic: (show: boolean) => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
};

interface UIProviderProps {
  children: React.ReactNode;
}

export const UIProvider: React.FC<UIProviderProps> = ({ children }) => {
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTabType>('live');
  const [globalPlayerId, setGlobalPlayerId] = useState<string | null>(null);
  const [analysisMatch, setAnalysisMatch] = useState<Event | null>(null);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [bettingHubOpen, setBettingHubOpen] = useState(false);

  // Consume existing TeamModalContext if available
  const teamModal = useTeamModal();

  const openModal = (type: string, props?: any) => {
    const normType = type.toLowerCase();
    if (normType.includes('player')) {
      setGlobalPlayerId(props?.playerId || props?.id || null);
    } else if (normType.includes('analysis') || normType.includes('match')) {
      setAnalysisMatch(props?.match || props?.event || null);
    } else if (normType.includes('team')) {
      teamModal.openTeamModal(props?.team || props || null);
    } else if (normType.includes('diagnostic')) {
      setShowDiagnostic(true);
    } else if (normType.includes('betting')) {
      setBettingHubOpen(true);
    }
  };

  const closeModal = (type?: string) => {
    if (!type) {
      setGlobalPlayerId(null);
      setAnalysisMatch(null);
      setShowDiagnostic(false);
      setBettingHubOpen(false);
      teamModal.closeTeamModal();
      return;
    }

    const normType = type.toLowerCase();
    if (normType.includes('player')) {
      setGlobalPlayerId(null);
    } else if (normType.includes('analysis') || normType.includes('match')) {
      setAnalysisMatch(null);
    } else if (normType.includes('team')) {
      teamModal.closeTeamModal();
    } else if (normType.includes('diagnostic')) {
      setShowDiagnostic(false);
    } else if (normType.includes('betting')) {
      setBettingHubOpen(false);
    }
  };

  const openTeamModal = (team: any) => {
    teamModal.openTeamModal(team);
  };

  const openPlayerModal = (playerId: string) => {
    setGlobalPlayerId(playerId);
  };

  return (
    <UIContext.Provider
      value={{
        selectedMatchId,
        setSelectedMatchId,
        activeTab,
        setActiveTab,
        openModal,
        closeModal,
        openTeamModal,
        openPlayerModal,
        globalPlayerId,
        analysisMatch,
        showDiagnostic,
        bettingHubOpen,
        setShowDiagnostic,
      }}
    >
      {children}
    </UIContext.Provider>
  );
};
