import type { NameProvider } from '../index';

/** Use the locale's own order, spacing and forms of address. Never load the all-locales entry. */
export const humanName: NameProvider = async (locale, seed) => {
  const { faker } = locale === 'zh-TW'
    ? await import('@faker-js/faker/locale/zh_TW')
    : await import('@faker-js/faker/locale/en');
  // No await between seed and draw: each call consumes its own deterministic sequence.
  faker.seed(seed);
  return faker.person.fullName();
};
