import React, { useContext, useEffect, useMemo, useState } from 'react';
import { type Signal, isSignal, react } from 'signia';

import type {
  EventPayload,
  EventTypes,
  StateBus,
  StateByIDKey,
  StateKeys,
  StatePropKey,
  StateValue,
  Topics,
} from './types';
import { type ViewFunction, type ViewProps, computed } from './view';

const StatebusReactContext = React.createContext<StateBus>({} as any);
export const StatebusProvider = StatebusReactContext.Provider;
export const useStateBus = () => useContext(StatebusReactContext);

export const useSignal = <S extends Signal<any, any>>(name: string, signal: S) => {
  const [state, setState] = useState(signal.value);
  useEffect(() => react(name, () => setState(signal.value)), []);
  return state;
};

function useBusSignal<T, SK extends StateKeys>(
  bus: StateBus,
  viewId: string,
  signal: Signal<T, any>,
  latestDataInterest: SK[],
): T {
  const [state, setState] = useState(signal.value);

  useEffect(() => {
    const decrement = latestDataInterest ? bus.substateInterest(latestDataInterest) : undefined;
    const unreact = react(viewId, () => setState(signal.value));
    return () => {
      unreact();
      decrement?.();
    };
  }, [bus, ...latestDataInterest]);

  return state;
}

export function Computed<SK extends StateKeys, Props extends ViewProps, R>(
  viewId: string,
  hook: ViewFunction<SK, Props, R>,
  latestDataInterest?: SK[],
): (props: Props) => R {
  return (props) => {
    const bus = useStateBus();
    const signal = useMemo(
      () => computed(bus, viewId, hook, props),
      !props || typeof props !== 'object' ? [props, bus] : [...Object.values(props), bus, Object.keys(props)],
    );
    return useBusSignal(bus, viewId, signal, latestDataInterest ?? []);
  };
}

export function useSubstate<SK extends StateKeys>(key: StatePropKey<SK>): StateValue<SK>;
export function useSubstate<SK extends StateKeys>(key: StateByIDKey<SK>, id: string | number): StateValue<SK>;
export function useSubstate<SK extends StateKeys>(key: SK, id?: string | number): StateValue<SK> {
  const bus = useStateBus();
  const sub = bus.state[key];
  const signal = (isSignal(sub) ? sub : sub.get(id!)) as Signal<StateValue<SK>>;
  return useBusSignal(bus, key, signal, [key]);
}

type EventTypePublisher<
  Topic extends Topics,
  Type extends EventTypes<Topic>,
  Body extends EventPayload<Topic, Type>,
> = (body: Body extends undefined ? void : Body) => void;

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
        if (typeof prop === 'symbol') return (target as any)[prop];
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
            if (typeof prop === 'symbol') return (target as any)[prop];
            return eventPublisher(bus, prop as Topics);
          },
        },
      );
}
