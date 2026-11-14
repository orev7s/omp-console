import { readJson, writeJsonAtomic } from "../util/atomic-json.js";
import { defaultStoreData, migrateStore } from "./migrate.js";
import type { StoreData } from "./types.js";

export { defaultStoreData } from "./migrate.js";
export { STORE_SCHEMA_VERSION } from "./types.js";
export type {
  DeviceRecord,
  PairingCodeRecord,
  ProjectRecord,
  StoreData,
} from "./types.js";

/**
 * Small persisted state with atomic writes and serialized saves. Phase 1 data
 * is tiny; a database is introduced later only when justified.
 */
export class Store {
  private saveChain: Promise<void> = Promise.resolve();

  private constructor(
    private readonly path: string,
    private readonly state: StoreData,
  ) {}

  static async open(path: string): Promise<Store> {
    const raw = await readJson<unknown>(path, defaultStoreData());
    return new Store(path, migrateStore(raw));
  }

  get data(): StoreData {
    return this.state;
  }

  async update(mutator: (state: StoreData) => void): Promise<void> {
    mutator(this.state);
    await this.save();
  }

  async save(): Promise<void> {
    const snapshot = JSON.parse(JSON.stringify(this.state)) as StoreData;
    this.saveChain = this.saveChain.then(() => writeJsonAtomic(this.path, snapshot));
    return this.saveChain;
  }
}
