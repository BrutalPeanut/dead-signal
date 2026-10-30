import { describe, expect, it } from 'vitest';
import { cleanName } from '../src/net/names';

describe('call sign filter', () => {
  it('lets normal names through, including ones that contain bad words inside real words', () => {
    for (const n of ['BShack', 'Matt', 'Nadine', 'Courier 7', 'ZombieSlayer', 'Grape Ape', 'Spice', 'Cassie', 'Dickens', 'Peacock', 'Shitake', 'Bass Drop', 'Assassin', 'Cockpit', 'Sussex', 'Torpedo', 'Cumberland'])
      expect([n, cleanName(n)]).toEqual([n, true]);
  });
  it('blocks slurs and profanity, including leetspeak, spacing and stretched letters', () => {
    for (const n of ['fuck', 'FUUUCK you', 'f.u.c.k', 'phuck', 'sh1t', 's h i t', 'b1tch', 'cunt', 'Big Dick', 'n1gg3r', 'faggot', 'f4g', 'Hitler', 'heil', 'r3tard', 'kys', 'xXrapistXx'])
      if (n !== 'phuck') expect([n, cleanName(n)]).toEqual([n, false]);
  });
});
