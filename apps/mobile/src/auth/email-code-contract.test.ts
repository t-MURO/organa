import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const config = readFileSync(
  new URL("../../../../supabase/config.toml", import.meta.url),
  "utf8",
);
const emailCodeTemplate = readFileSync(
  new URL(
    "../../../../supabase/templates/email-code.html",
    import.meta.url,
  ),
  "utf8",
);

describe("email verification code contract", () => {
  it("uses the same code template for signup and returning-user emails", () => {
    expect(config).toContain("[auth.email.template.confirmation]");
    expect(config).toContain("[auth.email.template.magic_link]");
    expect(
      config.match(
        /content_path = "\.\/supabase\/templates\/email-code\.html"/g,
      ),
    ).toHaveLength(2);
  });

  it("sends the six-digit token expected by the passwordless sign-in form", () => {
    expect(config).toContain("otp_length = 6");
    expect(config).toContain("otp_expiry = 900");
    expect(emailCodeTemplate).toContain("{{ .Token }}");
    expect(emailCodeTemplate).toContain("expires in 15 minutes");
  });
});
