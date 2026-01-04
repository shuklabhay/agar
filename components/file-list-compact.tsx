"use client";

import { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { FileText, Image as ImageIcon, FileIcon, Download } from "lucide-react";

export interface CompactFile {
  storageId: Id<"_storage">;
  fileName: string;
  contentType: string;
  url: string | null;
}

function getFileIcon(contentType: string) {
  if (contentType.startsWith("image/")) {
    return <ImageIcon className="h-4 w-4" />;
  }
  if (
    contentType === "application/msword" ||
    contentType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return <FileIcon className="h-4 w-4" />;
  }
  return <FileText className="h-4 w-4" />;
}

function getFileTypeBadge(contentType: string) {
  switch (contentType) {
    case "image/jpeg":
      return "JPEG";
    case "image/png":
      return "PNG";
    case "application/pdf":
      return "PDF";
    case "application/msword":
      return "DOC";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "DOCX";
    default:
      return "File";
  }
}

export function FileListCompact({
  files,
  onFileClick,
}: {
  files: CompactFile[];
  onFileClick?: (file: {
    fileName: string;
    contentType: string;
    url: string;
  }) => void;
}) {
  if (files.length === 0) {
    return <span className="text-sm text-muted-foreground">None</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {files.map((file, index) => (
        <button
          key={index}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 hover:bg-muted text-sm transition-colors"
          onClick={() =>
            file.url &&
            onFileClick?.({
              fileName: file.fileName,
              contentType: file.contentType,
              url: file.url,
            })
          }
        >
          {getFileIcon(file.contentType)}
          <span className="truncate max-w-[150px]">{file.fileName}</span>
          <Badge variant="secondary" className="text-[10px] px-1 py-0">
            {getFileTypeBadge(file.contentType)}
          </Badge>
          {file.url && (
            <a
              href={file.url}
              download={file.fileName}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="hover:text-primary"
            >
              <Download className="h-3 w-3" />
            </a>
          )}
        </button>
      ))}
    </div>
  );
}
