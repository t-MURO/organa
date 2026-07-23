import type { CheckInRepository } from "./check-in-repository.types";

export function createCheckInRepository(): CheckInRepository {
  throw new Error("A platform-specific Check-In repository was not selected.");
}
