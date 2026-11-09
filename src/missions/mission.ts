import { createContext, useContext } from 'react';
import type { Mission, MissionResult } from '../content/types';

/** Every mission component takes the same props. onFinish carries the score and the mistakes for the debrief. */
export interface MissionProps<M extends Mission = Mission> {
  mission: M;
  onFinish: (result: MissionResult) => void;
}

// Hint state, provided by the mission route. A mission reads `active` to reveal
// its help, and calls `use()` (which spends XP once) to turn it on.
export interface HintState {
  active: boolean;
  use: () => void;
  available: boolean;
}

export const HintContext = createContext<HintState>({ active: false, use: () => {}, available: false });

export function useHint(): HintState {
  return useContext(HintContext);
}
