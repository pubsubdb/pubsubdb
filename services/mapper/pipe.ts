import { ArrayHandler } from './functions/array';
import { NumberHandler } from './functions/number';
import { MathHandler } from './functions/math';
import { StringHandler } from './functions/string';
import { PipeItem, Pipe as PipeType } from '../../typedefs/pipe';

interface JobData {
  [key: string]: any;
}

class Pipe {
  rules: PipeType;
  jobData: JobData;
  static arrayHandler = new ArrayHandler();
  static numberHandler = new NumberHandler();
  static mathHandler = new MathHandler();
  static stringHandler = new StringHandler();

  constructor(rules: PipeType, jobData: JobData) {
    this.rules = rules;
    this.jobData = jobData;
  }

  private isPipeType(currentRow: PipeItem[]|PipeType): currentRow is PipeType {
    return !Array.isArray(currentRow) && '@pipe' in currentRow;
  }

  /**
   * loop through each PipeItem row in this Pipe, resolving and transforming line by line
   * @returns {any} the result of the pipe
   */
  process(): any {
    let resolved = this.processCells(this.rules[0] as PipeItem[]);
    const len = this.rules.length;
    for (let i = 1; i < len; i++) {
      resolved = this.processRow(this.rules[i], resolved, []);
    }
    return resolved[0];
  }

  private processRow(currentRow: PipeItem[]|PipeType, resolvedPriorRow: unknown[]|null, subPipeQueue: unknown[]): PipeItem[] {
    if (this.isPipeType(currentRow)) {
      //currentRow is a recursive subPipe
      const subPipe = new Pipe(currentRow['@pipe'], this.jobData);
      subPipeQueue.push(subPipe.process());
      //return prior row as if nothing happened
      return resolvedPriorRow as PipeItem[];
    } else {
      //currentRow is a standard row
      if (subPipeQueue.length > 0) {
        //if items in subPipeQueue, flush and use as resolvedPriorRow
        resolvedPriorRow = [...subPipeQueue];
        subPipeQueue.length = 0;
      }
      const [functionName, ...params] = currentRow;
      //use resolved values from prior row (n - 1) as input params to cell 1 function
      const resolvedValue = this.resolveFunction(functionName as string)(...resolvedPriorRow);
      //resolve remaining cells in row and return concatenated with resolvedValue
      return [resolvedValue].concat(this.processCells([...params]));
    }
  }

  private resolveFunction(functionName: string) {
    let [prefix, suffix] = functionName.split('.');
    prefix = prefix.substring(2);
    suffix = suffix.substring(0, suffix.length - 1);
    let domain = null;
    switch (prefix) {
      case 'array':
        domain = Pipe.arrayHandler;
        break;
      case 'math':
        domain = Pipe.mathHandler;
        break;
      case 'number':
        domain = Pipe.numberHandler;
        break;
      case 'string':
        domain = Pipe.stringHandler;
        break;
      default:
        throw new Error(`Unknown domain name [${functionName}]: ${prefix}`);
    }
    if (!domain[suffix]) {
      throw new Error(`Unknown domain function [${functionName}]: ${prefix}.${suffix}`);
    }
    return domain[suffix];
  }

  processCells(cells: PipeItem[]): unknown[] {
    const resolved = [];
    for (const currentCell of cells) {
      resolved.push(this.resolveCellValue(currentCell));
    }
    return resolved;
  }

  private isMappable(currentCell: PipeItem): boolean {
    return typeof currentCell === 'string' &&  currentCell.startsWith('{');
  }

  resolveCellValue(currentCell: PipeItem): unknown {
    if (this.isMappable(currentCell)) {
      return this.resolveMappableValue(currentCell as string);
    } else {
      return currentCell;
    }
  }

  private getNestedProperty(obj: JobData, path: string): any {
    const pathParts = path.split('.');
    let current = obj;

    for (const part of pathParts) {
      if (current === null || typeof current !== 'object' || !current.hasOwnProperty(part)) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  resolveMappableValue(currentCell: string): unknown {
    const term = currentCell.substring(1, currentCell.length - 1);
    return this.getNestedProperty(this.jobData, term);
  }
}

export { Pipe };
