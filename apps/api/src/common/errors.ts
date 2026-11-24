/** A sync mutation that must not be applied (and will not succeed if retried unchanged). */
export class RejectError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}
