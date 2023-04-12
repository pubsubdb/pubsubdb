import { Pipe } from "../pipe";
import { JobContext } from "../../typedefs/job";
import { Pipe as PipeType } from "../../typedefs/pipe";

type RuleType = null | undefined | boolean | string | number | Date | Record<string, any>;

class MapperService {
  private rules: Record<string, unknown>;
  private data: JobContext;

  constructor(rules: Record<string, unknown>, data: JobContext) {
    this.rules = rules;
    this.data = data;
  }

  public mapRules(): Record<string, unknown> {
    return this.traverseRules(this.rules);
  }

  private traverseRules(rules: RuleType): Record<string, unknown> {
    if (typeof rules === 'object' && '@pipe' in rules) {
      return this.pipe(rules['@pipe'] as PipeType);
    } if (typeof rules === 'object' && rules !== null) {
      const mappedRules: Record<string, any> = {};
      for (const key in rules) {
        if (Object.prototype.hasOwnProperty.call(rules, key)) {
          mappedRules[key] = this.traverseRules(rules[key]);
        }
      }
      return mappedRules;
    } else {
      return this.resolve(rules);
    }
  }

  /**
   * resolve a pipe expression of the form: { @pipe: [["{data.foo.bar}", 2, false, "hello world"]] }
   * @param value 
   * @returns 
   */
  private pipe(value: PipeType): any {
    const pipe = new Pipe(value, this.data);
    return pipe.process();
  }

  /**
   * resolve a simple mapping expression in the form: "{data.foo.bar}" or 2 or false or "hello world"
   * @param value 
   * @returns 
   */
  private resolve(value: any): any {
    const pipe = new Pipe([[value]], this.data);
    return pipe.process();
  }
}


export { MapperService }