export interface ReminderAuthorizationCache {
  get(userId: string): Promise<boolean | null>;
  remove(userId: string): Promise<void>;
  set(userId: string, allowed: boolean): Promise<void>;
}
