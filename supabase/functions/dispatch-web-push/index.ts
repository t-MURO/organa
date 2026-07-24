import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const schedulerSecret = Deno.env.get("WEB_PUSH_SCHEDULER_SECRET");
const vapidPublicKey = Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY");
const vapidPrivateKey = Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY");
const vapidSubject = Deno.env.get("WEB_PUSH_VAPID_SUBJECT");
const localTestMode =
  Deno.env.get("WEB_PUSH_TEST_MODE") === "local-only" &&
  Boolean(
    supabaseUrl?.startsWith("http://127.0.0.1") ||
      supabaseUrl?.startsWith("http://localhost") ||
      supabaseUrl?.startsWith("http://kong:"),
  );

interface ClaimedReminder {
  attempts: number;
  auth_secret: string;
  endpoint: string;
  id: string;
  p256dh: string;
  reminder_key: string;
  repeat_local_time: string | null;
  route: string;
  subscription_id: string;
  time_zone: string | null;
}

Deno.serve(async (request) => {
  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !schedulerSecret ||
    !vapidPublicKey ||
    !vapidPrivateKey ||
    !vapidSubject
  ) {
    return json({ error: "Function secrets are incomplete." }, 500);
  }
  if (request.headers.get("authorization") !== `Bearer ${schedulerSecret}`) {
    return json({ error: "Unauthorized." }, 401);
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405, { allow: "POST" });
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const claimed = await client.rpc("claim_due_web_push_reminders", {
    p_limit: 100,
  });
  if (claimed.error) return json({ error: claimed.error.message }, 500);

  const totals = {
    delivered: 0,
    expiredSubscriptions: 0,
    failed: 0,
    processed: claimed.data.length,
    retried: 0,
    testMode: localTestMode,
  };

  for (const reminder of claimed.data as ClaimedReminder[]) {
    try {
      await sendReminder(reminder);
      await completeReminder(client, reminder);
      totals.delivered += 1;
    } catch (error) {
      const statusCode = pushStatusCode(error);
      if (statusCode === 404 || statusCode === 410) {
        const removal = await client
          .from("web_push_subscriptions")
          .delete()
          .eq("id", reminder.subscription_id);
        if (removal.error) totals.failed += 1;
        else totals.expiredSubscriptions += 1;
        continue;
      }

      if (reminder.attempts >= 5) {
        const removal = await client
          .from("web_push_reminders")
          .delete()
          .eq("id", reminder.id);
        if (removal.error) totals.failed += 1;
        else totals.failed += 1;
        continue;
      }

      const retry = await client
        .from("web_push_reminders")
        .update({
          claimed_at: null,
          fire_at: new Date(Date.now() + 5 * 60 * 1_000).toISOString(),
          last_error_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", reminder.id);
      if (retry.error) totals.failed += 1;
      else totals.retried += 1;
    }
  }

  return json(totals);
});

async function sendReminder(reminder: ClaimedReminder) {
  if (localTestMode) return;
  await webpush.sendNotification(
    {
      endpoint: reminder.endpoint,
      keys: {
        auth: reminder.auth_secret,
        p256dh: reminder.p256dh,
      },
    },
    JSON.stringify({
      route: reminder.route,
      tag: reminder.reminder_key,
    }),
    {
      TTL: 60 * 60,
      topic: reminder.id.replaceAll("-", "").slice(0, 32),
      urgency: "normal",
      vapidDetails: {
        privateKey: vapidPrivateKey!,
        publicKey: vapidPublicKey!,
        subject: vapidSubject!,
      },
    },
  );
}

async function completeReminder(
  client: ReturnType<typeof createClient>,
  reminder: ClaimedReminder,
) {
  if (reminder.repeat_local_time && reminder.time_zone) {
    const next = nextDailyLocalOccurrence(
      new Date(),
      reminder.repeat_local_time,
      reminder.time_zone,
    );
    const update = await client
      .from("web_push_reminders")
      .update({
        attempts: 0,
        claimed_at: null,
        fire_at: next.toISOString(),
        last_error_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", reminder.id);
    if (update.error) throw update.error;
    return;
  }

  const removal = await client
    .from("web_push_reminders")
    .delete()
    .eq("id", reminder.id);
  if (removal.error) throw removal.error;
}

function nextDailyLocalOccurrence(
  now: Date,
  localTime: string,
  timeZone: string,
) {
  const [hours, minutes] = localTime.split(":").map(Number);
  const today = zonedParts(now, timeZone);
  let candidate = localDateTimeToInstant(
    today.year,
    today.month,
    today.day,
    hours,
    minutes,
    timeZone,
  );
  if (candidate.getTime() > now.getTime()) return candidate;

  const tomorrow = new Date(
    Date.UTC(today.year, today.month - 1, today.day + 1),
  );
  candidate = localDateTimeToInstant(
    tomorrow.getUTCFullYear(),
    tomorrow.getUTCMonth() + 1,
    tomorrow.getUTCDate(),
    hours,
    minutes,
    timeZone,
  );
  return candidate;
}

function localDateTimeToInstant(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timeZone: string,
) {
  const target = Date.UTC(year, month - 1, day, hours, minutes);
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rendered = zonedParts(new Date(guess), timeZone);
    const renderedValue = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hours,
      rendered.minutes,
    );
    guess += target - renderedValue;
  }
  return new Date(guess);
}

function zonedParts(value: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric",
    })
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    day: parts.day!,
    hours: parts.hour!,
    minutes: parts.minute!,
    month: parts.month!,
    year: parts.year!,
  };
}

function pushStatusCode(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }
  return undefined;
}

function json(
  value: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(value), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
    status,
  });
}
