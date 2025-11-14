import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";

/**
 * S3 Client for Evaluation Media
 *
 * This client is separate from the main Langfuse media system and connects to
 * a custom S3 bucket configured for evaluation-specific media files (audio, images, etc.)
 */
class EvaluationMediaS3Client {
  private client: S3Client | null = null;
  private bucketName: string | null = null;
  private prefix: string = "";

  constructor() {
    // Only initialize if bucket is configured
    if (!env.LANGFUSE_S3_EVALUATION_MEDIA_BUCKET) {
      logger.warn(
        "LANGFUSE_S3_EVALUATION_MEDIA_BUCKET not configured. Evaluation media features will be disabled.",
      );
      return;
    }

    // Validate required configuration
    if (
      !env.LANGFUSE_S3_EVALUATION_MEDIA_ACCESS_KEY_ID ||
      !env.LANGFUSE_S3_EVALUATION_MEDIA_SECRET_ACCESS_KEY
    ) {
      logger.warn(
        "S3 evaluation media credentials not configured. Evaluation media features will be disabled.",
      );
      return;
    }

    this.bucketName = env.LANGFUSE_S3_EVALUATION_MEDIA_BUCKET;
    this.prefix = env.LANGFUSE_S3_EVALUATION_MEDIA_PREFIX;

    const clientConfig: {
      region?: string;
      credentials: {
        accessKeyId: string;
        secretAccessKey: string;
      };
      endpoint?: string;
      forcePathStyle?: boolean;
    } = {
      region: env.LANGFUSE_S3_EVALUATION_MEDIA_REGION || "us-east-1",
      credentials: {
        accessKeyId: env.LANGFUSE_S3_EVALUATION_MEDIA_ACCESS_KEY_ID,
        secretAccessKey: env.LANGFUSE_S3_EVALUATION_MEDIA_SECRET_ACCESS_KEY,
      },
    };

    // Add endpoint if specified (for MinIO compatibility)
    if (env.LANGFUSE_S3_EVALUATION_MEDIA_ENDPOINT) {
      clientConfig.endpoint = env.LANGFUSE_S3_EVALUATION_MEDIA_ENDPOINT;
    }

    // Add force path style if needed (for MinIO)
    if (env.LANGFUSE_S3_EVALUATION_MEDIA_FORCE_PATH_STYLE === "true") {
      clientConfig.forcePathStyle = true;
    }

    this.client = new S3Client(clientConfig);

    logger.info(
      `EvaluationMediaS3Client initialized: bucket=${this.bucketName}, region=${clientConfig.region}, prefix=${this.prefix}`,
    );
  }

  /**
   * Check if the client is properly configured
   */
  public isConfigured(): boolean {
    return this.client !== null && this.bucketName !== null;
  }

  /**
   * Build full S3 key from relative path by prepending prefix
   */
  private buildFullKey(relativePath: string): string {
    // Remove leading slash if present
    const cleanPath = relativePath.startsWith("/")
      ? relativePath.slice(1)
      : relativePath;

    // Combine prefix with path
    if (this.prefix) {
      return `${this.prefix}/${cleanPath}`;
    }
    return cleanPath;
  }

  /**
   * Generate a presigned URL for a file
   *
   * @param filePath - Relative file path (e.g., "abc123.jpg")
   * @param expiresIn - URL expiration time in seconds (default: 900 = 15 minutes)
   * @returns Presigned URL or null if client not configured or error occurred
   */
  public async getPresignedUrl(
    filePath: string,
    expiresIn: number = 900,
  ): Promise<string | null> {
    if (!this.client || !this.bucketName) {
      logger.error(
        "EvaluationMediaS3Client not configured. Cannot generate presigned URL.",
      );
      return null;
    }

    const fullKey = this.buildFullKey(filePath);

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fullKey,
      });

      const url = await getSignedUrl(this.client, command, { expiresIn });

      logger.debug(
        `Generated presigned URL for evaluation media: s3://${this.bucketName}/${fullKey}`,
      );

      return url;
    } catch (error) {
      logger.error(
        `Failed to generate presigned URL for evaluation media: ${fullKey}`,
        error,
      );
      return null;
    }
  }

  /**
   * Generate presigned URLs for multiple files
   *
   * @param filePaths - Array of relative file paths
   * @param expiresIn - URL expiration time in seconds (default: 900 = 15 minutes)
   * @returns Map of filePath -> presigned URL (or null for failed files)
   */
  public async getPresignedUrls(
    filePaths: string[],
    expiresIn: number = 900,
  ): Promise<Map<string, string | null>> {
    const results = new Map<string, string | null>();

    // Generate URLs in parallel for better performance
    await Promise.all(
      filePaths.map(async (filePath) => {
        const url = await this.getPresignedUrl(filePath, expiresIn);
        results.set(filePath, url);
      }),
    );

    return results;
  }
}

// Singleton instance
let evaluationMediaS3Client: EvaluationMediaS3Client | null = null;

/**
 * Get the singleton instance of EvaluationMediaS3Client
 */
export function getEvaluationMediaS3Client(): EvaluationMediaS3Client {
  if (!evaluationMediaS3Client) {
    evaluationMediaS3Client = new EvaluationMediaS3Client();
  }
  return evaluationMediaS3Client;
}
