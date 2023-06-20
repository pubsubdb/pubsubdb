import { StoreService } from "../services/store";
import { AppSubscriptions, AppTransitions, AppVID } from "../typedefs/app";
import { RedisClient, RedisMulti } from "../typedefs/redis";
import { FlatObject, MultiDimensionalDocument } from "../typedefs/serializer";

export function getGuid() {
  const randomTenDigitNumber = Math.floor(Math.random() * 1e10);
  return `${Date.now().toString(16)}.${randomTenDigitNumber.toString(16)}`;
}

export async function sleepFor(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function XSleepFor(ms: number): { promise: Promise<unknown>, timerId: NodeJS.Timeout } {
  //can be interrupted with `clearTimeout`
  let timerId: NodeJS.Timeout;
  let promise = new Promise((resolve) => {
    timerId = setTimeout(resolve, ms);
  });
  return { promise, timerId };
}

export function findTopKey(obj: AppTransitions, input: string): string | null {
  for (const [key, value] of Object.entries(obj)) {
    if (value.hasOwnProperty(input)) {
      const parentKey = findTopKey(obj, key.replace(/^\./, ''));
      return (parentKey || key).replace(/^\./, '');
    }
  }
  return null;
}

export function findSubscriptionForTrigger(obj: AppSubscriptions, value: string): string | null {
  for (const [key, itemValue] of Object.entries(obj)) {
    if (itemValue === value) {
      return key;
    }
  }
  return null;
}

/**
 * Get the subscription topic for the flow to which @activityId belongs.
 * TODO: resolve this value in the compiler...do not call this at runtime
 */
export async function getSubscriptionTopic(activityId: string, store: StoreService<RedisClient, RedisMulti>, appVID: AppVID): Promise<string | undefined> {
  const appTransitions = await store.getTransitions(appVID);
  const appSubscriptions = await store.getSubscriptions(appVID);
  const triggerId = findTopKey(appTransitions, activityId);
  const topic = findSubscriptionForTrigger(appSubscriptions, triggerId);
  return topic;
}

/**
 * returns the 12-digit format of the iso timestamp (e.g, 202101010000)
 */
export function getTimeSeries(granularity: string): string {
  const now = new Date();
  const granularityUnit = granularity.slice(-1);
  const granularityValue = parseInt(granularity.slice(0, -1), 10);
  if (granularityUnit === 'm') {
    const minute = Math.floor(now.getMinutes() / granularityValue) * granularityValue;
    now.setUTCMinutes(minute, 0, 0);
  } else if (granularityUnit === 'h') {
    now.setUTCMinutes(0, 0, 0);
  }
  return now.toISOString().replace(/:\d\d\..+|-|T/g, '').replace(':','');
}

export function numberToSequence(number: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const base = alphabet.length;
  if (number < 0 || number >= Math.pow(base, 3)) {
    throw new Error('Number out of range');
  }
  let [q1, r1] = divmod(number, base);
  let [q2, r2] = divmod(q1, base);
  return alphabet[q2] + alphabet[r1] + alphabet[r2];
}

function divmod(m: number, n: number): number[] {
  return [Math.floor(m / n), m % n];
}

export function getIndexedHash<T>(hash: T, target: string): [number, T] {
  const index = hash[target] as number || 0;
  const newHash = { ...hash };
  delete newHash[target];
  return [index, newHash as T];
}

export function getValueByPath(obj: { [key: string]: any }, path: string): any {
  const pathParts = path.split('/');
  let currentValue = obj;
  for (const part of pathParts) {
    if (currentValue[part] !== undefined) {
      currentValue = currentValue[part];
    } else {
      return undefined;
    }
  }
  return currentValue;
}

export function restoreHierarchy(obj: MultiDimensionalDocument): MultiDimensionalDocument {
  //TODO: input document is additive (journaled)
  //      sort/process keys in reverse order and then resolve
  //      clobber existing values with more-deeply nested values
  const result: MultiDimensionalDocument = {};
  for (const key in obj) {
    const keys = key.split('/');
    let current = result;
    for (let i = 0; i < keys.length; i++) {
      if (i === keys.length - 1) {
        current[keys[i]] = obj[key];
      } else {
        current[keys[i]] = current[keys[i]] || {};
        current = current[keys[i]];
      }
    }
  }
  return result;
}
