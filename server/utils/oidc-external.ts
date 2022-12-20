import env from "@server/env";
import OAuthClient from "./oauth";

export default class OIDCExternalClient extends OAuthClient {
  endpoints = {
    authorize: env.OIDC_EXTERNAL_AUTH_URI || "",
    token: env.OIDC_EXTERNAL_TOKEN_URI || "",
    userinfo: env.OIDC_EXTERNAL_USERINFO_URI || "",
  };
}
