/** A provider proposes a name; only the calling field can accept or persist it. */
export interface NameProvider {
  (locale: string, seed: number): Promise<string>;
}

export { humanName } from './domain/human-name';
