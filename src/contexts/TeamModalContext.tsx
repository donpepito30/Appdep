import React, { createContext, useContext, useState } from 'react';

interface TeamModalContextType {
  openTeamModal: (team: any) => void;
  closeTeamModal: () => void;
  selectedTeam: any | null;
}

const TeamModalContext = createContext<TeamModalContextType>({
  openTeamModal: () => {},
  closeTeamModal: () => {},
  selectedTeam: null,
});

export const useTeamModal = () => useContext(TeamModalContext);

export const TeamModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedTeam, setSelectedTeam] = useState<any | null>(null);

  const openTeamModal = (team: any) => {
    setSelectedTeam(team);
  };

  const closeTeamModal = () => {
    setSelectedTeam(null);
  };

  return (
    <TeamModalContext.Provider value={{ openTeamModal, closeTeamModal, selectedTeam }}>
      {children}
    </TeamModalContext.Provider>
  );
};
