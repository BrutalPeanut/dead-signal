import { describe, expect, it } from 'vitest';
import { cleanName, nameProblem, randomName } from '../src/net/names';

describe('call sign filter', () => {
  it('lets normal names through, including ones that contain bad words inside real words', () => {
    for (const n of [
      'BShack', 'Matt', 'Nadine', 'Courier 7', 'ZombieSlayer', 'Grape Ape', 'Spice', 'Cassie', 'Dickens', 'Peacock', 'Bass Drop',
      'Assassin', 'Cockpit', 'Sussex', 'Torpedo', 'Cumberland', 'Scunthorpe', 'Classic', 'Mass Effect', 'Hancock', 'Therapist',
      'Crisis', 'Analyst', 'Shell Shock', 'Night Owl', 'Raccoon', 'Cocoon', 'Passion', 'Arsenal', 'Sniper_Wolf', 'xX-Rook-Xx',
      'Mr.Bones', 'Neon Raven 42', 'Big Daddy', 'Hot Shot', 'Glasses', 'Grasshopper', 'Pumpkin', 'Snowman', 'Tycoon',
    ])
      expect([n, nameProblem(n)]).toEqual([n, null]);
  });

  it('blocks slurs and profanity, including leetspeak, spacing and stretched letters', () => {
    for (const n of [
      'fuck', 'FUUUCK you', 'f.u.c.k', 'f u c k', 'phuck', 'fvck', 'sh1t', 's h i t', 'b1tch', 'cunt', 'Big Dick', 'n1gg3r',
      'faggot', 'f4g', 'Hitler', 'heil', 'n a z i', 'Nazi4Life', 'r3tard', 'kys', 'xXrapistXx', 'sexy girl', 'porn star',
      'blowjob', 'pussy cat', 'motherfucker', 'KKK', 'wh1te power', 'boobs',
    ])
      expect([n, cleanName(n)]).toEqual([n, false]);
  });

  it('only allows plain characters, so look-alike letters and emoji cannot sneak words through', () => {
    expect(nameProblem('fսck')).not.toBeNull(); // Armenian "ս"
    expect(nameProblem('Ѕhit')).not.toBeNull(); // Cyrillic "Ѕ"
    expect(nameProblem('Cool 😎')).not.toBeNull();
    expect(nameProblem('Zoë')).not.toBeNull();
    expect(nameProblem('A')).not.toBeNull();
    expect(nameProblem('ThisNameIsWayTooLong')).not.toBeNull();
  });

  it('blocks phone numbers and links', () => {
    expect(nameProblem('call 5551234567')).not.toBeNull();
    expect(nameProblem('555-123-4567')).not.toBeNull();
    expect(nameProblem('mysite.com')).not.toBeNull();
    expect(nameProblem('www dot me')).not.toBeNull();
    expect(nameProblem('Agent 4700')).toBeNull();
  });

  it('random call signs are always valid', () => {
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 500; i++) {
      const n = randomName(rand);
      expect([n, nameProblem(n)]).toEqual([n, null]);
    }
  });
});

describe('server copy of the call sign filter', () => {
  it('uses exactly the same word lists as the game, so the server never renames a name the game accepted', async () => {
    const { readFileSync } = await import('fs');
    const { STEMS, WORDS } = await import('../src/net/names');
    const sql = readFileSync('supabase/migrations/20261122_name_filter_v2.sql', 'utf8');
    const arr = (name: string) => JSON.parse(sql.match(new RegExp(`${name} text\\[\\] := array(\\[[^\\]]*\\])`))![1].replace(/'/g, '"'));
    expect(arr('stems')).toEqual(STEMS);
    expect(arr('words')).toEqual(WORDS);
  });
});
