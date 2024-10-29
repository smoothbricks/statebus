import { atom } from '@tldraw/state';
import type {
  AnyEventReducer,
  AnyEventType,
  AnyTopicReducerMap,
  Event,
  EventTypes,
  StateBusReader,
  TopLevelReducer,
  Topics,
} from './types';
import type {
  AnyEvent,
  AnyTopicListenerMap,
  AnyTopicReducer,
  Atom,
  Substates as ISubstates,
  InitialState,
  Listener,
  ReadonlyState,
  StateBusConfig,
  StateKeys,
  TopicListenerMap,
  WritableState,
} from './types';

class Substates<T> implements ISubstates<T> {
  private readonly _byID = new Map<string | number, Atom<T | undefined>>();

  constructor(readonly defaultValue: () => T | undefined) {}

  get(id: string | number) {
    let substate = this._byID.get(id);
    if (!substate) {
      const value = this.defaultValue();
      substate = atom(`${id}`, value); // new Substate(value);
      this._byID.set(id, substate);
    }
    return substate;
  }

  remove(id: string | number): boolean {
    const existing = this._byID.get(id);
    if (existing) {
      // notify watchers that the substate is gone
      existing.set(undefined);
      return this._byID.delete(id);
    }
    return false;
  }

  [Symbol.iterator]() {
    // Return an iterator that filters undefined values
    const iter = this._byID.values();
    const filtered = {
      next: (): IteratorResult<T> => {
        const result = iter.next();
        return result.value?.value !== undefined ? { value: result.value.value, done: false } : filtered.next();
      },
    };
    return filtered;
  }
}

export class StateBus implements StateBusReader {
  readonly isolates: Record<string, ReadonlyState> = {};
  readonly reduceEvent: TopLevelReducer;
  readonly state: ReadonlyState;
  readonly substateInterestCount = new Map<string, number>();
  private initialState: InitialState;

  constructor(config: StateBusConfig) {
    const { initialState, reducers, autoDispatch = true } = config;
    this.initialState = Object.freeze(initialState);

    if (typeof reducers === 'function') {
      this.reduceEvent = reducers;
    } else {
      // Build an object of per-topic reducer functions
      const topicMap: AnyTopicReducerMap = {};
      for (const [topicString, reducer] of Object.entries(reducers)) {
        const topic = topicString as Topics;
        if (typeof reducer === 'function') {
          topicMap[topic] = reducer as AnyTopicReducer;
        } else {
          const reducerMap = Object.freeze(reducer) as Record<AnyEventType, AnyEventReducer>;
          // Create a function that dispatches on event type
          topicMap[topic] = (state, event) => reducerMap[event.type]?.(state, event.payload);
        }
      }
      Object.freeze(topicMap);
      // Build a single reducer function that dispatches on topic and type
      this.reduceEvent = (state, event) => topicMap[event.topic]?.(state, event);
    }

    // Build the state object of Atoms and Substates
    const s = Object.fromEntries(
      Object.entries(this.initialState).map(([key, value]) => [
        key,
        (value as unknown) instanceof Function ? new Substates(value as unknown as () => void) : atom(`${key}`, value),
      ]),
    );
    this.state = Object.freeze(s) as unknown as ReadonlyState;

    // When nextFrameId is 0, requestAnimationFrame is scheduled on the next publish()
    this.nextFrameId = autoDispatch ? 0 : -1;
  }

  private eventQueue: AnyEvent[] = [];
  private dispatchingEventQueue: AnyEvent[] = [];
  private listeners: AnyTopicListenerMap = {};

  dispatchEvents() {
    let substateInterestEvent: undefined | Event<'statebus', 'substateInterest'>;
    while (this.eventQueue.length > 0) {
      const eventQueue = this.eventQueue;
      // Set an empty queue in case publish is called while dispatching
      // Swap eventQueue and dispatchingEventQueue every dispatch to lower GC pressure
      this.eventQueue = this.dispatchingEventQueue;
      this.dispatchingEventQueue = eventQueue;

      // Reduce all events first, to make sure all state is up to date
      const writableState = this.state as WritableState;
      for (const event of eventQueue) {
        if (!event) continue;
        this.reduceEvent(writableState, event);
      }

      // Dispatch events to listeners, that may read updated state
      for (const event of eventQueue) {
        if (!event) {
          continue;
        }
        if (!(event.topic === 'statebus' && event.type === 'substateInterest')) {
          this.dispatchEvent(event);
        } else if (event.type === 'substateInterest') {
          if (substateInterestEvent) Object.assign(substateInterestEvent.payload, event.payload);
          else substateInterestEvent = event;
        }
      }
      // Finally dispatch the merged 'substateInterest' event
      if (substateInterestEvent) {
        this.dispatchEvent(substateInterestEvent);
      }
      // Clear the dispatching queue
      eventQueue.length = 0;
    }
  }

  dispatchEvent(event: AnyEvent) {
    const listeners = this.listeners[event.topic]?.[event.type];

    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event, this);
        } catch (error) {
          console.error('Error in listener while handling:', event, error);
          this.publish({
            topic: 'statebus',
            type: 'error',
            payload: error instanceof Error ? error : new Error(error as string),
          });
        }
      }
    }
  }

  private nextFrameId: number;

  publish(event: AnyEvent) {
    if (this.nextFrameId === 0) {
      this.nextFrameId = requestAnimationFrame((time) => {
        // console.trace('Dispatching events post-render', time);
        this.dispatchEvents();
        this.nextFrameId = 0;
      });
    }
    return this.eventQueue.push(event);
  }

  subscribe<Topic extends Topics, Type extends EventTypes<Topic>>(
    topic: Topic,
    type: Type,
    listener: Listener<Topic, Type>,
  ): () => void {
    let topicListeners = (this.listeners as TopicListenerMap<Topic, Type>)[topic];
    if (!topicListeners) this.listeners[topic] = topicListeners = {};

    const typeListeners = topicListeners[type];
    if (!typeListeners) {
      topicListeners[type] = new Set([listener]);
    } else {
      typeListeners.add(listener);
    }
    // Return a function to unsubscribe
    return () => typeListeners?.delete(listener);
  }

  substateInterest<SK extends StateKeys>(keys: SK[]): () => void {
    if (keys.length === 0) return () => {};

    const subscribers = {} as Record<SK, number>;
    for (const key of keys) {
      const count = (this.substateInterestCount.get(key) ?? 0) + 1;
      subscribers[key] = count;
      this.substateInterestCount.set(key, count);
    }

    // Let data-providers know there is interest in these topics
    this.publish({ topic: 'statebus', type: 'substateInterest', payload: { subscribers } });

    return () => {
      const subscribers = {} as Record<SK, number>;
      for (const key of keys) {
        const count = (this.substateInterestCount.get(key) ?? 1) - 1;
        if (count > 0) this.substateInterestCount.set(key, count);
        else this.substateInterestCount.delete(key);
      }
      this.publish({ topic: 'statebus', type: 'substateInterest', payload: { subscribers } });
    };
  }
}
