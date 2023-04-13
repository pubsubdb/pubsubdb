type FlatObject = { [key: string]: string | number | boolean | null | any[] };

/**
 * SerializerService: A service to serialize and deserialize objects. It is used to store
 * objects in a flat hash composed of key/value pairs. The key is a string and the value
 * is a stringified version of the value. Restoring the object from the flat hash requires
 * a few additional steps to convert dates to objects and object arrays to arrays
 */
class SerializerService {

  static flattenHierarchy(obj: any, prefix: string = ''): FlatObject {
    const result: FlatObject = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        const newKey = prefix ? `${prefix}/${key}` : key;

        if (value instanceof Date) {
          result[newKey] = value.toISOString();
        } else if (value === null) {
          result[newKey] = '{@null}';
        } else if (value === undefined) {
          //never save undefined (assume it truly is undefined)
          //result[newKey] = value.toString();
        } else if (typeof value === 'string') {
          if (value === '{@null}') {
            result[newKey] = '\\{@null\\}';
          } else {
            result[newKey] = value;
          }
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          result[newKey] = value.toString();
        } else if (typeof value === 'object') {
          Object.assign(result, SerializerService.flattenHierarchy(value, newKey));
        }
      }
    }
    return SerializerService.removeUndefined(result);
  }

  static removeUndefined(obj: any): any {
    const result: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (value !== undefined) {
          result[key] = value;
        }
      }
    }
    return result;
  }

  static objectToArray(obj: any): any {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj) || obj instanceof Date) {
      return obj;
    }
    function isSequentialNumericKeys(o: any): boolean {
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
      return Object.values(obj).map((value) => SerializerService.objectToArray(value));
    }
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        obj[key] = SerializerService.objectToArray(obj[key]);
      }
    }
    return obj;
  }

  static convertTypes(obj: string|number): any {
    if (typeof obj === 'string' && obj === '\\{@null\\}') {
      return '{@null}';
    } else if (typeof obj === 'string' && obj === '{@null}') {
      return null;
    } else if (typeof obj === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/.test(obj)) {
      return new Date(obj);
    } else if (!isNaN(obj as number)) {
      //todo: use schema to cast type
      return Number(obj);
    } else if (obj === 'true' || obj === 'false') {
      //todo: use schema to cast type
      return obj === 'true';
    } else { 
      return obj;
    }
  }

  static restoreHierarchy(obj: FlatObject): any|any[] {
    const result: any = {};
    for (const key in obj) {
      const keys = key.split('/');
      let current = result;
      for (let i = 0; i < keys.length; i++) {
        if (i === keys.length - 1) {
          current[keys[i]] = SerializerService.convertTypes(obj[key] as string);
        } else {
          current[keys[i]] = current[keys[i]] || {};
          current = current[keys[i]];
        }
      }
    }
    return SerializerService.objectToArray(result);
  }
}

export { SerializerService };
