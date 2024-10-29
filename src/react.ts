import type { StateBus } from '@smoothbricks/statebus';
import { type Signal, isSignal } from '@tldraw/state';
import { useValue } from '@tldraw/state-react';
import React, { useContext, useEffect, useMemo } from 'react';

import type { EventPayload, EventTypes, StateByIDKey, StateKeys, StatePropKey, StateValue, Topics } from './types';
import { type ViewFunction, type ViewProps, computed, sortedKeyValuePairs } from './view';

const StatebusReactContext = React.createContext<StateBus>({} as unknown as StateBus);
export const StatebusProvider = StatebusReactContext.Provider;
export const useStateBus = () => useContext(StatebusReactContext);

function useBusSignal<T, SK extends StateKeys>(
  bus: StateBus,
  viewId: string,
  signal: Signal<T, unknown>,
  latestDataInterest: SK[],
): T {
  /*---
  // Awaiting answer why `useState` shouldn't work: https://github.com/tldraw/signia/issues/88
  const [state, setState] = useState(signal.get());
  
  useEffect(() => {
    const decrement = latestDataInterest ? bus.substateInterest(latestDataInterest) : undefined;
    const unreact = react(viewId, () => setState(signal.get()));
    return () => {
      unreact();
      decrement?.();
    };
  }, [bus, ...latestDataInterest]);
  //---*/

  const value = useValue(signal);
  // biome-ignore lint/correctness/useExhaustiveDependencies:
  useEffect(
    () => (latestDataInterest ? bus.substateInterest(latestDataInterest) : undefined),
    [bus, ...latestDataInterest],
  );

  return value;
}

export function computedHook<SK extends StateKeys, Props extends ViewProps, R>(
  viewId: string,
  hook: ViewFunction<SK, Props, R>,
  latestDataInterest?: SK[],
): (props: Props) => R {
  return (props) => {
    const bus = useStateBus();
    // biome-ignore lint/correctness/useExhaustiveDependencies:
    const signal = useMemo(
      () => computed(bus, viewId, hook, props),
      !props || typeof props !== 'object' ? [props, bus] : [bus as unknown].concat(...sortedKeyValuePairs(props)),
    );
    return useBusSignal(bus, viewId, signal, latestDataInterest ?? []);
  };
}

export function useSubstate<SK extends StateKeys>(key: StatePropKey<SK>): StateValue<SK>;
export function useSubstate<SK extends StateKeys>(key: StateByIDKey<SK>, id: string | number): StateValue<SK>;
export function useSubstate<SK extends StateKeys>(key: SK, id?: string | number): StateValue<SK> {
  const bus = useStateBus();
  const sub = bus.state[key];
  // biome-ignore lint/style/noNonNullAssertion:
  const signal = (isSignal(sub) ? sub : sub.get(id!)) as Signal<StateValue<SK>>;
  return useBusSignal(bus, key, signal, [key]);
}

interface EventTypePublisher<
  Topic extends Topics,
  Type extends EventTypes<Topic>,
  Body extends EventPayload<Topic, Type>,
> {
  // biome-ignore lint/style/useShorthandFunctionType lint/suspicious/noConfusingVoidType:
  (body: Body extends undefined ? void : Body): void;
}

type EventTopicPublisher<Topic extends Topics> = {
  readonly [Type in EventTypes<Topic>]: EventTypePublisher<Topic, Type, EventPayload<Topic, Type>>;
};

type EventBusPublisher = {
  readonly [Topic in Exclude<Topics, 'statebus'>]: EventTopicPublisher<Topic>;
};

export function eventPublisher<Topic extends Topics>(bus: StateBus, topic: Topic) {
  return new Proxy(
    {},
    {
      get: (target, prop) => {
        // biome-ignore lint/suspicious/noExplicitAny:
        if (typeof prop === 'symbol') return (target as any)[prop];
        // biome-ignore lint/suspicious/noExplicitAny:
        return (payload: any) => bus.publish({ topic, type: prop as EventTypes, payload });
      },
    },
  );
}

export function useBus(): EventBusPublisher;
export function useBus<Topic extends Exclude<Topics, 'statebus'>>(topic: Topic): EventTopicPublisher<Topic>;
export function useBus(topic?: Topics) {
  const bus = useStateBus();
  return topic
    ? eventPublisher(bus, topic)
    : new Proxy(
        {},
        {
          get: (target, prop) => {
            // biome-ignore lint/suspicious/noExplicitAny:
            if (typeof prop === 'symbol') return (target as any)[prop];
            return eventPublisher(bus, prop as Topics);
          },
        },
      );
}
