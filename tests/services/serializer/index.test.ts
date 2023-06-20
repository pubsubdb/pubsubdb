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
});
