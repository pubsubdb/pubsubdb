import { StoreService } from "../services/store";
import { AppSubscriptions, AppTransitions, AppVID } from "../typedefs/app";
import { RedisClient, RedisMulti } from "../typedefs/redis";

export function getGuid() {
  //prefer guids with a GMT time aspect
  const randomTenDigitNumber = Math.floor(Math.random() * 1e10);
  return `${Date.now().toString(16)}.${randomTenDigitNumber.toString(16)}`;
}

export async function sleepFor(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
export function getTimeSeriesStamp(granularity: string): string {
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