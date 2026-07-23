import type { ContentKey } from "@organa/crypto";

export interface ContentKeyVault {
  get(userId: string): Promise<ContentKey | null>;
  set(userId: string, key: ContentKey): Promise<void>;
  remove(userId: string): Promise<void>;
}
