const migrationVersionPattern = /^\d{14}$/;
const projectRefPattern = /^[a-z0-9]{20}$/;

export function validateSupabaseDeployment(value, label = "deployment") {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }

  if (value.type === "managed") {
    requireExactKeys(
      value,
      ["migrationVersion", "projectRef", "type"],
      label,
    );
    if (!projectRefPattern.test(value.projectRef ?? "")) {
      throw new Error(
        `${label}.projectRef must be a 20-character lowercase Supabase project ref.`,
      );
    }
    requireMigrationVersion(value.migrationVersion, label);
    return {
      migrationVersion: value.migrationVersion,
      projectRef: value.projectRef,
      type: "managed",
    };
  }

  throw new Error(`${label}.type must be "managed".`);
}

export function supabaseDeploymentsMatch(left, right) {
  try {
    const normalizedLeft = validateSupabaseDeployment(left);
    const normalizedRight = validateSupabaseDeployment(right);
    return (
      normalizedLeft.type === normalizedRight.type &&
      normalizedLeft.migrationVersion === normalizedRight.migrationVersion &&
      normalizedLeft.projectRef === normalizedRight.projectRef
    );
  } catch {
    return false;
  }
}

function requireMigrationVersion(value, label) {
  if (!migrationVersionPattern.test(value ?? "")) {
    throw new Error(
      `${label}.migrationVersion must be a 14-digit Supabase migration version.`,
    );
  }
}

function requireExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new Error(`${label} fields do not match its deployment type.`);
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
