import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { getEvaluationMediaS3Client } from "@/src/server/utils/evaluationMediaS3Client";
import { logger } from "@langfuse/shared/src/server";

/**
 * tRPC Router for Evaluation Media
 *
 * Handles presigned URL generation for evaluation-specific media files
 * stored in a separate S3 bucket (audio, images, file attachments)
 *
 * Note: Uses publicProcedure (no authentication required) because:
 * 1. The traces/observations that contain these inputs are already protected
 * 2. The presigned URLs are time-limited (15 minutes)
 * 3. File paths are non-guessable hash strings
 * 4. This avoids authentication issues in the dataset table
 */
export const evaluationMediaRouter = createTRPCRouter({
  /**
   * Generate a presigned URL for a single evaluation media file
   */
  getPresignedUrl: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        filePath: z.string(),
        expiresIn: z.number().min(60).max(3600).default(900), // 1 min to 1 hour, default 15 min
      }),
    )
    .query(async ({ input }) => {
      try {
        const { filePath, expiresIn } = input;

        // Get S3 client
        const s3Client = getEvaluationMediaS3Client();

        if (!s3Client.isConfigured()) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Evaluation media S3 is not configured. Please configure LANGFUSE_S3_EVALUATION_MEDIA_* environment variables.",
          });
        }

        // Generate presigned URL
        const url = await s3Client.getPresignedUrl(filePath, expiresIn);

        if (!url) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Failed to generate presigned URL for file: ${filePath}`,
          });
        }

        // Calculate expiry timestamp
        const urlExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

        return {
          filePath,
          url,
          urlExpiry,
        };
      } catch (e) {
        logger.error("Error generating evaluation media presigned URL", e);
        if (e instanceof TRPCError) {
          throw e;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate presigned URL for evaluation media.",
        });
      }
    }),

  /**
   * Generate presigned URLs for multiple evaluation media files
   */
  getPresignedUrls: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        filePaths: z.array(z.string()).min(1).max(50), // Limit to 50 files per request
        expiresIn: z.number().min(60).max(3600).default(900),
      }),
    )
    .query(async ({ input }) => {
      try {
        const { filePaths, expiresIn } = input;

        // Get S3 client
        const s3Client = getEvaluationMediaS3Client();

        if (!s3Client.isConfigured()) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Evaluation media S3 is not configured. Please configure LANGFUSE_S3_EVALUATION_MEDIA_* environment variables.",
          });
        }

        // Generate presigned URLs for all files
        const urlsMap = await s3Client.getPresignedUrls(filePaths, expiresIn);

        // Calculate expiry timestamp
        const urlExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

        // Convert Map to array of results
        const results = filePaths.map((filePath) => {
          const url = urlsMap.get(filePath);
          return {
            filePath,
            url: url ?? null,
            urlExpiry: url ? urlExpiry : null,
            success: url !== null,
          };
        });

        // Check if any failed
        const failedCount = results.filter((r) => !r.success).length;
        if (failedCount > 0) {
          logger.warn(
            `Failed to generate ${failedCount} out of ${filePaths.length} presigned URLs`,
          );
        }

        return {
          results,
          totalCount: filePaths.length,
          successCount: filePaths.length - failedCount,
          failedCount,
        };
      } catch (e) {
        logger.error("Error generating evaluation media presigned URLs", e);
        if (e instanceof TRPCError) {
          throw e;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate presigned URLs for evaluation media.",
        });
      }
    }),
});
