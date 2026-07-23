import type { BrainDumpBullet } from "@organa/domain";
import { fromByteArray, toByteArray } from "base64-js";
import type { Text as YText } from "yjs";

type YjsModule = typeof import("yjs");

let yjsModule: YjsModule | undefined;

export interface BrainDumpCrdtUpdate {
  bulletId: string;
  createdAt: string;
  id: string;
  update: string;
}

export function initializeCrdtBullet(bullet: BrainDumpBullet) {
  const Y = getYjs();
  const doc = new Y.Doc();
  const text = doc.getText("text");
  if (bullet.text) text.insert(0, bullet.text);
  return {
    ...bullet,
    crdtState: encode(Y.encodeStateAsUpdate(doc)),
  };
}

export function editCrdtBullet(
  bullet: BrainDumpBullet,
  nextText: string,
  updateId: string,
  now = new Date(),
) {
  const Y = getYjs();
  const doc = documentFromBullet(bullet);
  const text = doc.getText("text");
  let incremental = new Uint8Array();
  doc.on("update", (update) => {
    incremental = Uint8Array.from(update);
  });

  applyTextDifference(text, nextText.replace(/\s*\r?\n+\s*/g, " "));
  const timestamp = now.toISOString();
  const nextBullet = {
    ...bullet,
    crdtState: encode(Y.encodeStateAsUpdate(doc)),
    text: text.toString(),
    updatedAt: timestamp,
  };
  return {
    bullet: nextBullet,
    update: {
      bulletId: bullet.id,
      createdAt: timestamp,
      id: updateId,
      update: encode(incremental),
    } satisfies BrainDumpCrdtUpdate,
  };
}

export function applyCrdtUpdate(
  bullet: BrainDumpBullet,
  update: BrainDumpCrdtUpdate,
) {
  const Y = getYjs();
  const doc = documentFromBullet(bullet);
  Y.applyUpdate(doc, decode(update.update));
  return {
    ...bullet,
    crdtState: encode(Y.encodeStateAsUpdate(doc)),
    text: doc.getText("text").toString(),
    updatedAt:
      update.createdAt > bullet.updatedAt ? update.createdAt : bullet.updatedAt,
  };
}

export function mergeCrdtBullets(
  local: BrainDumpBullet | undefined,
  incoming: BrainDumpBullet,
) {
  const Y = getYjs();
  if (!local) return ensureCrdtBullet(incoming);
  const localDoc = documentFromBullet(local);
  const incomingDoc = documentFromBullet(incoming);
  Y.applyUpdate(localDoc, Y.encodeStateAsUpdate(incomingDoc));
  const metadata = incoming.updatedAt > local.updatedAt ? incoming : local;
  return {
    ...metadata,
    crdtState: encode(Y.encodeStateAsUpdate(localDoc)),
    text: localDoc.getText("text").toString(),
  };
}

export function isValidBrainDumpCrdtState(value: string) {
  try {
    const Y = getYjs();
    const doc = new Y.Doc();
    Y.applyUpdate(doc, decode(value));
    return true;
  } catch {
    return false;
  }
}

function ensureCrdtBullet(bullet: BrainDumpBullet) {
  return bullet.crdtState ? bullet : initializeCrdtBullet(bullet);
}

function documentFromBullet(bullet: BrainDumpBullet) {
  const Y = getYjs();
  const doc = new Y.Doc();
  if (bullet.crdtState) {
    Y.applyUpdate(doc, decode(bullet.crdtState));
  } else if (bullet.text) {
    doc.getText("text").insert(0, bullet.text);
  }
  return doc;
}

function applyTextDifference(text: YText, next: string) {
  const current = text.toString();
  let prefix = 0;
  while (
    prefix < current.length &&
    prefix < next.length &&
    current[prefix] === next[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < current.length - prefix &&
    suffix < next.length - prefix &&
    current[current.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const removed = current.length - prefix - suffix;
  const inserted = next.slice(prefix, next.length - suffix);
  docTransaction(text, () => {
    if (removed > 0) text.delete(prefix, removed);
    if (inserted) text.insert(prefix, inserted);
  });
}

function docTransaction(text: YText, change: () => void) {
  if (text.doc) {
    text.doc.transact(change);
  } else {
    change();
  }
}

function encode(value: Uint8Array) {
  return fromByteArray(value);
}

function decode(value: string) {
  return toByteArray(value);
}

function getYjs() {
  yjsModule ??= require("yjs") as YjsModule;
  return yjsModule;
}
