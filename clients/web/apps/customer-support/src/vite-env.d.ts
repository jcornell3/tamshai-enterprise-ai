/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KEYCLOAK_URL: string;
  readonly VITE_KEYCLOAK_CLIENT_ID: string;
  readonly VITE_API_GATEWAY_URL: string;
  readonly VITE_MCP_GATEWAY_URL: string;
  readonly VITE_STAGE_HOST: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
