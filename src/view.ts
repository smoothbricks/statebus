import { computed as computedSignal } from '@tldraw/state';

import type { ReadonlyState, StateBusReader, StateKeys } from './types';

export type ViewPrimitiveProp = undefined | null | string | number;

export type ViewProps = never | ViewPrimitiveProp | Record<string, ViewPrimitiveProp>;
export type ViewFunction<SK extends StateKeys, Props extends ViewProps, R> = (
  states: Pick<ReadonlyState, SK>,
  props: Props,
) => R;

export function sortedKeyValuePairs(props: Record<string, ViewPrimitiveProp>): [string, ViewPrimitiveProp][] {
  return Object.entries(props).sort(([k1], [k2]) => k1.localeCompare(k2));
}

export function computedPropsString(props: ViewProps): string {
  if (props === undefined || props === null) {
    return '';
  }
  if (typeof props === 'string' || typeof props === 'number') {
    return props.toString();
  }
  return sortedKeyValuePairs(props)
    .map(([k, v]) => `${k}=${v?.toString()}`)
    .join(',');
}

export function computed<SK extends StateKeys, Props extends ViewProps, R>(
  statebus: StateBusReader,
  viewId: string,
  hook: ViewFunction<SK, Props, R>,
  props: Props,
) {
  // Make a unique name for the computed signal based on the viewId and props
  const name = `${viewId}${props ? `:${computedPropsString(props)}` : ''}`;
  return computedSignal(name, () => hook(statebus.state, props));
}
