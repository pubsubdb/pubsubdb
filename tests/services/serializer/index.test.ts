import { SerializerService } from '../../../services/serializer';
import { JSONSchema } from '../../../typedefs/serializer';

describe('SerializerService', () => {
  let service: SerializerService;
  let document: { [key: string]: any };
  let id: string;

  beforeEach(() => {
    service = new SerializerService();
    document = {};
    id = 'test';
  });

  describe('train', () => {
    it('should build an abbreviation map for a document', () => {
      document = {
        firstName: 'John',
        lastName: 'Doe',
        addresses: [
          {
            street: '123 Main St',
            city: 'Anytown',
          },
          {
            street: '456 Oak St',
            city: 'Othertown',
          }
        ]
      };
      service.train(document, id);
      const maps = service.export();
      expect(maps.test.firstName).toBe('aa');
      expect(maps.test.lastName).toBe('ab');
      expect(Object.keys(maps.test).length).toBe(12);
    });
  });

  describe('serialize', () => {
    it('should serialize complex nested object correctly', () => {
      document = {
        name: 'John',
        details: {
          age: 25,
          favoriteColors: ['red', 'blue', 'green'],
          education: {
            highSchool: 'Anytown High School',
            college: 'Anytown College',
            postGrad: null,
            grades: [90, 85, 88, 92]
          }
        }
      };
      service.train(document, id);
      const serialized = service.serialize(document, id);
      for (let [key,val] of Object.entries(serialized)) {
        expect(key.length).toBe(2);
        expect(val.length).toBe(2);
      }
    });
  });

  describe('deserialize', () => {
    it('should deserialize complex nested object correctly', () => {
      document = {
        aa: 'al',
        ab: 'am',
        ac: 'an',
        ad: 'ao',
        ae: 'ap',
        af: 'aq',
        ag: 'ar',
        ah: 'as',
        ai: 'at',
        aj: 'au',
        ak: 'av'
      };
      // Construct the abbreviation maps manually for this test
      let abbreviationMaps = {
        [id]: {
          name: 'aa',
          'details/age': 'ab',
          'details/favoriteColors/0': 'ac',
          'details/favoriteColors/1': 'ad',
          'details/favoriteColors/2': 'ae',
          'details/education/highSchool': 'af',
          'details/education/college': 'ag',
          'details/education/grades/0': 'ah',
          'details/education/grades/1': 'ai',
          'details/education/grades/2': 'aj',
          'details/education/grades/3': 'ak',
          John: 'al',
          '/d25': 'am',
          red: 'an',
          blue: 'ao',
          green: 'ap',
          'Anytown High School': 'aq',
          'Anytown College': 'ar',
          '/d90': 'as',
          '/d85': 'at',
          '/d88': 'au',
          '/d92': 'av'
        }
      };
      service = new SerializerService(abbreviationMaps);
      const deserialized = service.deserialize(document, id) as { [key: string]: any };
      // Check if deserialized object has expected structure
      expect(deserialized).toHaveProperty('name');
      expect(deserialized).toHaveProperty('details.age');
      expect(deserialized).toHaveProperty('details.favoriteColors');
      expect(deserialized).toHaveProperty('details.education.highSchool');
      //ensure grades are restored as an array of numbers
      expect(deserialized.details.education.grades.length).toBe(4)
      expect(deserialized.details.education.grades[0]).toBe(90)
    });
  });
  
  describe('export', () => {
    it('should return a correct map of abbreviations', () => {
      const document = {
        firstName: 'John',
        lastName: 'Doe',
        details: {
          age: 25,
          occupation: 'Engineer'
        },
        ab: {
          ac: true,
        }
      };
      service.train(document, id);
      const exportMap = service.export();
      const expectedMap = {
        [id]: {
          firstName: 'aa',
          lastName: 'ab',
          'details/age': 'ac',
          'details/occupation': 'ad',
          'ab/ac': 'ae',
          John: 'af',
          Doe: 'ag',
          '/d25': 'ah',
          Engineer: 'ai',
          '/t': 'aj'
        }
      };
      expect(exportMap).toEqual(expectedMap);
    });
  });

  describe('generateValueFromSchema', () => {
    it('should return the first enum value if available', () => {
      const schema: JSONSchema = { type: 'string', enum: ['a', 'b', 'c'] };
      const result = service.generateValueFromSchema(schema);
      expect(result).toBe('a');
    });

    it('should return the first example if available', () => {
      const schema: JSONSchema = { type: 'string', examples: ['ex1', 'ex2'] };
      const result = service.generateValueFromSchema(schema);
      expect(result).toBe('ex1');
    });

    it('should return a 1-character value if x-train is false', () => {
      const schema: JSONSchema = { type: 'string', 'x-train': false };
      const result = service.generateValueFromSchema(schema);
      expect(result).toBe('z');
    });
  });

  describe('generateFromObjectSchema', () => {
    it('should generate a document from the provided schema', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The unique identifier for the order.',
            'x-train': false,
            examples: ['ord_123'],
          },
          size: {
            type: 'string',
            description: 'The size of the order.',
            enum: ['sm', 'md', 'lg'],
          },
          // other properties...
        },
      };
      const result = service.generateFromObjectSchema(schema);
      expect(result.id).toBe('z');
      expect(result.size).toBe('sm');
    });
  });

  describe('generateAndTrain', () => {
    it('should generate sample data and call train method', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The unique identifier for the order.',
            'x-train': false,
            examples: ['ord_123'],
          },
          size: {
            type: 'string',
            description: 'The size of the order.',
            enum: ['sm', 'md', 'lg'],
          },
          primacy: {
            type: 'string',
            description: 'The importance of the order.',
            enum: ['primary', 'secondary', 'tertiary']
          },
          color: {
            type: 'string',
            description: 'The color of the order.',
            enum: ['red', 'yellow', 'blue']
          },
          send_date: {
            type: 'string',
            description: 'The date when the order was scheduled.'
          },
          must_release_series: {
            type: 'string',
            description: 'The time series slice the scheduled order must be released.'
          },
          actual_release_series: {
            type: 'string',
            description: 'The actual time series slice when the order was released.'
          },
          facility: {
            type: 'string',
            description: 'The facility name.',
            enum: ['acme', 'spacely', 'cogswell']
          }
          // other properties...
        },
      };
      const id = 'test_id';
      const trainSpy = jest.spyOn(service, 'train');
      service.generateAndTrain(schema, id);
      expect(trainSpy).toHaveBeenCalledWith(expect.any(Object), id);
    });
  });
});
