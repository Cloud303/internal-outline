import env from "@server/env";
import OAuthClient from "./oauth";

export default class OIDCInternalClient extends OAuthClient {
  endpoints = {
    authorize: env.OIDC_INTERNAL_AUTH_URI || "",
    token: env.OIDC_INTERNAL_TOKEN_URI || "",
    userinfo: env.OIDC_INTERNAL_USERINFO_URI || "",
  };
}
