import { describe, expect, it } from 'bun:test';
import { StateBus } from '../src';
import { computed } from '../src/view';

//*
declare module '@smoothbricks/statebus' {
  export interface States {
    counter1: number;
    counter2: number;
  }
  // See test/index.test.ts for the related Events declaration
  export interface CountEvents {
    increment1: number;
    increment2: number;
  }
}
//*/

describe('Computed States', () => {
  it('should properly compute derived state', () => {
    const bus = new StateBus({
      autoDispatch: false,
      initialState: { counter: 0 } as any,
      reducers: {
        count: (state, event) => {
          state.counter.update((v) => v + event.payload);
        },
      },
    });

    const doubledCounter = computed(bus, 'doubledCounter', () => bus.state.counter.get() * 2, undefined);

    expect(doubledCounter.get()).toBe(0);

    bus.publish({ topic: 'count', type: 'increment', payload: 5 });
    bus.dispatchEvents();

    expect(doubledCounter.get()).toBe(10);
  });

  it('should update computed values when dependencies change', () => {
    const bus = new StateBus({
      autoDispatch: false,
      initialState: { counter1: 0, counter2: 0 } as any,
      reducers: (state, event) => {
        switch (event.type) {
          case 'increment1':
            state.counter1.update((v) => v + event.payload);
            break;
          case 'increment2':
            state.counter2.update((v) => v + event.payload);
            break;
        }
      },
    });

    const sum = computed(bus, 'sum', () => bus.state.counter1.get() + bus.state.counter2.get(), undefined);

    expect(sum.get()).toBe(0);

    bus.publish({ topic: 'count', type: 'increment1', payload: 3 });
    bus.publish({ topic: 'count', type: 'increment2', payload: 2 });
    bus.dispatchEvents();

    expect(sum.get()).toBe(5);
  });
});
