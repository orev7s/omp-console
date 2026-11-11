import { readJson, writeJsonAtomic } from "../util/atomic-json.js";
import { randomId } from "../util/id.js";
import { STORE_SCHEMA_VERSION, type StoreData } from "./types.js";

export function defaultStoreData(): StoreData {
  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    serverId: randomId(12),
    pairing: { codeHash: null, expiresAt: null },
    devices: [],
  };
}

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
    const data = await readJson<StoreData>(path, defaultStoreData());
    // Tolerate forward-compatible files by filling missing fields.
    const merged: StoreData = {
      schemaVersion: STORE_SCHEMA_VERSION,
      serverId: data.serverId ?? randomId(12),
      pairing: data.pairing ?? { codeHash: null, expiresAt: null },
      devices: Array.isArray(data.devices) ? data.devices : [],
    };
    return new Store(path, merged);
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
