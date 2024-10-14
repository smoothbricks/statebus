import { computed as computedSignal } from 'signia';

import type { ReadonlyState, StateBus, StateKeys } from './types';

export type ViewProps = never | undefined | null | string | number | Record<string, string | number | boolean | null>;
export type ViewFunction<SK extends StateKeys, Props extends ViewProps, R> = (
  states: Pick<ReadonlyState, SK>,
  props: Props,
) => R;

export function computed<SK extends StateKeys, Props extends ViewProps, R>(
  statebus: StateBus,
  viewId: string,
  hook: ViewFunction<SK, Props, R>,
  props: Props,
) {
  // Make a unique name for the computed signal based on the viewId and props
  let params: string;
  if (props) {
    params = ':';
    if (typeof props === 'string' || typeof props === 'number') {
      params += props;
    } else {
      params += Object.entries(props)
        .map(([k, v]) => `${k}=${v?.toString()}`)
        .join(',');
    }
  } else {
    params = '';
  }
  return computedSignal(`${viewId}${params}`, () => hook(statebus.state, props));
}
