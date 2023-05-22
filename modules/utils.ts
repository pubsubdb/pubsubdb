import { StoreService } from "../services/store";
import { AppSubscriptions, AppTransitions, AppVersion } from "../typedefs/app";
import { RedisClient, RedisMulti } from "../typedefs/store";

export function getGuid() {
  return Math.floor(Math.random() * 100000000).toString();
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
export async function getSubscriptionTopic(activityId: string, store: StoreService<RedisClient, RedisMulti>, config: AppVersion): Promise<string | undefined> {
  const appTransitions = await store.getTransitions(config);
  const appSubscriptions = await store.getSubscriptions(config);
  const triggerId = findTopKey(appTransitions, activityId);
  const topic = findSubscriptionForTrigger(appSubscriptions, triggerId);
  return topic;
}
