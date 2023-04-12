type FlatObject = { [key: string]: string | number | boolean | null };

class SerializerService {
  static flattenHierarchy(obj: any, prefix: string = ''): FlatObject {
    const result: FlatObject = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        const newKey = prefix ? `${prefix}/${key}` : key;

        if (value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          result[newKey] = JSON.stringify(value);
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

  static restoreHierarchy(obj: FlatObject): any {
    const result: any = {};
    for (const key in obj) {
      //if (obj.hasOwnProperty && obj.hasOwnProperty(key)) {
        const keys = key.split('/');
        let current = result;

        for (let i = 0; i < keys.length; i++) {
          if (i === keys.length - 1) {
            current[keys[i]] = JSON.parse(obj[key] as string);
          } else {
            current[keys[i]] = current[keys[i]] || {};
            current = current[keys[i]];
          }
        }
      //} else {
      //  console.info(`Object does not have property ${key}`, obj, typeof obj, Object.keys(obj));
      //}
    }
    return result;
  }
}

export { SerializerService };
