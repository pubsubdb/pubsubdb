import { SerializerService } from '../../../services/store/serializer';
import { FlatObject } from '../../../typedefs/serializer';

describe('SerializerService', () => {
  let testObject: any;
  let flatObject: FlatObject | null;

  beforeEach(() => {
    // Initialize testObject with some data before each test
    testObject = {};
    flatObject = {};
  });

  afterEach(() => {
    // Clean up after each test
    testObject = null;
    flatObject = null;
  });

  describe('flattenHierarchy', () => {
    it('should correctly handle null values', () => {
      testObject = { name: null };
      flatObject = SerializerService.flattenHierarchy(testObject);
      expect(flatObject).toEqual({ name: '{@null}' });
    });
  
    it('should not store undefined values', () => {
      testObject = { name: undefined };
      flatObject = SerializerService.flattenHierarchy(testObject);
      expect(flatObject).toEqual({});
    });
  
    it('should correctly store string, number, and boolean values', () => {
      testObject = {
        name: 'John',
        age: 30,
        isStudent: false,
      };
      flatObject = SerializerService.flattenHierarchy(testObject);
      expect(flatObject).toEqual({
        name: 'John',
        age: '30',
        isStudent: 'false',
      });
    });
  
    it('should correctly flatten nested objects', () => {
      testObject = {
        name: 'John',
        address: {
          city: 'New York',
          zip: 10001,
        },
      };
      flatObject = SerializerService.flattenHierarchy(testObject);
      expect(flatObject).toEqual({
        name: 'John',
        'address/city': 'New York',
        'address/zip': '10001',
      });
    });
  });  

  describe('removeUndefined', () => {
    it('should not change object without undefined values', () => {
      testObject = {
        name: 'John',
        age: 30,
        isStudent: false,
      };
      const result = SerializerService.removeUndefined(testObject);
      expect(result).toEqual(testObject);
    });
  
    it('should remove keys with undefined values', () => {
      testObject = {
        name: 'John',
        age: undefined,
        isStudent: false,
      };
      const result = SerializerService.removeUndefined(testObject);
      expect(result).toEqual({
        name: 'John',
        isStudent: false,
      });
    });
  });  

  describe('objectToArray', () => {
    it('should convert object with sequentially numeric keys into array', () => {
      testObject = {
        0: 'John',
        1: 'Doe',
        2: 'Student'
      };
      const result = SerializerService.objectToArray(testObject);
      expect(result).toEqual(['John', 'Doe', 'Student']);
    });
  
    it('should not convert object without sequentially numeric keys', () => {
      testObject = {
        '0': 'John',
        '2': 'Doe',
        '3': 'Student'
      };
      const result = SerializerService.objectToArray(testObject);
      expect(result).toEqual(testObject);
    });
  });  

  describe('convertTypes', () => {
    it('should correctly convert {@null} string to null', () => {
      const result = SerializerService.convertTypes('{@null}');
      expect(result).toBeNull();
    });
  
    it('should not change \\{@null\\} string', () => {
      const result = SerializerService.convertTypes('\\{@null\\}');
      expect(result).toEqual('{@null}');
    });
  
    it('should correctly convert ISO string to Date object', () => {
      const isoString = new Date().toISOString();
      const result = SerializerService.convertTypes(isoString);
      expect(result).toEqual(new Date(isoString));
    });
  
    it('should correctly convert numeric string to Number', () => {
      const result = SerializerService.convertTypes('123');
      expect(result).toEqual(123);
    });

    it('should not convert string with leading zero to Number', () => {
      const result = SerializerService.convertTypes('02134');
      expect(result).toEqual('02134');
    });
  
    it('should correctly convert "true" and "false" strings to boolean', () => {
      const resultTrue = SerializerService.convertTypes('true');
      expect(resultTrue).toBe(true);
  
      const resultFalse = SerializerService.convertTypes('false');
      expect(resultFalse).toBe(false);
    });
  });  

  describe('restoreHierarchy', () => {
    it('should correctly handle flat objects', () => {
      flatObject = {
        name: 'John',
        age: '30',
        isStudent: 'false',
      };
      const result = SerializerService.restoreHierarchy(flatObject);
      expect(result).toEqual({
        name: 'John',
        age: 30,
        isStudent: false,
      });
    });
  
    it('should correctly restore nested objects', () => {
      flatObject = {
        name: 'John',
        'address/city': 'New York',
        'address/zip': '10001',
      };
      const result = SerializerService.restoreHierarchy(flatObject);
      expect(result).toEqual({
        name: 'John',
        address: {
          city: 'New York',
          zip: 10001,
        },
      });
    });
  
    it('should correctly restore objects with array structure', () => {
      flatObject = {
        'students/0': 'John',
        'students/1': 'Jane',
      };
      const result = SerializerService.restoreHierarchy(flatObject);
      expect(result).toEqual({
        students: ['John', 'Jane'],
      });
    });
  });
});
