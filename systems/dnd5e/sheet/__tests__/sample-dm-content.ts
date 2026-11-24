import type { PackContent } from '../../content-pack/domain/types';

export const sampleDm: PackContent = {
  entries: [
    { kind: 'chapter', source: 'XDMG', id: 'xdmg/sample-hall', ref: 'chapter:xdmg/sample-hall', name: 'Sample Hall', meta: { bookChapter: 1 }, entries: ['An imaginary hall with three blue doors.', '{@book East Door|XDMG|1|East Door}'] },
    { kind: 'chapter', source: 'XDMG', id: 'xdmg/sample-hall/east-door', ref: 'chapter:xdmg/sample-hall/east-door', name: 'East Door', meta: { bookChapter: 1, bookSection: 'East Door' }, entries: ['A painted door.'] },
    { kind: 'item', source: 'XDMG', id: 'sample-pebble', ref: 'item:sample-pebble', name: 'Sample Pebble', meta: { magic: true, rarity: 'rare', category: 'Wondrous item' }, entries: ['A pebble that hums.'] },
  ],
  zhTW: { 'chapter:xdmg/sample-hall': { name: '範例大廳', entries: ['想像中的大廳有三扇藍門。', '{@book 東門|XDMG|1|East Door}'] } }, wizard: {},
};
