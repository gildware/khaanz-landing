import type { Auth, RecaptchaVerifier } from "firebase/auth";

export function clearRecaptchaVerifier(
  verifier: RecaptchaVerifier | null | undefined,
  container: HTMLElement | null | undefined,
) {
  try {
    verifier?.clear();
  } catch {
    // Ignore stale widgets left after a failed SMS attempt or React remount.
  }
  container?.replaceChildren();
}

/** Invisible verifier only — do not call `.render()`; `signInWithPhoneNumber` does that. */
export async function createInvisibleRecaptchaVerifier(
  auth: Auth,
  container: HTMLElement,
): Promise<RecaptchaVerifier> {
  container.replaceChildren();
  const { RecaptchaVerifier } = await import("firebase/auth");
  return new RecaptchaVerifier(auth, container, { size: "invisible" });
}

export function isRecaptchaAlreadyRenderedError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "object" &&
          err &&
          "message" in err &&
          typeof (err as { message: unknown }).message === "string"
        ? (err as { message: string }).message
        : "";
  return /already been rendered in this element/i.test(msg);
}
