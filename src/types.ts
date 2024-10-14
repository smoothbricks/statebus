import type { ByID, Events, States } from '@smoothbricks/statebus';
import type { Atom, Signal as Substate } from 'signia';

// #region Events
export type Topics = keyof Events;
export type EventTypes<Topic extends Topics = Topics> = keyof Events[Topic];

export type EventHeader<Topic extends Topics = Topics, Type extends EventTypes<Topic> = EventTypes<Topic>> = {
  topic: Topic;
  type: Type;
  isolate?: string;
};

/**
 * A discriminated union of all application Event types and their payloads
 */
export type Event<Topic extends Topics = Topics, Type extends keyof Events[Topic] = keyof Events[Topic]> = {
  readonly [T in Topic]: {
    readonly [T2 in Type]: EventHeader<T, T2> & { payload: EventPayload<T, T2> };
  }[Type];
}[Topic];

export type EventPayload<Topic extends Topics, Type extends EventTypes<Topic>> = Events[Topic][Type];
// #endregion

// #region Application
export type Reducer<Topic extends Topics = Topics, Type extends EventTypes<Topic> = EventTypes<Topic>> = (
  state: WritableState,
  event: Event<Topic, Type>,
) => void;

export type EventReducers<Topic extends Topics = Topics> = {
  [T in Topic]?: {
    [Type in EventTypes<T>]?: Reducer<T, Type>;
  };
};

export type Listener<Topic extends Topics = Topics, Type extends EventTypes<Topic> = EventTypes<Topic>> = (
  event: Event<Topic, Type>,
  bus: StateBus,
) => void;

export interface StateBusConfig {
  initialState: InitialState;
  reducers: EventReducers;
  autoDispatch?: boolean;
}
// #endregion

// #region Substate
/** A state key is a key of the states object */
export type StateKeys = keyof States;
export type StateValue<BT extends keyof States> = States[BT] extends ByID<infer T> ? T | undefined : States[BT];

export type StatePropKey<SK extends keyof States> = States[SK] extends ByID<infer T> ? never : SK;
export type StateByIDKey<SK extends keyof States> = States[SK] extends ByID<infer T> ? SK : never;

export type { Substate, Atom };

export interface Substates<T> extends Iterable<T> {
  get(id: string | number): Substate<T | undefined>;
}

export interface SubstatesWriter<T> extends Substates<T> {
  get<Diff = unknown>(id: string | number): Atom<T | undefined, Diff>;
  remove(id: string | number): boolean;
}

export type InitialState = {
  [K in keyof States]: States[K] extends ByID<infer T> ? (id: string | number) => T | undefined : States[K];
};

export type ReadonlyState = {
  readonly [K in keyof States]: States[K] extends ByID<infer T> ? Substates<T> : Substate<States[K]>;
};

export type WritableState = {
  readonly [K in keyof States]: States[K] extends ByID<infer T> ? SubstatesWriter<T> : Atom<States[K]>;
};
// #endregion

// #region StateBus
/**
 * StateBus: Event based state management
 * Decoupling Data and State management from UI code
 */
export interface StateBus {
  readonly state: ReadonlyState;
  subscribe<Topic extends Topics, Type extends EventTypes<Topic>>(
    topic: Topic,
    type: Type,
    listener: Listener<Topic, Type>,
  ): () => void;
  publish(event: Event): number;
  substateInterest<SK extends StateKeys>(keys: SK[]): () => void;
  substateInterestCount: ReadonlyMap<string, number>;
}

export interface Publisher<Topic extends Topics> {
  publish(event: Event<Topic>): number;
}

export type StateBusWriter = Omit<StateBus, 'state'> & {
  readonly state: WritableState;
};

// #endregion
