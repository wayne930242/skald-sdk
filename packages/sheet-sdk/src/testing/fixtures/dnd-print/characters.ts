// D&D 2024 print fixtures (plan-print Task 2): the overrides a /dev/render-preview sheet takes
// (top-level keys over the System's defaultData), shared by the print model's unit tests and the
// print e2e. Every name is made up; the SRD rows name SRD 5.2.1 refs only.
//
// - wizard: 莉亞・霜語, an L5 elf wizard (evoker) with 17 spells, one of them a pack spell whose
//   row keeps no text (its pack is the made-up PRINT_PACK below), and one feature whose saved
//   text replaces the rules text.
// - fighter: 巴倫・鐵砧, an L1 human fighter, no spells.
// - sparse: a new card with only a name.
// - crowded: the wizard with every list five times over, far more than page 2 holds at any size.
// - crowdedAttacks: the fighter with 40 attacks and long notes, far more than page 1 holds.
// - barbarian: 測試, an L1 brass dragonborn barbarian without weapons or spells, as the boss's sheet
//   (prod c3451036) that the official-layout print was drawn from (LAYOUT.md §2a): two pages.
// - heavy: 瑟蕾絲・月歌, an L9 high elf evoker with three feats, 47 spells and a long backstory
//   (LAYOUT.md §2b): 續頁 and a spellbook of several pages.

export type DndPrintFixture = "wizard" | "fighter" | "sparse" | "crowded" | "crowdedAttacks" | "barbarian" | "heavy" | "longIdentity";

/** The pack spell of the wizard: no text on the row, its text only in PRINT_PACK. */
export const PACK_SPELL_REF = "spell:lantern-of-quiet-ash";
export const PACK_SPELL_NAME = "靜灰提燈";
/** A sentence of the pack spell's made-up text (zh-TW layer), checked in the print. */
export const PACK_SPELL_TEXT_ZH = "你點亮一盞只有你看得見的灰燼提燈";
export const PACK_SPELL_TEXT_EN = "You kindle a lantern of pale ash that only you can see";

/** The wizard's dagger: the player's own text on an attack row (編輯文字), printed on the full text pages. */
export const WEAPON_PLAYER_TEXT = "祖母留下的匕首，刀柄刻著霜語家的紋章。月光下刀刃會微微發藍。";

/** The wizard's Arcane Recovery row: its saved text prints instead of the rules text. */
export const EDITED_FEATURE_TEXT = "短休一次：取回總環階不超過 3 的法術位（第 6 環以上不行）。這是玩家自己縮寫的版本。";

const spell = (id: string, level: number, ref: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, level, ref, name, origin: "srd", source: "class", prepared: level > 0, concentration: false, ritual: false, material: false, notes: "", text: "",
  castingTime: "", range: "", ...extra,
});

const feature = (id: string, ref: string, name: string, level: number, extra: Record<string, unknown> = {}) => ({
  id, ref, name, level, origin: "srd", text: "", ...extra,
});

const WIZARD: Record<string, unknown> = {
  name: "莉亞・霜語",
  player: "測試玩家",
  className: "法師",
  classId: "wizard",
  subclass: "塑能師",
  level: 5,
  xp: 6500,
  background: "智者",
  backgroundId: "sage",
  species: "精靈",
  speciesId: "elf",
  lineage: "高等精靈血統",
  alignment: "neutralGood",
  str: 8, dex: 14, con: 14, int: 18, wis: 12, cha: 10,
  intSaveProf: true, wisSaveProf: true,
  arcanaProf: "proficient", historyProf: "proficient", investigationProf: "expertise", perceptionProf: "proficient", insightProf: "proficient",
  speed: 30,
  darkvision: 60,
  heroicInspiration: true,
  acMisc: 1,
  hitDieFaces: 6,
  hp: { current: 24 },
  hpTemp: 5,
  hitDiceSpent: 1,
  deathSuccesses: 1,
  conditions: ["poisoned", "exhaustion"],
  exhaustion: 1,
  concentration: "spell:haste",
  weaponProficiencies: "簡易武器",
  spellAbility: "int",
  slot1Total: 4, slot1Used: 1, slot2Total: 3, slot3Total: 2, slot3Used: 1,
  cp: 12, sp: 30, gp: 85,
  attunement1: "守護者之戒",
  weapons: [
    { id: "w1", name: "匕首", ability: "dex", proficient: true, magic: 0, ranged: false, damageDice: "1d4", damageType: "穿刺", mastery: "迅擊", notes: "靈巧、輕型、投擲（20/60）", ref: "baseItem:dagger", origin: "srd", playerText: WEAPON_PLAYER_TEXT },
    { id: "w2", name: "長棍", ability: "str", proficient: true, magic: 0, ranged: false, damageDice: "1d6", damageType: "鈍擊", mastery: "", notes: "多用（1d8）", ref: "baseItem:quarterstaff", origin: "srd" },
  ],
  features: [
    feature("f1", "classFeature:wizard/spellcasting-l1", "施法", 1),
    feature("f2", "classFeature:wizard/ritual-adept-l1", "儀式學家", 1),
    feature("f3", "classFeature:wizard/arcane-recovery-l1", "奧術回想", 1, { text: EDITED_FEATURE_TEXT }),
    feature("f4", "classFeature:wizard/scholar-l2", "學者", 2),
    feature("f5", "classFeature:wizard/wizard-subclass-l3", "法師子職", 3),
    feature("f6", "subclassFeature:wizard/evoker/evocation-savant-l3", "塑能學者", 3),
    feature("f7", "subclassFeature:wizard/evoker/potent-cantrip-l3", "強力戲法", 3),
    feature("f8", "classFeature:wizard/ability-score-improvement-l4", "屬性值提升", 4),
    feature("f9", "classFeature:wizard/memorize-spell-l5", "記憶法術", 5),
  ],
  speciesTraits: [
    { id: "species:elf#darkvision", ref: "species:elf", name: "黑暗視覺", origin: "srd", text: "" },
    { id: "species:elf#fey-ancestry", ref: "species:elf", name: "精類祖源", origin: "srd", text: "" },
    { id: "species:elf#keen-senses", ref: "species:elf", name: "敏銳感官", origin: "srd", text: "" },
    { id: "species:elf#trance", ref: "species:elf", name: "出神", origin: "srd", text: "" },
  ],
  feats: [
    { id: "t1", ref: "feat:magic-initiate", name: "魔法學徒", category: "origin", origin: "srd", text: "" },
    { id: "t2", ref: "feat:ability-score-improvement", name: "屬性值提升", category: "general", origin: "srd", text: "" },
  ],
  languages: [
    { id: "l1", ref: "language:common", name: "通用語", origin: "srd", text: "" },
    { id: "l2", ref: "language:elvish", name: "精靈語", origin: "srd", text: "" },
    { id: "l3", ref: "language:draconic", name: "龍語", origin: "srd", text: "" },
  ],
  toolProficiencies: [],
  equipment: [
    { id: "e1", qty: 1, name: "法術書", equipped: true, ref: "", origin: "custom", text: "" },
    { id: "e2", qty: 1, name: "長棍", equipped: true, ref: "baseItem:quarterstaff", origin: "srd", text: "" },
    { id: "e3", qty: 1, name: "背包", equipped: false, ref: "item:backpack", origin: "srd", text: "" },
    { id: "e4", qty: 10, name: "口糧", equipped: false, ref: "item:rations", origin: "srd", text: "" },
  ],
  spells: [
    spell("s1", 0, "spell:fire-bolt", "火焰箭"),
    spell("s2", 0, "spell:mage-hand", "法師之手"),
    spell("s3", 0, "spell:light", "光亮術"),
    spell("s4", 0, "spell:prestidigitation", "魔法伎倆"),
    spell("s5", 1, "spell:magic-missile", "魔法飛彈"),
    spell("s6", 1, "spell:shield", "護盾術"),
    spell("s7", 1, "spell:detect-magic", "偵測魔法", { prepared: false, ritual: true, concentration: true }),
    spell("s8", 1, "spell:mage-armor", "法師護甲", { material: true }),
    spell("s9", 1, "spell:sleep", "睡眠術", { concentration: true }),
    spell("s10", 1, "spell:feather-fall", "羽落術", { prepared: false, material: true }),
    spell("s11", 1, PACK_SPELL_REF, PACK_SPELL_NAME, { origin: "pack", castingTime: "1 個動作", range: "自身", concentration: true }),
    spell("s12", 2, "spell:misty-step", "迷蹤步"),
    spell("s13", 2, "spell:scorching-ray", "灼熱射線"),
    spell("s14", 2, "spell:invisibility", "隱形術", { prepared: false, concentration: true, material: true }),
    spell("s15", 3, "spell:fireball", "火球術", { material: true }),
    spell("s16", 3, "spell:counterspell", "法術反制"),
    spell("s17", 3, "spell:haste", "加速術", { concentration: true, material: true }),
  ],
  appearance: "銀灰長髮，左手腕上纏著墨水沾染的布條。",
  backstory: "在港都的老書庫長大，追查一本失竊的法術書來到內陸。",
  notes: "",
};

const FIGHTER: Record<string, unknown> = {
  name: "巴倫・鐵砧",
  className: "戰士",
  classId: "fighter",
  level: 1,
  background: "士兵",
  backgroundId: "soldier",
  species: "人類",
  speciesId: "human",
  str: 16, dex: 12, con: 15, int: 10, wis: 13, cha: 8,
  strSaveProf: true, conSaveProf: true,
  athleticsProf: "proficient", intimidationProf: "proficient", perceptionProf: "proficient", survivalProf: "proficient",
  speed: 30,
  armorType: "heavy", armorBase: 16, shield: true,
  hitDieFaces: 10,
  armorLight: true, armorMedium: true, armorHeavy: true, armorShields: true,
  weaponProficiencies: "簡易武器、軍用武器",
  initiativeMisc: 2,
  gp: 14,
  weapons: [
    { id: "w1", name: "長劍", ability: "str", proficient: true, magic: 0, ranged: false, damageDice: "1d8", damageType: "揮砍", mastery: "削弱", notes: "多用（1d10）", ref: "baseItem:longsword", origin: "srd" },
    { id: "w2", name: "標槍", ability: "str", proficient: true, magic: 0, ranged: false, damageDice: "1d6", damageType: "穿刺", mastery: "緩速", notes: "投擲（30/120）", ref: "baseItem:javelin", origin: "srd" },
  ],
  features: [
    feature("f1", "classFeature:fighter/fighting-style-l1", "戰鬥風格", 1),
    feature("f2", "classFeature:fighter/second-wind-l1", "回氣", 1),
    feature("f3", "classFeature:fighter/weapon-mastery-l1", "武器精通", 1),
  ],
  speciesTraits: [
    { id: "species:human#resourceful", ref: "species:human", name: "足智多謀", origin: "srd", text: "" },
    { id: "species:human#skillful", ref: "species:human", name: "多才", origin: "srd", text: "" },
    { id: "species:human#versatile", ref: "species:human", name: "多面手", origin: "srd", text: "" },
  ],
  feats: [
    { id: "t1", ref: "feat:alert", name: "警覺", category: "origin", origin: "srd", text: "" },
    { id: "t2", ref: "feat:defense", name: "防禦", category: "fightingStyle", origin: "srd", text: "" },
  ],
  weaponMasteries: [
    { id: "m1", ref: "baseItem:longsword", name: "長劍", mastery: "削弱", origin: "srd", text: "" },
    { id: "m2", ref: "baseItem:javelin", name: "標槍", mastery: "緩速", origin: "srd", text: "" },
  ],
  languages: [{ id: "l1", ref: "language:common", name: "通用語", origin: "srd", text: "" }],
  equipment: [
    { id: "e1", qty: 1, name: "鍊甲", equipped: true, ref: "baseItem:chain-mail", origin: "srd", text: "" },
    { id: "e2", qty: 1, name: "盾牌", equipped: true, ref: "baseItem:shield", origin: "srd", text: "" },
    { id: "e3", qty: 8, name: "標槍", equipped: false, ref: "baseItem:javelin", origin: "srd", text: "" },
  ],
};

const SPARSE: Record<string, unknown> = { name: "無名的旅人" };

const times = (rows: unknown, count: number) =>
  Array.from({ length: count }, (_, copy) =>
    (rows as Array<Record<string, unknown>>).map((row) => ({ ...row, id: `${String(row.id)}-${copy}` })),
  ).flat();

const CROWDED: Record<string, unknown> = {
  ...WIZARD,
  name: "擠滿的法師",
  features: times(WIZARD.features, 5),
  spells: times(WIZARD.spells, 5),
  equipment: times(WIZARD.equipment, 5),
  feats: times(WIZARD.feats, 5),
};

/** The last of the crowded attacks: page 1 clips it, a later page prints it. */
export const LAST_CROWDED_ATTACK = "長劍・40";

const CROWDED_ATTACKS: Record<string, unknown> = {
  ...FIGHTER,
  name: "擠滿的戰士",
  weapons: Array.from({ length: 40 }, (_, index) => ({
    ...(FIGHTER.weapons as Array<Record<string, unknown>>)[0],
    id: `w${index + 1}`,
    name: `長劍・${String(index + 1).padStart(2, "0")}`,
    notes: "多用（1d10）；劍脊刻著鍛造者的名字與一段長長的誓詞，攻擊表一列放不下而換行。",
  })),
};

/**
 * Identity values far longer than their lines on page 1 (POR-F002): each prints whole, at 7pt, on
 * two lines, or in full under 「身分（續）」. Mixed scripts, so a word wrap and a CJK wrap both happen.
 */
export const LONG_IDENTITY = {
  name: "Seraphina Ilvarenne Moonwhisper-Ashvale，銀葉氏族最後的守望者",
  background: "在北方荒原邊境的古老修道院中長大的抄寫員",
  className: "法師",
  subclass: "塑能師：星界裂隙與虛空迴響之研究者的傳承，師從流亡的星象學者 Aurelio Vantecross，以筆記與觀星儀記錄每一次裂隙的開合",
  species: "精靈",
  lineage: "高等精靈血統（銀月森林的遺民）",
  player: "一位名字很長的玩家",
} as const;

const LONG_IDENTITY_SHEET: Record<string, unknown> = { ...LONG_IDENTITY, classId: "wizard", speciesId: "elf", level: 1 };

const BARBARIAN: Record<string, unknown> = {
  name: "測試",
  player: "洪偉",
  className: "野蠻人",
  classId: "barbarian",
  level: 1,
  background: "貴族",
  backgroundId: "noble",
  species: "龍裔",
  speciesId: "dragonborn",
  lineage: "黃銅",
  lineageId: "dragonborn/brass",
  alignment: "neutral",
  size: "medium",
  str: 18, dex: 12, con: 13, int: 11, wis: 14, cha: 14,
  strSaveProf: true, conSaveProf: true,
  animalHandlingProf: "proficient", athleticsProf: "proficient", historyProf: "proficient",
  medicineProf: "proficient", natureProf: "proficient", persuasionProf: "proficient",
  speed: 30,
  darkvision: 60,
  hitDieFaces: 12,
  unarmoredDefense: "barbarian",
  armorLight: true, armorMedium: true, armorShields: true,
  weaponProficiencies: "簡易武器與軍用武器",
  gp: 125,
  features: [
    feature("f1", "classFeature:barbarian/rage-l1", "狂暴", 1),
    feature("f2", "classFeature:barbarian/unarmored-defense-l1", "無甲防禦", 1),
    feature("f3", "classFeature:barbarian/weapon-mastery-l1", "武器精通", 1),
  ],
  speciesTraits: [
    { id: "species:dragonborn#draconic-ancestry", ref: "species:dragonborn", name: "龍族祖源", origin: "srd", text: "" },
    { id: "species:dragonborn#breath-weapon", ref: "species:dragonborn", name: "吐息武器", origin: "srd", text: "" },
    { id: "species:dragonborn#damage-resistance", ref: "species:dragonborn", name: "傷害抗性", origin: "srd", text: "" },
    { id: "species:dragonborn#darkvision", ref: "species:dragonborn", name: "黑暗視覺", origin: "srd", text: "" },
    { id: "species:dragonborn#draconic-flight", ref: "species:dragonborn", name: "龍族飛行", origin: "srd", text: "" },
    { id: "lineage:dragonborn/brass", ref: "lineage:dragonborn/brass", name: "黃銅", origin: "srd", text: "" },
  ],
  feats: [{ id: "t1", ref: "feat:skilled", name: "熟習", category: "origin", origin: "srd", text: "" }],
  weaponMasteries: [
    { id: "m1", ref: "baseItem:light-crossbow", name: "輕弩", mastery: "緩速", origin: "srd", text: "" },
    { id: "m2", ref: "baseItem:club", name: "短棒", mastery: "緩速", origin: "srd", text: "" },
  ],
  toolProficiencies: [
    { id: "o1", ref: "baseItem:drum", name: "鼓", origin: "srd", text: "" },
    { id: "o2", ref: "item:dragonchess-set", name: "龍棋組", origin: "srd", text: "" },
  ],
  languages: [
    { id: "l1", ref: "language:common", name: "通用語", origin: "srd", text: "" },
    { id: "l2", ref: "language:elvish", name: "精靈語", origin: "srd", text: "" },
    { id: "l3", ref: "language:gnomish", name: "侏儒語", origin: "srd", text: "" },
  ],
  equipment: [
    { id: "e1", qty: 1, name: "板甲", equipped: true, ref: "baseItem:plate-armor", origin: "srd", text: "" },
    { id: "e2", qty: 1, name: "鍊甲衫", equipped: true, ref: "baseItem:chain-shirt", origin: "srd", text: "" },
  ],
};

/** The heavy wizard's backstory: four paragraphs, more than page 2's box holds. */
export const HEAVY_BACKSTORY = [
  "瑟蕾絲在銀月城的大圖書館長大，養父是一位研究失落帝國文字的年老抄寫員。十二歲那年，她在一本被蟲蛀的手稿裡讀出了一道沒人能解的火焰咒文，從此被法師學院收為學徒。",
  "她在學院待了將近八十年，專攻塑能學派，卻始終對一件事耿耿於懷：養父臨終前交給她一枚刻著陌生紋章的銅戒，說那是她親生父母留下的唯一線索。",
  "個性：好奇、急躁，講話又快又直；遇到不懂的文字會忘記吃飯。理想：知識應該屬於所有人（善良）。羈絆：銅戒與養父的手稿。缺點：太相信書上寫的東西，常低估現場的危險。",
  "第一次冒險時，她在地底神殿救下了矮人戰士博林；兩人約定，等找到銅戒的來歷，就一起回到銀月城把那份手稿抄完。最近她在港口的黑市看到同樣的紋章出現在一批走私的魔法卷軸上，決定沿著這條線索往南追查。",
].join("\n");

const HEAVY: Record<string, unknown> = {
  name: "瑟蕾絲・月歌",
  player: "洪偉",
  className: "法師",
  classId: "wizard",
  subclass: "塑能師",
  level: 9,
  xp: 48000,
  background: "智者",
  backgroundId: "sage",
  species: "精靈",
  speciesId: "elf",
  lineage: "高等精靈",
  lineageId: "elf/high-elf-lineage",
  alignment: "neutralGood",
  str: 8, dex: 14, con: 14, int: 20, wis: 12, cha: 10,
  intSaveProf: true, wisSaveProf: true,
  arcanaProf: "expertise", historyProf: "proficient", investigationProf: "proficient", insightProf: "proficient", perceptionProf: "proficient",
  speed: 30,
  darkvision: 60,
  heroicInspiration: true,
  acMisc: 1,
  hitDieFaces: 6,
  hp: { current: 41 },
  hpTemp: 5,
  hitDiceSpent: 3,
  concentration: "spell:fly",
  weaponProficiencies: "簡易武器",
  spellAbility: "int",
  slot1Total: 4, slot1Used: 2, slot2Total: 3, slot2Used: 1, slot3Total: 3, slot3Used: 1, slot4Total: 3, slot5Total: 1,
  cp: 3, sp: 45, gp: 312, pp: 4,
  attunement1: "防護斗篷",
  attunement2: "魔法飛彈魔杖",
  weapons: [
    { id: "w1", name: "匕首", ability: "dex", proficient: true, magic: 0, ranged: false, damageDice: "1d4", damageType: "穿刺", mastery: "迅擊", notes: "輕型、靈巧、投擲 20/60", ref: "baseItem:dagger", origin: "srd" },
    { id: "w2", name: "長棍", ability: "str", proficient: true, magic: 0, ranged: false, damageDice: "1d6", damageType: "鈍擊", mastery: "推離", notes: "多用途（1d8）", ref: "baseItem:quarterstaff", origin: "srd" },
  ],
  features: [
    feature("f1", "classFeature:wizard/spellcasting-l1", "施法", 1),
    feature("f2", "classFeature:wizard/ritual-adept-l1", "儀式學家", 1),
    feature("f3", "classFeature:wizard/arcane-recovery-l1", "奧術回想", 1),
    feature("f4", "classFeature:wizard/scholar-l2", "學者", 2),
    feature("f5", "subclassFeature:wizard/evoker/evocation-savant-l3", "塑能學者", 3),
    feature("f6", "subclassFeature:wizard/evoker/potent-cantrip-l3", "強力戲法", 3),
    feature("f7", "classFeature:wizard/memorize-spell-l5", "記憶法術", 5),
    feature("f8", "subclassFeature:wizard/evoker/sculpt-spells-l6", "法術塑形", 6),
  ],
  speciesTraits: [
    { id: "species:elf#darkvision", ref: "species:elf", name: "黑暗視覺", origin: "srd", text: "" },
    { id: "species:elf#elven-lineage", ref: "species:elf", name: "精靈血統", origin: "srd", text: "" },
    { id: "species:elf#fey-ancestry", ref: "species:elf", name: "精類祖源", origin: "srd", text: "" },
    { id: "species:elf#keen-senses", ref: "species:elf", name: "敏銳感官", origin: "srd", text: "" },
    { id: "species:elf#trance", ref: "species:elf", name: "出神", origin: "srd", text: "" },
    { id: "lineage:elf/high-elf-lineage", ref: "lineage:elf/high-elf-lineage", name: "高等精靈", origin: "srd", text: "" },
  ],
  feats: [
    { id: "t1", ref: "feat:magic-initiate", name: "魔法學徒", category: "origin", origin: "srd", text: "" },
    { id: "t2", ref: "feat:ability-score-improvement", name: "屬性值提升", category: "general", origin: "srd", text: "" },
    { id: "t3", ref: "feat:alert", name: "警覺", category: "origin", origin: "srd", text: "" },
  ],
  toolProficiencies: [{ id: "o1", ref: "baseItem:calligraphers-supplies", name: "書法用具", origin: "srd", text: "" }],
  languages: ["通用語", "精靈語", "龍語", "矮人語", "天界語"].map((name, index) => ({ id: `l${index + 1}`, ref: "", name, origin: "custom", text: "" })),
  equipment: [
    { id: "e1", qty: 1, name: "長棍", equipped: true, ref: "baseItem:quarterstaff", origin: "srd", text: "" },
    { id: "e2", qty: 2, name: "匕首", equipped: true, ref: "baseItem:dagger", origin: "srd", text: "" },
    { id: "e3", qty: 1, name: "法術書", equipped: false, weight: 3, ref: "", origin: "custom", text: "" },
    { id: "e4", qty: 1, name: "奧術法器（水晶）", equipped: true, ref: "baseItem:crystal", origin: "srd", text: "" },
    { id: "e5", qty: 1, name: "法袍", equipped: true, ref: "item:robe", origin: "srd", text: "" },
    { id: "e6", qty: 1, name: "背包", equipped: false, ref: "item:backpack", origin: "srd", text: "" },
    { id: "e7", qty: 1, name: "書法用具", equipped: false, ref: "baseItem:calligraphers-supplies", origin: "srd", text: "" },
    { id: "e8", qty: 10, name: "羊皮紙", equipped: false, ref: "item:parchment", origin: "srd", text: "" },
    { id: "e9", qty: 1, name: "防護斗篷", equipped: true, weight: 1, ref: "item:cloak-of-protection", origin: "srd", text: "" },
    { id: "e10", qty: 1, name: "防護戒指", equipped: false, weight: 0, ref: "item:ring-of-protection", origin: "srd", text: "" },
    { id: "e11", qty: 1, name: "魔法飛彈魔杖", equipped: true, weight: 1, ref: "item:wand-of-magic-missiles", origin: "srd", text: "" },
    { id: "e12", qty: 3, name: "治療藥水", equipped: false, ref: "item:potion-of-healing", origin: "srd", text: "" },
    { id: "e13", qty: 1, name: "材料包", equipped: true, ref: "item:component-pouch", origin: "srd", text: "" },
    { id: "e14", qty: 1, name: "鑲珍珠的鑑定術材料（100 gp）", equipped: false, weight: 0, ref: "", origin: "custom", text: "" },
  ],
  spells: [
    spell("h1", 0, "spell:fire-bolt", "火焰箭"),
    spell("h2", 0, "spell:ray-of-frost", "寒冰射線"),
    spell("h3", 0, "spell:shocking-grasp", "電爪術"),
    spell("h4", 0, "spell:acid-splash", "酸液飛濺"),
    spell("h5", 0, "spell:mage-hand", "法師之手"),
    spell("h6", 0, "spell:light", "光亮術", { source: "magic-initiate", material: true, notes: "魔法學徒（法師）" }),
    spell("h7", 0, "spell:prestidigitation", "魔法伎倆", { notes: "高等精靈血統" }),
    spell("h8", 1, "spell:detect-magic", "偵測魔法", { source: "species", concentration: true, ritual: true, notes: "高等精靈；每長休免費 1 次" }),
    spell("h9", 1, "spell:mage-armor", "法師護甲", { material: true, notes: "已施放，AC 15" }),
    spell("h10", 1, "spell:magic-missile", "魔法飛彈"),
    spell("h11", 1, "spell:shield", "護盾術", { notes: "反應" }),
    spell("h12", 1, "spell:find-familiar", "獲得魔寵", { prepared: false, ritual: true, material: true }),
    spell("h13", 1, "spell:identify", "鑑定術", { prepared: false, ritual: true, material: true }),
    spell("h14", 1, "spell:feather-fall", "羽落術", { material: true, notes: "反應" }),
    spell("h15", 1, "spell:thunderwave", "雷鳴波", { prepared: false }),
    spell("h16", 1, "spell:sleep", "睡眠術", { prepared: false, concentration: true, material: true }),
    spell("h17", 1, "spell:grease", "油膩術", { prepared: false, material: true }),
    spell("h18", 1, "spell:alarm", "警報術", { prepared: false, ritual: true, material: true, notes: "卷軸抄錄" }),
    spell("h19", 1, "spell:comprehend-languages", "通曉語言", { prepared: false, ritual: true, material: true, notes: "卷軸抄錄" }),
    spell("h20", 1, "spell:unseen-servant", "隱形僕役", { prepared: false, ritual: true, material: true, notes: "卷軸抄錄" }),
    spell("h21", 1, "spell:fog-cloud", "雲霧術", { prepared: false, concentration: true, notes: "卷軸抄錄" }),
    spell("h22", 2, "spell:misty-step", "迷蹤步", { source: "species", notes: "高等精靈；每長休免費 1 次" }),
    spell("h23", 2, "spell:scorching-ray", "灼熱射線"),
    spell("h24", 2, "spell:invisibility", "隱形術", { prepared: false, concentration: true, material: true }),
    spell("h25", 2, "spell:web", "蛛網術", { concentration: true, material: true }),
    spell("h26", 2, "spell:mirror-image", "鏡影術", { prepared: false }),
    spell("h27", 2, "spell:knock", "敲擊術", { prepared: false, notes: "卷軸抄錄" }),
    spell("h28", 2, "spell:levitate", "浮空術", { prepared: false, concentration: true, material: true, notes: "卷軸抄錄" }),
    spell("h29", 2, "spell:see-invisibility", "識破隱形", { prepared: false, material: true, notes: "卷軸抄錄" }),
    spell("h30", 2, "spell:hold-person", "人類定身術", { prepared: false, concentration: true, material: true, notes: "卷軸抄錄" }),
    spell("h31", 3, "spell:fireball", "火球術", { material: true, notes: "塑能師：法術塑形保護同伴" }),
    spell("h32", 3, "spell:counterspell", "法術反制", { notes: "反應" }),
    spell("h33", 3, "spell:fly", "飛行術", { concentration: true, material: true }),
    spell("h34", 3, "spell:dispel-magic", "解除魔法", { prepared: false }),
    spell("h35", 3, "spell:lightning-bolt", "閃電束", { prepared: false, material: true }),
    spell("h36", 3, "spell:haste", "加速術", { prepared: false, concentration: true, material: true }),
    spell("h37", 3, "spell:clairvoyance", "千里眼/順風耳", { prepared: false, concentration: true, material: true, notes: "卷軸抄錄" }),
    spell("h38", 3, "spell:tongues", "巧言術", { prepared: false, material: true, notes: "卷軸抄錄" }),
    spell("h39", 3, "spell:slow", "緩慢術", { prepared: false, concentration: true, material: true, notes: "卷軸抄錄" }),
    spell("h40", 4, "spell:polymorph", "變形術", { concentration: true, material: true }),
    spell("h41", 4, "spell:greater-invisibility", "高等隱形術", { prepared: false, concentration: true }),
    spell("h42", 4, "spell:ice-storm", "冰風暴", { prepared: false, material: true }),
    spell("h43", 4, "spell:stoneskin", "石膚術", { prepared: false, concentration: true, material: true, notes: "卷軸抄錄" }),
    spell("h44", 4, "spell:wall-of-fire", "火牆術", { prepared: false, concentration: true, material: true, notes: "卷軸抄錄" }),
    spell("h45", 5, "spell:telekinesis", "心靈遙控", { prepared: false, concentration: true }),
    spell("h46", 5, "spell:cone-of-cold", "寒冰錐", { material: true }),
    spell("h47", 5, "spell:wall-of-force", "力牆術", { prepared: false, concentration: true, material: true, notes: "卷軸抄錄" }),
  ],
  appearance: "銀白長髮編成髮辮，左頰有一道淡淡的灼痕。總穿深藍法袍，袖口繡著星圖。",
  backstory: HEAVY_BACKSTORY,
};

export function dndPrintOverrides(fixture: DndPrintFixture): Record<string, unknown> {
  const fixtures = { wizard: WIZARD, fighter: FIGHTER, sparse: SPARSE, crowded: CROWDED, crowdedAttacks: CROWDED_ATTACKS, barbarian: BARBARIAN, heavy: HEAVY, longIdentity: LONG_IDENTITY_SHEET };
  return structuredClone(fixtures[fixture]);
}

/**
 * The made-up content pack the wizard's pack spell comes from, as this device's cache keeps it
 * (`skald-content-packs` / `packs`, `CachedPack.pack`). No real pack text: the e2e seeds it.
 */
export const PRINT_PACK = {
  manifest: { id: "print-fixture-pack", systemId: "dnd5e-2024", payloadSha256: "print-fixture-sha" },
  entries: [
    {
      kind: "spell",
      id: "lantern-of-quiet-ash",
      ref: PACK_SPELL_REF,
      name: "Lantern of Quiet Ash",
      source: "XPHB",
      srd52: false,
      basicRules2024: false,
      entries: [`${PACK_SPELL_TEXT_EN}. While it burns, you have Advantage on checks to notice hidden doors.`],
      meta: {
        level: 1,
        school: "D",
        time: [{ number: 1, unit: "action" }],
        range: { type: "point", distance: { type: "self" } },
        components: { v: true, s: true },
        duration: [{ type: "timed", duration: { type: "minute", amount: 10 }, concentration: true }],
        concentration: true,
        ritual: false,
      },
    },
  ],
  zhTW: {
    [PACK_SPELL_REF]: { name: PACK_SPELL_NAME, entries: [`${PACK_SPELL_TEXT_ZH}。提燈燃著時，你察覺暗門的檢定具有優勢。`] },
  },
  wizard: {},
  overlays: {},
};
