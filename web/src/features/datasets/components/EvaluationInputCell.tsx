import { memo, useMemo } from "react";
import { api } from "@/src/utils/api";
import {
  parseEvaluationInput,
  getAllFilePaths,
  getMimeTypeFromPath,
} from "../utils/parseEvaluationInput";
import { ResizableImage } from "@/src/components/ui/resizable-image";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { cn } from "@/src/utils/tailwind";
import { File, Loader2, AlertCircle } from "lucide-react";

/**
 * EvaluationInputCell Component
 *
 * Displays evaluation input with structured media content:
 * - Text field displayed separately
 * - Audio files as playable <audio> elements
 * - Images as viewable <img> elements
 * - File attachments as downloadable links
 * - Falls back to JSON view if parsing fails
 */
export const EvaluationInputCell = ({
  data,
  projectId,
  className,
  singleLine = false,
}: {
  data: unknown;
  projectId: string;
  className?: string;
  singleLine?: boolean;
}) => {
  // Parse the input data
  const parsed = useMemo(() => parseEvaluationInput(data), [data]);

  // Get all file paths for batch URL generation
  const filePaths = useMemo(() => getAllFilePaths(parsed), [parsed]);
  const filePathStrings = useMemo(
    () => filePaths.map((f) => f.path),
    [filePaths],
  );

  // Fetch presigned URLs for all media files
  const { data: urlData, isLoading } =
    api.evaluationMedia.getPresignedUrls.useQuery(
      {
        projectId,
        filePaths: filePathStrings,
        expiresIn: 900, // 15 minutes
      },
      {
        enabled: filePathStrings.length > 0,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        staleTime: 10 * 60 * 1000, // 10 minutes
      },
    );

  // Build a map of filepath -> presigned URL
  const urlMap = useMemo(() => {
    const map = new Map<string, string>();
    if (urlData?.results) {
      urlData.results.forEach((result) => {
        if (result.url) {
          map.set(result.filePath, result.url);
        }
      });
    }
    return map;
  }, [urlData]);

  // If no media content or parsing failed, show JSON fallback
  if (!parsed.hasMediaContent) {
    return (
      <JSONView
        json={data}
        className={cn(
          "ph-no-capture h-full w-full self-stretch rounded-sm",
          className,
        )}
        codeClassName="py-1 px-2 min-h-0 h-full overflow-y-auto"
        collapseStringsAfterLength={null}
      />
    );
  }

  // Single line mode - just show truncated text
  if (singleLine) {
    const displayText = parsed.text || "[Media content - click to expand]";
    return (
      <div
        className={cn(
          "ph-no-capture h-full w-full self-stretch overflow-hidden truncate rounded-sm border px-2 py-0.5 text-sm",
          className,
        )}
      >
        {displayText}
      </div>
    );
  }

  // Full display mode
  return (
    <div className={cn("ph-no-capture space-y-3 rounded-sm p-2", className)}>
      {/* Text Section */}
      {parsed.text && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">Text</div>
          <div className="whitespace-pre-wrap text-sm">{parsed.text}</div>
        </div>
      )}

      {/* Audio Files Section */}
      {parsed.audioFiles.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">
            Audio Files ({parsed.audioFiles.length})
          </div>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading audio files...
            </div>
          ) : (
            <div className="space-y-2">
              {parsed.audioFiles.map((filepath, idx) => {
                const url = urlMap.get(filepath);
                return (
                  <AudioFilePlayer key={idx} filepath={filepath} url={url} />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Images Section */}
      {parsed.imageFiles.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">
            Images ({parsed.imageFiles.length})
          </div>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading images...
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {parsed.imageFiles.map((img, idx) => {
                const url = urlMap.get(img.filepath);
                return (
                  <ImageFileViewer
                    key={idx}
                    filepath={img.filepath}
                    url={url}
                    format={img.format}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* File Attachments Section */}
      {parsed.fileAttachments.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">
            File Attachments ({parsed.fileAttachments.length})
          </div>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading files...
            </div>
          ) : (
            <div className="space-y-1">
              {parsed.fileAttachments.map((filepath, idx) => {
                const url = urlMap.get(filepath);
                return (
                  <FileAttachmentLink key={idx} filepath={filepath} url={url} />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Audio File Player Component
 */
function AudioFilePlayer({
  filepath,
  url,
}: {
  filepath: string;
  url?: string;
}) {
  const filename = filepath.split("/").pop() || filepath;

  if (!url) {
    return (
      <div className="flex items-center gap-2 rounded border border-destructive/50 bg-destructive/10 px-3 py-2">
        <AlertCircle className="h-4 w-4 text-destructive" />
        <span className="text-sm text-destructive">
          Failed to load: {filename}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{filename}</div>
      <audio controls className="w-full" preload="metadata">
        <source src={url} type={getMimeTypeFromPath(filepath)} />
        Your browser does not support the audio element.
      </audio>
    </div>
  );
}

/**
 * Image File Viewer Component
 */
function ImageFileViewer({
  filepath,
  url,
  format,
}: {
  filepath: string;
  url?: string;
  format?: string;
}) {
  const filename = filepath.split("/").pop() || filepath;

  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded border border-destructive/50 bg-destructive/10 p-4">
        <AlertCircle className="h-6 w-6 text-destructive" />
        <span className="text-center text-xs text-destructive">
          Failed to load image
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="truncate text-xs text-muted-foreground" title={filename}>
        {filename}
        {format && ` (${format})`}
      </div>
      <ResizableImage
        src={url}
        isDefaultVisible={true}
        shouldValidateImageSource={false}
      />
    </div>
  );
}

/**
 * File Attachment Link Component
 */
function FileAttachmentLink({
  filepath,
  url,
}: {
  filepath: string;
  url?: string;
}) {
  const filename = filepath.split("/").pop() || filepath;
  const extension = filepath.split(".").pop()?.toUpperCase() || "FILE";

  if (!url) {
    return (
      <div className="flex items-center gap-2 rounded border border-destructive/50 bg-destructive/10 px-3 py-2">
        <AlertCircle className="h-4 w-4 text-destructive" />
        <span className="text-sm text-destructive">
          Failed to load: {filename}
        </span>
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded border bg-muted px-3 py-2 transition-colors hover:bg-muted/80"
    >
      <File className="h-4 w-4" />
      <span className="flex-1 truncate text-sm" title={filename}>
        {filename}
      </span>
      <span className="text-xs text-muted-foreground">{extension}</span>
    </a>
  );
}

export const MemoizedEvaluationInputCell = memo(EvaluationInputCell);
