
interface Condition {
  expected: string;
  actual: string;
}

enum Gate {
  AND = 'and',
  OR = 'or',
}

interface HookConditions {
  gate?: Gate;
  match: Condition[];
}

interface HookRule {
  to: string;
  conditions: HookConditions;
}

interface Hooks {
  [eventName: string]: HookRule[];
}

type HookSignal = { topic: string, resolved: string, jobId: string};

interface HookInterface {
  (topic: string, data: { [key: string]: any, id: string }): Promise<void>;
}

export { Condition, Gate, HookConditions, HookRule, HookInterface, Hooks, HookSignal };
