import type { ByID, Events, States } from '@smoothbricks/statebus';
import type { Atom, Signal as Substate } from '@tldraw/state';

// #region Events
export type Topics = keyof Events;

export type EventTypes<Topic extends Topics = Topics> = keyof Events[Topic];

export type EventPayload<Topic extends Topics, Type extends EventTypes<Topic>> = Events[Topic][Type];

export type Event<Topic extends Topics = Topics, Type extends EventTypes<Topic> = EventTypes<Topic>> = {
  topic: Topic;
  type: Type;
  payload: EventPayload<Topic, Type>;
  isolate?: string;
};
// #endregion

// #region Application
export type TopicReducer<T extends Topics = Topics, ET extends EventTypes<T> = EventTypes<T>> = (
  state: WritableState,
  event: Event<T, ET>,
) => void;

export type TopicReducers<Topic extends Topics = Topics> = {
  [T in Topic]?: TopicReducer<T>;
};

export type EventReducer<Topic extends Topics = Topics, Type extends EventTypes<Topic> = EventTypes<Topic>> = (
  state: WritableState,
  event: EventPayload<Topic, Type>,
) => void;

export type TopLevelReducer = (state: WritableState, event: AnyEvent) => void;

export type EventReducers<Topic extends Topics = Topics> =
  | {
      [T in Topic]?:
        | {
            [Type in EventTypes<T>]?: EventReducer<T, Type>;
          }
        | TopicReducer<T>;
    }
  | TopLevelReducer;

export type Listener<Topic extends Topics = Topics, Type extends EventTypes<Topic> = EventTypes> = (
  event: Event<Topic, Type>,
  bus: StateBusReader,
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
export type StateValue<BT extends StateKeys> = States[BT] extends ByID<infer T> ? T | undefined : States[BT];

export type StatePropKey<SK extends StateKeys> = States[SK] extends ByID<infer T> ? never : SK;
export type StateByIDKey<SK extends StateKeys> = States[SK] extends ByID<infer T> ? SK : never;

export type { Substate, Atom };

export interface Substates<T> extends Iterable<T> {
  get(id: string | number): Substate<T | undefined>;
}

export interface SubstatesWriter<T> extends Substates<T> {
  get<Diff = unknown>(id: string | number): Atom<T | undefined, Diff>;
  remove(id: string | number): boolean;
}

export type InitialState = {
  [K in StateKeys]: States[K] extends ByID<infer T> ? (id: string | number) => T | undefined : States[K];
};

export type ReadonlyState = {
  readonly [K in StateKeys]: States[K] extends ByID<infer T> ? Substates<T> : Substate<States[K]>;
};

export type WritableState = {
  readonly [K in StateKeys]: States[K] extends ByID<infer T> ? SubstatesWriter<T> : Atom<States[K]>;
};
// #endregion

// #region StateBus internal types and method argument types
/**
 * A union of all possible Event types, irrespective of topic
 */
export type AnyEventType = { [T in Topics]: keyof Events[T] }[Topics];

/**
 * A discriminated union of all application Event types and their payloads
 */
export type AnyEvent = {
  [Topic in Topics]: {
    [Type in EventTypes<Topic>]: Event<Topic, Type>;
  }[EventTypes<Topic>];
}[Topics];

export type AnyEventReducer = (state: WritableState, payload: AnyEvent['payload']) => void;
export type AnyTopicReducer = (state: WritableState, event: AnyEvent) => void;
export type AnyTopicReducerMap = { [T in Topics]?: AnyTopicReducer };

export type TopicListenerMap<Topic extends Topics, EventType extends EventTypes<Topic>> = {
  [T in Topic]?: { [ET in EventType]?: Set<Listener<Topic, ET>> };
};

export type AnyListener = (event: AnyEvent, bus: StateBusReader) => void;
export type AnyTopicListenerMap = { [T in Topics]?: { [ET in AnyEventType]?: Set<AnyListener> } };
// #endregion

export interface SubstateRepository {
  substateInterest<SK extends StateKeys>(keys: SK[]): () => void;
  substateInterestCount: ReadonlyMap<string, number>;
}

export interface EventBus {
  publish(event: AnyEvent): number;

  subscribe<Topic extends Topics, Type extends EventTypes<Topic>>(
    topic: Topic,
    type: Type,
    listener: Listener<Topic, Type>,
  ): () => void;
}

// #region StateBus
/**
 * StateBus: Event based state management
 * Decoupling Data and State management from UI code
 */
export interface StateBusReader extends EventBus, SubstateRepository {
  readonly state: ReadonlyState;
}

export interface StateBusWriter extends EventBus, SubstateRepository {
  readonly state: WritableState;
}

// #endregion
