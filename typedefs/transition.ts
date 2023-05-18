import { Pipe } from "./pipe";

//Match type: { expected: false, actual: '{a2.output.data.approved}' }
export type Match = {
  expected: boolean|string|number|null;
  actual: boolean|string|number|null|{ '@pipe': Pipe };
}

export type TransitionRule = {
  gate?: 'and'|'or'; //and is default
  match: Array<Match>;
}

//this is format for how all transitions for a single app are returned from the datastore
export type Transitions = { 
  [key: string]: {
    [key: string]: TransitionRule
  }
}
