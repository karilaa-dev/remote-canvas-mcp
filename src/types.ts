export * from "./canvas-types.js";

export class CanvasAPIError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly response?: unknown
  ) {
    super(message);
    this.name = "CanvasAPIError";
  }
}
