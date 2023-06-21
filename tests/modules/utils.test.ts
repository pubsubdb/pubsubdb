import * as utils from '../../modules/utils';

describe('utils module', () => {
  describe('getGuid function', () => {
    it('should return a valid guid', () => {
      const guid = utils.getGuid();
      expect(guid).toMatch(/^[a-f0-9]+\.[a-f0-9]+$/);
    });
  });

  describe('getSymKey function', () => {
    it('should return "aaa" for input 0', () => {
      const sequence = utils.getSymKey(0);
      expect(sequence).toBe('aaa');
    });

    it('should return "aba" for input 1', () => {
      //verify sequence increments position 2
      const sequence = utils.getSymKey(1);
      expect(sequence).toBe('aba');
    });

    it('should return "aAf" for input 286', () => {
      //verify sequence for 286 (26 metadata slots, 260 data slots)
      const sequence = utils.getSymKey(286);
      expect(sequence).toBe('aAf');
    });

    it('should return "ZZZ" for input 140607', () => {
      //length of the alphabet squared, minus 1 for zero indexing
      const maxAllowed = Math.pow(52, 3) - 1;
      const sequence = utils.getSymKey(maxAllowed);
      expect(sequence).toBe('ZZZ');
    });

    it('should return the max allowed value without throwing an error', () => {
      const maxAllowed = Math.pow(52, 3) - 1;
      expect(() => utils.getSymKey(maxAllowed)).not.toThrow();
    });
 
    it('should throw an error for input greater than the max allowed value', () => {
      const tooLarge = Math.pow(52, 3); // length of the alphabet squared
      expect(() => utils.getSymKey(tooLarge)).toThrow('Number out of range');
    });
  });

  describe('getSymVal function', () => {
    it('should return "aa" for input 0', () => {
      const sequence = utils.getSymVal(0);
      expect(sequence).toBe('aa');
    });

    it('should return "ab" for input 1', () => {
      //verify sequence increments position 2
      const sequence = utils.getSymVal(1);
      expect(sequence).toBe('ab');
    });

    it('should return "aA" for input 26', () => {
      //verify sequence for 26 (26 metadata slots, 26 data slots)
      const sequence = utils.getSymVal(26);
      expect(sequence).toBe('aA');
    });    

    it('should return "ZZ" for input 2703', () => {
      //length of the alphabet squared, minus 1 for zero indexing
      const maxAllowed = Math.pow(52, 2) - 1;
      const sequence = utils.getSymVal(maxAllowed);
      expect(sequence).toBe('ZZ');
    });

    it('should return the max allowed value without throwing an error', () => {
      const maxAllowed = Math.pow(52, 2) - 1;
      expect(() => utils.getSymVal(maxAllowed)).not.toThrow();
    });
 
    it('should throw an error for input greater than the max allowed value', () => {
      const tooLarge = Math.pow(52, 2); // length of the alphabet squared
      expect(() => utils.getSymVal(tooLarge)).toThrow('Number out of range');
    });
  });
});
