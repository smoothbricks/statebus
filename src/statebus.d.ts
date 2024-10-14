declare module '@smoothbricks/statebus' {
  /**
   * ByID is a marker type that indicates that every Substate should be indexed by an id.
   */
  export type ByID<T> = T & { readonly [_byID_]: void };
  declare const _byID_: unique symbol;

  export interface States {
    // User defined mapping of state-key to state-value type (primitive or object shape)
  }

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
