/**
 * Utilities for parsing evaluation input data structure
 *
 * Extracts text, audio, images, and file attachments from the evaluation
 * input format: { args: [], kwargs: { text, audio, images, file_attachments } }
 */

export interface ParsedEvaluationInput {
  text: string | null;
  audioFiles: string[];
  imageFiles: Array<{
    filepath: string;
    format?: string;
  }>;
  fileAttachments: string[];
  hasMediaContent: boolean;
  rawData: unknown;
}

/**
 * Check if the input data matches the evaluation input structure
 */
function isEvaluationInputStructure(data: unknown): boolean {
  if (!data) return false;

  if (typeof data !== "object") {
    data = JSON.parse(data as string);
  }

  const obj = data as Record<string, unknown>;

  // Must have kwargs object
  if (!obj.kwargs || typeof obj.kwargs !== "object") return false;

  const kwargs = obj.kwargs as Record<string, unknown>;

  // Must have at least one of: text, audio, images, or file_attachments
  return (
    "text" in kwargs ||
    "audio" in kwargs ||
    "images" in kwargs ||
    "file_attachments" in kwargs
  );
}

/**
 * Extract audio file paths from kwargs.audio
 * Can be either array of strings or null/undefined
 */
function extractAudioFiles(audio: unknown): string[] {
  if (!audio) return [];
  if (Array.isArray(audio)) {
    return audio.filter((item) => typeof item === "string");
  }
  return [];
}

/**
 * Extract image file objects from kwargs.images
 * Can be either array of objects with filepath, or null/undefined
 */
function extractImageFiles(
  images: unknown,
): Array<{ filepath: string; format?: string }> {
  if (!images) return [];
  if (Array.isArray(images)) {
    return images
      .filter(
        (item) =>
          item &&
          typeof item === "object" &&
          "filepath" in item &&
          typeof item.filepath === "string",
      )
      .map((item) => ({
        filepath: item.filepath as string,
        format:
          "format" in item && typeof item.format === "string"
            ? item.format
            : undefined,
      }));
  }
  return [];
}

/**
 * Extract file attachment paths from kwargs.file_attachments
 * Can be either array of strings or null/undefined
 */
function extractFileAttachments(fileAttachments: unknown): string[] {
  if (!fileAttachments) return [];
  if (Array.isArray(fileAttachments)) {
    return fileAttachments.filter((item) => typeof item === "string");
  }
  return [];
}

/**
 * Parse evaluation input data and extract structured content
 *
 * @param data - The input data to parse
 * @returns ParsedEvaluationInput with extracted text and media files
 *
 * @example
 * const input = {
 *   args: [],
 *   kwargs: {
 *     text: "帮我约个明天早上9点的会",
 *     audio: ["file1.m4a", "file2.m4a"],
 *     images: [{ format: "jpeg", filepath: "image1.jpg" }],
 *     file_attachments: null
 *   }
 * };
 * const parsed = parseEvaluationInput(input);
 * // parsed.text = "帮我约个明天早上9点的会"
 * // parsed.audioFiles = ["file1.m4a", "file2.m4a"]
 * // parsed.imageFiles = [{ filepath: "image1.jpg", format: "jpeg" }]
 */
export function parseEvaluationInput(data: unknown): ParsedEvaluationInput {
  // Default result
  const defaultResult: ParsedEvaluationInput = {
    text: null,
    audioFiles: [],
    imageFiles: [],
    fileAttachments: [],
    hasMediaContent: false,
    rawData: data,
  };

  // Check if data matches expected structure
  if (!isEvaluationInputStructure(data)) {
    return defaultResult;
  }

  let obj = data as Record<string, unknown>;
  if (typeof obj !== "object") {
    obj = JSON.parse(data as string);
  }

  const kwargs = obj.kwargs as Record<string, unknown>;

  // Extract text
  if (typeof kwargs === "object") {
    const text =
      "text" in kwargs && typeof kwargs.text === "string" ? kwargs.text : null;

    // Extract media files
    const audioFiles = extractAudioFiles(kwargs.audio);
    const imageFiles = extractImageFiles(kwargs.images);
    const fileAttachments = extractFileAttachments(kwargs.file_attachments);

    const hasMediaContent =
      audioFiles.length > 0 ||
      imageFiles.length > 0 ||
      fileAttachments.length > 0;

    return {
      text,
      audioFiles,
      imageFiles,
      fileAttachments,
      hasMediaContent,
      rawData: data,
    };
  }

  return defaultResult;
}

/**
 * Get all file paths from parsed input (for batch URL generation)
 */
export function getAllFilePaths(
  parsed: ParsedEvaluationInput,
): Array<{ path: string; type: "audio" | "image" | "file" }> {
  const paths: Array<{ path: string; type: "audio" | "image" | "file" }> = [];

  // Add audio files
  parsed.audioFiles.forEach((path) => {
    paths.push({ path, type: "audio" });
  });

  // Add image files
  parsed.imageFiles.forEach((img) => {
    paths.push({ path: img.filepath, type: "image" });
  });

  // Add file attachments
  parsed.fileAttachments.forEach((path) => {
    paths.push({ path, type: "file" });
  });

  return paths;
}

/**
 * Get MIME type from file extension (best guess)
 */
export function getMimeTypeFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();

  const mimeTypes: Record<string, string> = {
    // Audio
    m4a: "audio/mp4",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    aac: "audio/aac",
    flac: "audio/flac",

    // Images
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    tiff: "image/tiff",

    // Documents
    pdf: "application/pdf",
    txt: "text/plain",
    csv: "text/csv",
    json: "application/json",

    // Archives
    zip: "application/zip",
  };

  return ext && mimeTypes[ext] ? mimeTypes[ext] : "application/octet-stream";
}
