export interface CheckState {
  pass: boolean;
  /** One line under the check: why it is red, or what made it green. */
  detail?: string;
}

export interface SandboxProps<L, A> {
  level: L;
  onChecks: (checks: Record<string, boolean | CheckState>) => void;
  /** A failed attempt: red shake and a one-line reason. */
  fail: (reason: string) => void;
  /** The latest Show me step to act out, with a nonce so the same step can repeat. */
  act: { nonce: number; act: A } | null;
}
