import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const schedulerSecret = Deno.env.get("ACCOUNT_DELETION_SCHEDULER_SECRET");

Deno.serve(async (request) => {
  if (!supabaseUrl || !serviceRoleKey || !schedulerSecret) {
    return json({ error: "Function secrets are incomplete." }, 500);
  }
  if (request.headers.get("authorization") !== `Bearer ${schedulerSecret}`) {
    return json({ error: "Unauthorized." }, 401);
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405, {
      allow: "POST",
    });
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const due = await client
    .from("account_deletion_requests")
    .select("user_id")
    .is("cancelled_at", null)
    .is("completed_at", null)
    .lte("execute_after", new Date().toISOString())
    .limit(100);

  if (due.error) return json({ error: due.error.message }, 500);

  const failures: { userId: string; message: string }[] = [];
  for (const requestRow of due.data) {
    const deletion = await client.auth.admin.deleteUser(requestRow.user_id);
    if (deletion.error) {
      failures.push({
        message: deletion.error.message,
        userId: requestRow.user_id,
      });
    }
  }

  return json({
    deleted: due.data.length - failures.length,
    failures,
    processed: due.data.length,
  });
});

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
