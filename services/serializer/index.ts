import { 
  JSONSchema,
  AbbreviationMap,
  AbbreviationMaps,
  AbbreviationObjects, 
  FlatDocument,
  MultiDimensionalDocument } from '../../typedefs/serializer';

export class SerializerService {
  private abbreviationMaps: AbbreviationMaps;
  private abbreviationReverseMaps: AbbreviationMaps;
  private abbreviationCounter: number;

  constructor(abbreviationMaps?: AbbreviationObjects) {
    this.abbreviationMaps = new Map();
    this.abbreviationReverseMaps = new Map();
    this.abbreviationCounter = 0;
    if (abbreviationMaps) {
      for (const id in abbreviationMaps) {
        this.abbreviationMaps.set(id, new Map(Object.entries(abbreviationMaps[id])));
      }
    }
  }

  private getNextAbbreviation(): string {
    const firstLetter = String.fromCharCode(97 + Math.floor(this.abbreviationCounter / 26));
    const secondLetter = String.fromCharCode(97 + this.abbreviationCounter % 26);
    this.abbreviationCounter++;
    return firstLetter + secondLetter;
  }

  //NOTE: Training is addative and will not overwrite existing abbreviations.
  //NOTE: Once the first job is run, compiler key-training will be disabled;
  //      however, value-training can be run any time
  public train(document: object, id: string): void {
    let map = this.abbreviationMaps.get(id);
    if (!map) {
      map = new Map();
      this.abbreviationMaps.set(id, map);
    }
    const flatDocument = this.flatten(document);
    for (let [key] of Object.entries(flatDocument)) {
      if (!map.has(key)) {
        map.set(key, this.getNextAbbreviation());
      }
    }
    for (let [, val] of Object.entries(flatDocument)) {
      if (!map.has(val)) {
        map.set(val, this.getNextAbbreviation());
      }
    }
  }

  private getReverseMap(abbreviationMap: AbbreviationMap, id?: string): AbbreviationMap {
    let map = this.abbreviationReverseMaps.get(id);
    if (!map) {
      map = new Map();
      for (let [key, val] of abbreviationMap.entries()) {
        map.set(val, key);
      }
      this.abbreviationReverseMaps.set(id, map);
    }
    return map;
  }

  //replace key/val expansions with tokens in a 2-d hash
  deflate(document: FlatDocument, id: string): FlatDocument {
    const abbreviationMap = this.abbreviationMaps.get(id) || new Map();
    let result: FlatDocument = {};
    for (let key in document) {
      let safeKey = abbreviationMap.get(key) || key;
      let value = document[key];
      let safeValue = abbreviationMap.get(value) || value;
      result[safeKey] = safeValue;
    }
    return result;
  }

  //replace key/val tokens with expansions in a 2-d hash
  inflate(document: FlatDocument, id: string): FlatDocument {
    const abbreviationMap = this.abbreviationMaps.get(id) || new Map();
    const reversedAbbreviationMap = this.getReverseMap(abbreviationMap, id);
    let result: FlatDocument = {};
    for (let key in document) {
      let safeKey = reversedAbbreviationMap.get(key) || key;
      let value = document[key];
      let safeValue = reversedAbbreviationMap.get(value) || value;
      result[safeKey] = safeValue;
    }
    return result;
  }

  //convert a multi-dimensional document to a 2-d hash
  flatten(document: any, prefix = ''): FlatDocument {
    let result: FlatDocument = {};
    for (let key in document) {
      let newKey = prefix ? `${prefix}/${key}` : key;
      if (typeof document[key] === 'object' && !(document[key] instanceof Date)) {
        Object.assign(result, this.flatten(document[key], newKey));
      } else {
        let value = this.toString(document[key]);
        if (value) {
          result[newKey] = value;
        }
      }
    }
    return result;
  }

  //convert a 2-d hash to a multi-dimensional document
  unflatten(document: FlatDocument): any {
    let result: any = {};
    for (let key in document) {
      let keys = key.split('/');
      let current = result;
      for (let i = 0; i < keys.length; i++) {
        if (i === keys.length - 1) {
          let value = document[key];
          current[keys[i]] = this.fromString(value);
        } else {
          current[keys[i]] = current[keys[i]] || {};
          current = current[keys[i]];
        }
      }
    }
    return this.toArray(result);
  }
  
  toString(value: any): string|undefined {
    switch (typeof value) {
      case 'string':
        break;
      case 'boolean':
        value = value ? '/t' : '/f';
        break;
      case 'number':
        value = '/d' + value.toString();
        break;
      case 'undefined':
        return undefined;
      case 'object':
        if (value === null) {
          value = '/n';
        } else {
          value = '/s' + JSON.stringify(value);
        }
        break;
    }
    return value;
  }

  fromString(value: string|undefined): any {
    if (typeof value !== 'string') return undefined;
    const prefix = value.slice(0, 2);
    const rest = value.slice(2);
    switch (prefix) {
      case '/t': // boolean true
        return true;
      case '/f': // boolean false
        return false;
      case '/d': // number
        return Number(rest);
      case '/n': // null
        return null;
      case '/s': // object (JSON string)
        return JSON.parse(rest);
      default: // string
        return value;
    }
  }

  private toArray(obj: any): any {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj) || obj instanceof Date) {
      return obj;
    }
    const isSequentialNumericKeys = (o: any): boolean => {
      let index = 0;
      let sequential = true;
      for (const key in o) {
        if (o.hasOwnProperty(key)) {
          if (parseInt(key) !== index) {
            sequential = false;
            break;
          }
          index++;
        }
      }
      return sequential;
    }
    if (isSequentialNumericKeys(obj)) {
      return Object.values(obj).map((value) => this.toArray(value));
    }
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        obj[key] = this.toArray(obj[key]);
      }
    }
    return obj;
  }

  generateValueFromSchema(schema: JSONSchema): any {
    if (schema['x-train'] === false) {
      return schema.type === 'number' ? 1 : 'z';
    }
    if (schema.examples && schema.examples.length > 0) {
      return schema.examples[0];
    }
    if (schema.enum) {
      return schema.enum[0];
    }
    switch (schema.type) {
      case 'string':
        return 'sample-string';
      case 'number':
        return 123;
      case 'boolean':
        return true;  // default value for boolean
      case 'array':
        if (schema.items) {
          // generate an array with one item
          return [this.generateValueFromSchema(schema.items)];
        } else {
          // if no item schema is provided, generate an empty array
          return [];
        }
      case 'object':
        return this.generateFromObjectSchema(schema);
      default:
        return null;
    }
  }

  generateFromObjectSchema(objectSchema: JSONSchema): any {
    let result: any = {};
    for (let key in objectSchema.properties) {
      result[key] = this.generateValueFromSchema(objectSchema.properties[key]);
    }
    return result;
  }

  generateAndTrain(schema: JSONSchema, id: string): void {
    //todo: generate multiple docs per expected values to train on
    let sampleData = this.generateFromObjectSchema(schema);
    this.train(sampleData, id);
  }

  public serialize(document: MultiDimensionalDocument, id: string): FlatDocument {
    return this.deflate(this.flatten(document), id);
  }

  public deserialize(document: FlatDocument, id: string): MultiDimensionalDocument {
    return this.unflatten(this.inflate(document, id));
  }

  public export(): AbbreviationObjects {
    const obj: {[key: string]: FlatDocument} = {};
    for (const [id, map] of this.abbreviationMaps.entries()) {
      obj[id] = {};
      for (const [key, value] of map.entries()) {
        obj[id][key] = value;
      }
    }
    return obj;
  }
}
