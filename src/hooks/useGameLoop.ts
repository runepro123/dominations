// Periodic game tick hook. Runs on its own interval, decoupled from rAF.

import { useEffect } from 'react';
import { applyTick, useGame } from '../game/store';
import { AI, ECONOMY } from '../game/constants';

export function useGameLoop() {
  const phase = useGame((s) => s.phase);
  useEffect(() => {
    if (phase !== 'playing') return;
    const interval = setInterval(() => {
      applyTick();
    }, ECONOMY.tickSeconds * 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // Slow year counter tick to make the timeline feel alive while idle.
  useEffect(() => {
    if (phase !== 'playing') return;
    const interval = setInterval(() => {
      useGame.setState((s) => ({ year: s.year + 0 }));
    }, AI.decisionSeconds * 1000 * 2);
    return () => clearInterval(interval);
  }, [phase]);
}
