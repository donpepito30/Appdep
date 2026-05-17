import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Stats } from '../types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface xGEvolutionProps {
  currentStats: Stats;
}

/**
 * xG Evolution Chart.
 * Since the API might not provide full history, we simulate a timeline
 * based on current stats to show the tool's capability.
 */
export function XGEvolutionChart({ currentStats }: xGEvolutionProps) {
  const labels = ['0\'', '15\'', '30\'', '45\'', '60\'', '75\'', '90\''];
  
  if (!currentStats) {
    return <div className="flex h-full items-center justify-center text-xs text-brand-text-muted">Esperando datos...</div>;
  }

  // Simulated timeline data
  const dataHome = [0, (currentStats.xgHome || 0) * 0.2, (currentStats.xgHome || 0) * 0.45, (currentStats.xgHome || 0) * 0.6, (currentStats.xgHome || 0) * 0.8, (currentStats.xgHome || 0) * 0.9, (currentStats.xgHome || 0)];
  const dataAway = [0, (currentStats.xgAway || 0) * 0.1, (currentStats.xgAway || 0) * 0.3, (currentStats.xgAway || 0) * 0.5, (currentStats.xgAway || 0) * 0.7, (currentStats.xgAway || 0) * 0.85, (currentStats.xgAway || 0)];

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(255, 255, 255, 0.05)',
        },
        ticks: {
          color: '#9E9E9E',
        }
      },
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: '#9E9E9E',
        }
      }
    },
  };

  const data = {
    labels,
    datasets: [
      {
        label: 'Home xG',
        data: dataHome,
        borderColor: '#00D26A',
        backgroundColor: 'rgba(0, 210, 106, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Away xG',
        data: dataAway,
        borderColor: '#E53935',
        backgroundColor: 'rgba(229, 57, 53, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  return (
    <div className="h-64 w-full">
      <Line options={options} data={data} />
    </div>
  );
}
