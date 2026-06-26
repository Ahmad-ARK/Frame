/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional API key sent as `Authorization: Bearer` when the backend runs with
   *  API_KEYS set. Leave unset in local dev (auth disabled). */
  readonly VITE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
