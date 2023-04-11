type FlatObject = { [key: string]: string | number | boolean | null };

class SerializerService {
  static flattenHierarchy(obj: any, prefix: string = ''): FlatObject {
    const result: FlatObject = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        const newKey = prefix ? `${prefix}/${key}` : key;

        if (value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          result[newKey] = value;
        } else if (typeof value === 'object') {
          Object.assign(result, this.flattenHierarchy(value, newKey));
        }
      }
    }
    return result;
  }

  static restoreHierarchy(obj: FlatObject): any {
    const result: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const keys = key.split('/');
        let current = result;

        for (let i = 0; i < keys.length; i++) {
          if (i === keys.length - 1) {
            current[keys[i]] = obj[key];
          } else {
            current[keys[i]] = current[keys[i]] || {};
            current = current[keys[i]];
          }
        }
      }
    }
    return result;
  }
}

export { SerializerService };
