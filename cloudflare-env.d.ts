declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    INFERENCE_API_URL?: string;
    INFERENCE_API_KEY?: string;
  }
}
