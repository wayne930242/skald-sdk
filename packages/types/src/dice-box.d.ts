declare module "@3d-dice/dice-box" {
  export interface DiceBoxConfig {
    assetPath: string;
    container: string;
    theme?: string;
    scale?: number;
    gravity?: number;
    mass?: number;
    friction?: number;
    restitution?: number;
    linearDamping?: number;
    angularDamping?: number;
    spinForce?: number;
    throwForce?: number;
    startingHeight?: number;
    settleTimeout?: number;
  }

  export interface DiceResult {
    value: number;
    sides: number;
    groupId: number;
    rollId: number;
    theme?: string;
  }

  export interface RollResult {
    notation: string;
    total: number;
    rolls: DiceResult[];
  }

  export default class DiceBox {
    constructor(config: DiceBoxConfig);
    init(): Promise<void>;
    roll(notation: string): Promise<RollResult[]>;
    clear(): void;
  }
}
