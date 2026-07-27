import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.8";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
const expoPushUrl = "https://exp.host/--/api/v2/push/send";
const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

interface ApprovalPushRequest {
  deviceId: string;
  deviceProof: string;
}

interface ExpoPushTicket {
  details?: { error?: string };
  status?: string;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405, { allow: "POST" });
  }
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Function server secrets are incomplete." }, 500);
  }

  const accessToken = readAccessToken(request);
  if (!accessToken) return json({ error: "Unauthorized." }, 401);

  const body = await readRequest(request);
  if (!body) return json({ error: "Invalid approval request." }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userResult = await admin.auth.getUser(accessToken);
  if (userResult.error || !userResult.data.user) {
    return json({ error: "Unauthorized." }, 401);
  }

  const claimed = await admin.rpc("claim_device_approval_push", {
    p_device_id: body.deviceId,
    p_device_proof: body.deviceProof,
    p_user_id: userResult.data.user.id,
  });
  if (claimed.error) return json({ error: claimed.error.message }, 500);

  const tokens = (claimed.data as Array<{ expo_push_token?: unknown }>)
    .map((row) =>
      typeof row.expo_push_token === "string"
        ? row.expo_push_token
        : undefined,
    )
    .filter((token): token is string => Boolean(token));
  if (tokens.length === 0) {
    return json({ queued: 0 });
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json",
  };
  if (expoAccessToken) {
    headers.Authorization = `Bearer ${expoAccessToken}`;
  }

  const response = await fetch(expoPushUrl, {
    body: JSON.stringify(
      tokens.map((token) => ({
        body: "Open Organa to review the trusted-device request.",
        channelId: "device-approvals",
        data: { route: "/account", type: "device_approval" },
        priority: "high",
        sound: null,
        title: "Approve a new Organa device",
        to: token,
        ttl: 15 * 60,
      })),
    ),
    headers,
    method: "POST",
  });
  const result = await response.json().catch(() => undefined);
  if (!response.ok) {
    return json({ error: "Expo rejected the push request." }, 502);
  }

  const tickets = Array.isArray(result?.data)
    ? (result.data as ExpoPushTicket[])
    : [];
  const expiredTokens = tokens.filter(
    (_, index) =>
      tickets[index]?.status === "error" &&
      tickets[index]?.details?.error === "DeviceNotRegistered",
  );
  if (expiredTokens.length > 0) {
    await admin
      .from("device_push_tokens")
      .delete()
      .in("expo_push_token", expiredTokens);
  }

  return json({
    queued: tickets.filter((ticket) => ticket.status === "ok").length,
  });
});

function readAccessToken(request: Request) {
  const header = request.headers.get("authorization");
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(header ?? "");
  return match?.[1];
}

async function readRequest(
  request: Request,
): Promise<ApprovalPushRequest | undefined> {
  const value: unknown = await request.json().catch(() => undefined);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const body = value as Record<string, unknown>;
  if (
    typeof body.deviceId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      body.deviceId,
    ) ||
    typeof body.deviceProof !== "string" ||
    body.deviceProof.length < 64 ||
    body.deviceProof.length > 200
  ) {
    return undefined;
  }
  return { deviceId: body.deviceId, deviceProof: body.deviceProof };
}

function json(
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(value), {
    headers: {
      ...corsHeaders,
      ...headers,
      "Content-Type": "application/json",
    },
    status,
  });
}
