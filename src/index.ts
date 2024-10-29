export type { Atom, Computed } from '@tldraw/state';
export type { track, useStateTracking } from '@tldraw/state-react';

import type { StateKeys } from './types';

declare const _byID_: unique symbol;

declare module '@smoothbricks/statebus' {
  export interface States {
    // User defined mapping of state-key to state-value type (primitive or object shape)
  }

  /**
   * ByID is a marker type that indicates that every Substate should be indexed by an id.
   */
  export type ByID<T> = T & { readonly [_byID_]: null };

  export interface Events {
    // Topics
    statebus: {
      // Event types
      substateInterest: { subscribers: Partial<Record<StateKeys, number>> };
      error: Error;
      dispatchCompleted: { reducers: number; listeners: number };
    };
  }
}

export type { Event, Listener, ReadonlyState, StateBusConfig } from './types';

export { StateBus } from './api';

export { computedHook, StatebusProvider, useBus, useStateBus, useSubstate } from './react';
