import type {
  EncryptedMutation,
  SyncRecordType,
} from "./sync-outbox.types";

export type LocalRecordType = Exclude<
  SyncRecordType,
  "brain_dump_update"
>;

export type LocalRecordChange =
  | {
      operation: "upsert";
      recordId: string;
      recordType: LocalRecordType;
      value: unknown;
    }
  | {
      operation: "delete";
      recordId: string;
      recordType: LocalRecordType;
    };

export interface DurableRecordWrite {
  local: LocalRecordChange;
  mutation?: EncryptedMutation;
}

export interface DurableRecordWriter {
  commit(writes: DurableRecordWrite[]): Promise<void>;
  initialize(): Promise<void>;
}

export function assertDurableRecordWrites(
  namespace: string,
  writes: DurableRecordWrite[],
) {
  const mutationIds = new Set<string>();
  for (const write of writes) {
    const { local, mutation } = write;
    if (!local.recordId || !isLocalRecordType(local.recordType)) {
      throw new Error("The local record change is invalid.");
    }
    if (
      local.operation === "delete" &&
      (local.recordType === "check_in" || local.recordType === "settings")
    ) {
      throw new Error(
        `Local ${local.recordType} deletion is not supported.`,
      );
    }
    if (local.operation === "upsert") {
      if (
        !local.value ||
        typeof local.value !== "object" ||
        !("id" in local.value) ||
        local.value.id !== local.recordId
      ) {
        throw new Error("The local record ID does not match its value.");
      }
    }
    if (!mutation) continue;
    if (
      mutation.userId !== namespace ||
      !mutation.id ||
      mutationIds.has(mutation.id)
    ) {
      throw new Error("The encrypted mutation owner or ID is invalid.");
    }
    mutationIds.add(mutation.id);
  }
}

function isLocalRecordType(value: string): value is LocalRecordType {
  return (
    value === "task" ||
    value === "brain_dump_bullet" ||
    value === "check_in" ||
    value === "template" ||
    value === "settings"
  );
}
