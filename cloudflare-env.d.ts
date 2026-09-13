declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    PHOTOS?: KVNamespace;
    INFERENCE_API_URL?: string;
    INFERENCE_API_KEY?: string;
    REVIEWER_TOKEN?: string;
  }
}
