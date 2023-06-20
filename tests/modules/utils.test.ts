import * as utils from '../../modules/utils';

describe('utils module', () => {
  describe('getGuid function', () => {
    it('should return a valid guid', () => {
      const guid = utils.getGuid();
      expect(guid).toMatch(/^[a-f0-9]+\.[a-f0-9]+$/);
    });
  });

  describe('numberToSequence function', () => {
    it('should return "aaa" for input 0', () => {
      const sequence = utils.numberToSequence(0);
      expect(sequence).toBe('aaa');
    });

    it('should return "aba" for input 1', () => {
      //verify sequence increments position 2
      const sequence = utils.numberToSequence(1);
      expect(sequence).toBe('aba');
    });

    it('should return "aAf" for input 286', () => {
      //verify sequence for 286 (26 metadata slots, 260 data slots)
      const sequence = utils.numberToSequence(286);
      expect(sequence).toBe('aAf');
    });

    it('should return "ZZZ" for input 140607', () => {
      //length of the alphabet squared, minus 1 for zero indexing
      const maxAllowed = Math.pow(52, 3) - 1;
      const sequence = utils.numberToSequence(maxAllowed);
      expect(sequence).toBe('ZZZ');
    });

    it('should return the max allowed value without throwing an error', () => {
      const maxAllowed = Math.pow(52, 3) - 1;
      expect(() => utils.numberToSequence(maxAllowed)).not.toThrow();
    });
 
    it('should throw an error for input greater than the max allowed value', () => {
      const tooLarge = Math.pow(52, 3); // length of the alphabet squared
      expect(() => utils.numberToSequence(tooLarge)).toThrow('Number out of range');
    });
  });
});
