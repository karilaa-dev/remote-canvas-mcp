import { WorkerEntrypoint } from "cloudflare:workers";
import { handleCanvasActionsRequest } from "./actions-handler.js";
import type { Props } from "./utils.js";

export class CanvasActionsApi extends WorkerEntrypoint<Env, Props> {
  fetch(request: Request): Promise<Response> {
    return handleCanvasActionsRequest(request, this.env, this.ctx.props);
  }
}
