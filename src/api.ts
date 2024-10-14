import { atom } from 'signia';
import type {
  Atom,
  Event,
  EventReducers,
  EventTypes,
  StateBus as IStateBus,
  Substates as ISubstates,
  InitialState,
  Listener,
  ReadonlyState,
  Reducer,
  StateBusConfig,
  StateKeys,
  Topics,
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

export class StateBus implements IStateBus {
  readonly isolates: Record<string, ReadonlyState> = {};
  readonly state: ReadonlyState;
  readonly substateInterestCount = new Map<string, number>();
  private initialState: InitialState;
  private reducers: EventReducers;

  constructor(config: StateBusConfig) {
    const { initialState, reducers, autoDispatch = true } = config;
    this.initialState = initialState;
    this.reducers = reducers;
    // When nextFrameId is 0, requestAnimationFrame is scheduled on the next publish()
    this.nextFrameId = autoDispatch ? 0 : -1;

    const s = Object.fromEntries(
      Object.entries(this.initialState).map(([key, value]) => [
        key,
        value instanceof Function ? new Substates(value as any) : atom(`${key}`, value),
      ]),
    );
    this.state = Object.freeze(s) as unknown as ReadonlyState;
  }

  private eventQueue: Event[] = [];
  private dispatchingEventQueue: Event[] = [];
  private listeners: { [Topic in Topics]?: { [Type in EventTypes<Topic>]?: Set<Listener<Topic, Type>> } } = {};

  dispatchEvents() {
    let substateInterestEvent: undefined | Event<'statebus', 'substateInterest'>;
    while (this.eventQueue.length > 0) {
      const eventQueue = this.eventQueue;
      // Set an empty queue in case publish is called while dispatching
      // Swap eventQueue and dispatchingEventQueue every dispatch to lower GC pressure
      this.eventQueue = this.dispatchingEventQueue;
      this.dispatchingEventQueue = eventQueue;

      // Reduce all events first, to make sure all state is up to date
      for (const event of eventQueue) {
        if (!event) continue;
        this.reduceEvent(event);
      }

      // Dispatch events to listeners, that may read updated state
      for (const event of eventQueue) {
        if (!event) {
          continue;
        }
        if (!(event.topic === 'statebus' && event.type === 'substateInterest')) {
          this.dispatchEvent(event);
        } else {
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

  reduceEvent(event: Event) {
    const reducer = this.reducers[event.topic]?.[event.type] as
      | Reducer<typeof event.topic, typeof event.type>
      | undefined;

    if (reducer) reducer(this.state as unknown as WritableState, event);
  }

  dispatchEvent(event: Event) {
    const listeners = this.listeners[event.topic]?.[event.type] as
      | Set<Listener<typeof event.topic, typeof event.type>>
      | undefined;

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

  publish(event: Event) {
    if (this.nextFrameId === 0) {
      this.nextFrameId = requestAnimationFrame((time) => {
        console.trace('Dispatching events post-render', time);
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
    let topicListeners = this.listeners[topic];
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

    const subscribers: Record<SK, number> = {} as any;
    for (const key of keys) {
      const count = (this.substateInterestCount.get(key) ?? 0) + 1;
      subscribers[key] = count;
      this.substateInterestCount.set(key, count);
    }

    // Let data-providers know there is interest in these topics
    this.publish({ topic: 'statebus', type: 'substateInterest', payload: { subscribers } });

    return () => {
      const subscribers: Record<SK, number> = {} as any;
      for (const key of keys) {
        const count = (this.substateInterestCount.get(key) ?? 1) - 1;
        if (count > 0) this.substateInterestCount.set(key, count);
        else this.substateInterestCount.delete(key);
      }
      this.publish({ topic: 'statebus', type: 'substateInterest', payload: { subscribers } });
    };
  }
}
