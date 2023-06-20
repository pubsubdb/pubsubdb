import { 
  JSONSchema,
  AbbreviationMap,
  AbbreviationMaps,
  AbbreviationObjects, 
  FlatDocument,
  MultiDimensionalDocument } from '../../typedefs/serializer';

const dateReg = /^"\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?"$/;

export const MDATA_SYMBOLS = {
  SLOTS: 26,
  ACTIVITY: {
    KEYS: ['aid', 'atp', 'stp', 'ac', 'au', 'err']
  },
  ACTIVITY_UPDATE: {
    KEYS: ['au', 'err']
  },
  JOB: {
    KEYS: ['ngn', 'tpc', 'pj', 'pa', 'key', 'app', 'vrs', 'jid', 'aid', 'ts', 'jc', 'ju', 'js', 'err']
  },
  JOB_UPDATE: {
    KEYS: ['ju', 'err']
  }
};

export class SerializerService {
  private abbreviationMaps: AbbreviationMaps;
  private abbreviationReverseMaps: AbbreviationMaps;
  private abbreviationCounter: number;

  constructor(abbreviationMaps?: AbbreviationObjects) {
    this.abbreviationCounter = 0;
    this.resetAbbreviationMaps(abbreviationMaps || {});
  }

  resetAbbreviationMaps(abbreviationMaps: AbbreviationObjects): void {
    this.abbreviationMaps = new Map();
    this.abbreviationReverseMaps = new Map();
    for (const id in abbreviationMaps) {
      this.abbreviationMaps.set(id, new Map(Object.entries(abbreviationMaps[id])));
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

  compress(document: FlatDocument, ids: string[]): FlatDocument {
    if (this.abbreviationMaps.size === 0) {
      return document;
    }
    let result: FlatDocument = { ...document };

    const compressWithMap = (abbreviationMap: AbbreviationMap) => {
      for (let key in result) {
        let safeKey = abbreviationMap.get(key) || key;
        let value = result[key];
        let safeValue = abbreviationMap.get(value) || value;
        if (safeKey !== key || safeValue !== value) {
          result[safeKey] = safeValue;
          if (safeKey !== key) {
            delete result[key];
          }
        }
      }
    };
    for (let id of ids) {
      const abbreviationMap = this.abbreviationMaps.get(id);
      if (abbreviationMap) {
        compressWithMap(abbreviationMap);
      }
    }
    return result;
  }

  decompress(document: FlatDocument, ids: string[]): FlatDocument {
    if (this.abbreviationMaps.size === 0) {
      return document;
    }
    let result: FlatDocument = { ...document };

    const inflateWithMap = (abbreviationMap: AbbreviationMap, id: string) => {
      const reversedAbbreviationMap = this.getReverseMap(abbreviationMap, id);
      for (let key in result) {
        let safeKey = reversedAbbreviationMap.get(key) || key;
        let value = result[key];
        let safeValue = reversedAbbreviationMap.get(value) || value;
        if (safeKey !== key || safeValue !== value) {
          result[safeKey] = safeValue;
          if (safeKey !== key) {
            delete result[key];
          }
        }
      }
    };
    for (let id of ids) {
      const abbreviationMap = this.abbreviationMaps.get(id);
      if (abbreviationMap) {
        inflateWithMap(abbreviationMap, id);
      }
    }
    return result;
  }

  //replace key/val expansions with tokens in a 2-d hash
  deflate(document: FlatDocument, id?: string): FlatDocument {
    if (this.abbreviationMaps.size === 0) {
      return document; // return original document if no maps exist
    }
    let result: FlatDocument = { ...document }; // clone original document
    // Define a helper function for deflating a document with an abbreviation map
    const deflateWithMap = (abbreviationMap: AbbreviationMap) => {
      for (let key in result) {
        let safeKey = abbreviationMap.get(key) || key;
        let value = result[key];
        let safeValue = abbreviationMap.get(value) || value;
        if (safeKey !== key || safeValue !== value) {
          result[safeKey] = safeValue;
          if (safeKey !== key) {
            delete result[key];
          }
        }
      }
    };
    if (id) {
      // If ID is provided, use the corresponding abbreviation map
      const abbreviationMap = this.abbreviationMaps.get(id);
      if (abbreviationMap) {
        deflateWithMap(abbreviationMap);
      }
    } else {
      // If no ID is provided, iterate all abbreviation maps
      for (let abbreviationMap of this.abbreviationMaps.values()) {
        deflateWithMap(abbreviationMap);
      }
    }
    // Return the potentially modified result
    return result;
  }

  //replace key/val tokens with expansions in a 2-d hash
  inflate(document: FlatDocument, id?: string): FlatDocument {
    if (this.abbreviationMaps.size === 0) {
      return document; // return original document if no maps exist
    }
    let result: FlatDocument = { ...document }; // clone original document
    // Define a helper function for inflating a document with a reversed abbreviation map
    const inflateWithMap = (abbreviationMap: AbbreviationMap, id: string) => {
      const reversedAbbreviationMap = this.getReverseMap(abbreviationMap, id);
      for (let key in result) {
        let safeKey = reversedAbbreviationMap.get(key) || key;
        let value = result[key];
        let safeValue = reversedAbbreviationMap.get(value) || value;
        if (safeKey !== key || safeValue !== value) {
          result[safeKey] = safeValue;
          if (safeKey !== key) {
            delete result[key];
          }
        }
      }
    };
    if (id) {
      // If ID is provided, use the corresponding abbreviation map
      const abbreviationMap = this.abbreviationMaps.get(id);
      if (abbreviationMap) {
        inflateWithMap(abbreviationMap, id);
      }
    } else {
      // If no ID is provided, iterate all abbreviation maps
      for (let [mapId, abbreviationMap] of this.abbreviationMaps.entries()) {
        inflateWithMap(abbreviationMap, mapId);
      }
    }
    // Return the potentially modified result
    return result;
  }

  //convert a multi-dimensional document to a 2-d hash (string:string)
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

  stringify(document: Record<string, any>): FlatDocument {
    let result: FlatDocument = {};
    for (let key in document) {
      let value = this.toString(document[key]);
      if (value) {
        result[key] = value;
      }
    }
    return result;
  }

  //convert a 2-d hash to a multi-dimensional document
  parse(document: FlatDocument): any {
    let result: any = {};
    for (let [key, value] of Object.entries(document)) {
      result[key] = this.fromString(value);
    }
    return result;
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
        if (dateReg.exec(rest)) {
          return new Date(JSON.parse(rest));
        }
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
    this.generateFromObjectSchema(schema);
  }

  public package(document: MultiDimensionalDocument, ids: string[]): FlatDocument {
    const flatDocument = this.stringify(document);
    return this.compress(flatDocument, ids);
  }

  public unpackage(document: FlatDocument, ids: string[]): MultiDimensionalDocument {
    const multiDimensionalDocument = this.decompress(document, ids);
    return this.parse(multiDimensionalDocument);
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
