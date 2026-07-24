import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";

import webpush from "web-push";

const vapid = webpush.generateVAPIDKeys();
const subscriptionKey = createECDH("prime256v1");
subscriptionKey.generateKeys();
const subscription = {
  endpoint: "https://push.example.test/subscription",
  keys: {
    auth: randomBytes(16).toString("base64url"),
    p256dh: subscriptionKey.getPublicKey().toString("base64url"),
  },
};
const plaintext = JSON.stringify({
  route: "/focus?taskId=opaque-task",
  tag: "task:at-due",
});
const request = webpush.generateRequestDetails(subscription, plaintext, {
  TTL: 60 * 60,
  contentEncoding: "aes128gcm",
  topic: "organa-protocol-check",
  urgency: "normal",
  vapidDetails: {
    privateKey: vapid.privateKey,
    publicKey: vapid.publicKey,
    subject: "mailto:web-push-test@example.test",
  },
});

assert.equal(request.endpoint, subscription.endpoint);
assert.equal(request.method, "POST");
assert.equal(request.headers["Content-Encoding"], "aes128gcm");
assert.equal(request.headers.TTL, 3600);
assert.match(request.headers.Authorization, /^vapid t=/);
assert.ok(Buffer.isBuffer(request.body));
assert.ok(request.body.length > Buffer.byteLength(plaintext));
assert.equal(request.body.includes(Buffer.from(plaintext)), false);

console.log(
  "Web Push protocol verification passed (encrypted payload and VAPID headers).",
);
