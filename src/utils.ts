export type Props = {
  login: string;
  name: string;
  email: string;
};

interface UpstreamAuthorizeParams {
  upstream_url: string;
  client_id: string;
  scope: string;
  redirect_uri: string;
  state?: string;
}

export function getUpstreamAuthorizeUrl(params: UpstreamAuthorizeParams): string {
  const { upstream_url, client_id, scope, redirect_uri, state } = params;
  const url = new URL(upstream_url);
  url.searchParams.set("client_id", client_id);
  url.searchParams.set("redirect_uri", redirect_uri);
  url.searchParams.set("scope", scope);
  if (state) url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  return url.href;
}

interface UpstreamTokenParams {
  upstream_url: string;
  client_id: string;
  client_secret: string;
  code: string | undefined;
  redirect_uri: string;
}

export async function fetchUpstreamAuthToken(
  params: UpstreamTokenParams,
): Promise<[string, null] | [null, Response]> {
  const { upstream_url, client_id, client_secret, code, redirect_uri } = params;

  if (!code) {
    return [null, new Response("Missing code", { status: 400 })];
  }

  const resp = await fetch(upstream_url, {
    body: new URLSearchParams({ client_id, client_secret, code, redirect_uri }).toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  if (!resp.ok) {
    return [null, new Response("Failed to fetch access token", { status: 500 })];
  }

  const body = await resp.formData();
  const accessToken = body.get("access_token") as string;
  if (!accessToken) {
    return [null, new Response("Missing access token", { status: 400 })];
  }

  return [accessToken, null];
}
