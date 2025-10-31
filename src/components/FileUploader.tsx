import React, { useState, useCallback, useRef } from "react";
import { BlossomUploader } from "@nostrify/nostrify/uploaders";
import { NSecSigner } from "@nostrify/nostrify";
import { useUIStore } from "./lib/useUIStore";

interface FileUploaderProps {
  onFileUploaded: (tags: string[][]) => void;
  onUploadError: (error: string) => void;
  onUploadStart?: () => void;
  onUploadComplete?: () => void;
  disabled?: boolean;
  maxFileSize?: number; // in bytes
  acceptedTypes?: string[];
  isMobile?: boolean;
}

interface UploadedFile {
  file: File;
  preview: string;
  tags: string[][];
  uploading: boolean;
  error?: string;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  onFileUploaded,
  onUploadError,
  onUploadStart,
  onUploadComplete,
  disabled = false,
  maxFileSize = 10 * 1024 * 1024, // 10MB default
  acceptedTypes = ["image/*", "video/*"],
  isMobile = false,
}) => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get the primary Blossom server URL from settings
  const primaryBlossomServerUrl =
    useUIStore((s) => s.primaryBlossomServerUrl) ||
    "https://blossom.primal.net/";

  // Get all Blossom server URLs for error handling
  const blossomServerUrls = useUIStore((s) => s.blossomServerUrls) || [
    "https://blossom.primal.net/",
  ];

  const validateFile = (file: File): string | null => {
    if (file.size > maxFileSize) {
      return `File size must be less than ${Math.round(
        maxFileSize / (1024 * 1024)
      )}MB`;
    }

    const isValidType = acceptedTypes.some((type) => {
      if (type.endsWith("/*")) {
        return file.type.startsWith(type.slice(0, -1));
      }
      return file.type === type;
    });

    if (!isValidType) {
      return `File type not supported. Allowed types: ${acceptedTypes.join(
        ", "
      )}`;
    }

    return null;
  };

  const createPreview = (file: File): string => {
    if (file.type.startsWith("image/")) {
      return URL.createObjectURL(file);
    }
    return "";
  };

  const uploadFile = async (file: File): Promise<string[][]> => {
    // Check file size limits for the primary server
    const checkFileSizeLimits = (file: File, serverUrl: string) => {
      if (serverUrl.includes("nostr.build")) {
        // nostr.build has 50MB limit for free uploads, 100MB for paid
        const maxSize = 50 * 1024 * 1024; // 50MB
        if (file.size > maxSize) {
          throw new Error(
            `File too large: ${Math.round(
              file.size / (1024 * 1024)
            )}MB exceeds the 50MB limit for free uploads on nostr.build. Consider upgrading to a paid plan or using a different server.`
          );
        }
      }
    };

    // Check for GPS metadata in images (nostr.build rejects these)
    const checkForGPSMetadata = async (file: File): Promise<boolean> => {
      if (file.type.startsWith("image/") && file.size < 10 * 1024 * 1024) {
        // Only check smaller images
        try {
          const arrayBuffer = await file.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          const fileContent = new TextDecoder("latin1").decode(uint8Array);

          // Check for EXIF GPS tags
          if (
            fileContent.includes("GPS") ||
            fileContent.includes("gps") ||
            fileContent.includes("latitude") ||
            fileContent.includes("longitude")
          ) {
            console.warn(
              "⚠️ Image contains GPS metadata which will be rejected by nostr.build"
            );
            return true; // GPS metadata detected
          }
        } catch (error) {
          // Ignore errors in metadata checking
        }
      }
      return false; // No GPS metadata detected
    };

    // Strip GPS metadata from image using canvas
    const stripGPSMetadata = async (file: File): Promise<File> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");

          if (!ctx) {
            reject(new Error("Could not get canvas context"));
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;

          // Draw image to canvas (this strips EXIF data including GPS)
          ctx.drawImage(img, 0, 0);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                const newFile = new File([blob], file.name, {
                  type: file.type,
                });
                resolve(newFile);
              } else {
                reject(new Error("Failed to create blob from canvas"));
              }
            },
            file.type,
            0.9
          ); // Use 90% quality to maintain reasonable file size
        };

        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = URL.createObjectURL(file);
      });
    };

    // Pre-flight checks
    checkFileSizeLimits(file, primaryBlossomServerUrl);

    // Check for GPS metadata and strip it if found
    let processedFile = file;
    const hasGPSMetadata = await checkForGPSMetadata(file);

    if (hasGPSMetadata) {
      console.log("🔄 Stripping GPS metadata from image...");
      try {
        processedFile = await stripGPSMetadata(file);
        console.log("✅ GPS metadata successfully stripped");
      } catch (error) {
        console.error("❌ Failed to strip GPS metadata:", error);
        throw new Error(
          "Image contains GPS metadata that cannot be removed. Please use a different image or remove GPS data manually."
        );
      }
    }

    // Create Nostrify signer - try in-memory key first, then NIP-07 extension
    let signer: NSecSigner;

    try {
      // Import the function to get the in-memory secret key
      const { getInMemorySecretKeyHex } = await import("../utils/nostr/nip07");
      const inMemorySecretKeyHex = getInMemorySecretKeyHex();

      if (inMemorySecretKeyHex) {
        console.log("🔑 Using in-memory secret key for authentication");
        // Use in-memory secret key if available
        // Convert hex string to Uint8Array for NSecSigner
        const secretKeyBytes = new Uint8Array(
          inMemorySecretKeyHex
            .match(/.{1,2}/g)!
            .map((byte) => parseInt(byte, 16))
        );
        signer = new NSecSigner(secretKeyBytes);
      } else if (window.nostr) {
        console.log("🔑 Using NIP-07 extension for authentication");
        // Fall back to NIP-07 extension
        // Use window.nostr directly as it implements the NostrSigner interface
        signer = window.nostr as any;
      } else {
        throw new Error(
          "No signing method available. Please sign in with a Nostr extension or unlock your saved account."
        );
      }
    } catch (error) {
      throw new Error(
        `Failed to initialize signer: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }

    const uploader = new BlossomUploader({
      servers: [primaryBlossomServerUrl],
      signer: signer,
      expiresIn: 60_000, // 60 seconds timeout for uploads
    });

    console.log(
      "🚀 Starting upload to primary server:",
      primaryBlossomServerUrl
    );
    try {
      const result = await uploader.upload(processedFile);
      console.log("✅ Upload successful:", result);
      return result;
    } catch (error: any) {
      // Provide more specific error messages for common issues
      if (
        error.message?.includes("401") ||
        error.message?.includes("Unauthorized")
      ) {
        const serverInfo = blossomServerUrls.some((url) =>
          url.includes("nostr.build")
        )
          ? "nostr.build requires authentication. Make sure you're signed in with a Nostr extension."
          : "This server requires special access. Try a different server or contact the server administrator.";
        throw new Error(`Authentication failed: ${serverInfo}`);
      } else if (
        error.message?.includes("403") ||
        error.message?.includes("Forbidden")
      ) {
        throw new Error(
          `Access denied: This server doesn't allow uploads from your account. Try a different server.`
        );
      } else if (
        error.message?.includes("CORS") ||
        error.message?.includes("Access-Control-Allow-Origin") ||
        error.message?.includes("access control checks") ||
        (error.message?.includes("Origin") &&
          error.message?.includes("not allowed"))
      ) {
        throw new Error(
          `CORS error: This server doesn't allow uploads from your domain (${window.location.origin}). Try a different server or contact the server administrator to add your domain to their CORS policy.`
        );
      } else if (
        error.message?.includes("NetworkError") ||
        error.message?.includes("fetch")
      ) {
        throw new Error(
          `Network error: Unable to connect to the server. Check your internet connection and try again.`
        );
      } else if (
        error.message?.includes("413") ||
        error.message?.includes("Payload Too Large")
      ) {
        throw new Error(
          `File too large: This server has file size limits. Try a smaller file or a different server.`
        );
      } else if (
        error.message?.includes("415") ||
        error.message?.includes("Unsupported Media Type")
      ) {
        throw new Error(
          `Unsupported file type: This server doesn't support this file format. Try a different file type or server.`
        );
      } else if (
        error.message?.includes("GPS") ||
        error.message?.includes("metadata") ||
        error.message?.includes("EXIF")
      ) {
        throw new Error(
          `File rejected: This server doesn't allow images with GPS metadata. The image has been processed to remove GPS data, but the server still rejected it. Try a different server or use a different image.`
        );
      }

      // Re-throw the original error if we can't provide a better message
      throw error;
    }
  };

  const handleFileSelect = useCallback(
    async (files: FileList | null) => {
      if (!files || disabled) return;

      const fileArray = Array.from(files);
      const newUploadedFiles: UploadedFile[] = [];

      // Validate and prepare files
      for (const file of fileArray) {
        const error = validateFile(file);
        const preview = createPreview(file);

        newUploadedFiles.push({
          file,
          preview,
          tags: [],
          uploading: !error,
          error: error || undefined,
        });
      }

      setUploadedFiles((prev) => [...prev, ...newUploadedFiles]);

      // Upload valid files
      for (let i = 0; i < newUploadedFiles.length; i++) {
        const uploadedFile = newUploadedFiles[i];
        if (uploadedFile.error) {
          onUploadError(uploadedFile.error);
          continue;
        }

        try {
          onUploadStart?.();

          setUploadedFiles((prev) =>
            prev.map((f, idx) =>
              idx === prev.length - newUploadedFiles.length + i
                ? { ...f, uploading: true }
                : f
            )
          );

          const tags = await uploadFile(uploadedFile.file);

          setUploadedFiles((prev) =>
            prev.map((f, idx) =>
              idx === prev.length - newUploadedFiles.length + i
                ? { ...f, tags, uploading: false }
                : f
            )
          );

          onFileUploaded(tags);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Upload failed";

          setUploadedFiles((prev) =>
            prev.map((f, idx) =>
              idx === prev.length - newUploadedFiles.length + i
                ? { ...f, uploading: false, error: errorMessage }
                : f
            )
          );

          onUploadError(errorMessage);
        }
      }

      onUploadComplete?.();
    },
    [
      disabled,
      maxFileSize,
      acceptedTypes,
      onFileUploaded,
      onUploadError,
      onUploadStart,
      onUploadComplete,
    ]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) {
        setIsDragOver(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (!disabled) {
        handleFileSelect(e.dataTransfer.files);
      }
    },
    [disabled, handleFileSelect]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFileSelect(e.target.files);
    },
    [handleFileSelect]
  );

  const removeFile = useCallback((index: number) => {
    setUploadedFiles((prev) => {
      const newFiles = [...prev];
      const fileToRemove = newFiles[index];

      // Clean up object URL
      if (fileToRemove.preview) {
        URL.revokeObjectURL(fileToRemove.preview);
      }

      newFiles.splice(index, 1);
      return newFiles;
    });
  }, []);

  const clearAllFiles = useCallback(() => {
    uploadedFiles.forEach((file) => {
      if (file.preview) {
        URL.revokeObjectURL(file.preview);
      }
    });
    setUploadedFiles([]);
  }, [uploadedFiles]);

  return (
    <div style={{ width: "100%" }}>
      {/* Upload Area */}
      <div
        style={{
          border: `2px dashed ${
            isDragOver ? "var(--accent-color)" : "var(--border-color)"
          }`,
          padding: isMobile ? "0.5rem" : "1rem",
          textAlign: "center",
          backgroundColor: isDragOver
            ? "var(--accent-color-10)"
            : "transparent",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          transition: "all 0.2s ease",
          marginBottom: isMobile ? "0.5rem" : "1rem",
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptedTypes.join(",")}
          onChange={handleFileInputChange}
          style={{ display: "none" }}
          disabled={disabled}
        />

        <div
          style={{
            fontSize: isMobile ? "0.75rem" : "0.875rem",
            color: "var(--text-color-secondary)",
            marginBottom: isMobile ? "0rem" : "0.25rem",
          }}
        >
          {isDragOver
            ? "Drop files here"
            : isMobile
              ? "Upload files"
              : "Click to select files or drag and drop"}
        </div>

        {!isMobile && (
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--text-color-muted)",
            }}
          >
            Images, videos up to {Math.round(maxFileSize / (1024 * 1024))}MB
          </div>
        )}
      </div>

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <div style={{ marginBottom: isMobile ? "0.5rem" : "1rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.5rem",
            }}
          >
            <div style={{ fontSize: "0.875rem", fontWeight: "500" }}>
              Attached Files ({uploadedFiles.length})
            </div>
            <button
              onClick={clearAllFiles}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-color-secondary)",
                cursor: "pointer",
                fontSize: "0.75rem",
                textDecoration: "underline",
              }}
            >
              Clear all
            </button>
          </div>

          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            {uploadedFiles.map((uploadedFile, index) => (
              <div
                key={`${uploadedFile.file.name}-${index}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "0.5rem",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--background-color-secondary)",
                }}
              >
                {/* File Preview */}
                {uploadedFile.preview && (
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      marginRight: "0.75rem",
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                  >
                    <img
                      src={uploadedFile.preview}
                      alt={uploadedFile.file.name}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  </div>
                )}

                {/* File Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: "500",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {uploadedFile.file.name}
                  </div>

                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-color-secondary)",
                    }}
                  >
                    {Math.round(uploadedFile.file.size / 1024)}KB
                  </div>

                  {/* Status */}
                  {uploadedFile.uploading && (
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--accent-color)",
                      }}
                    >
                      Uploading...
                    </div>
                  )}

                  {uploadedFile.error && (
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--error-color)",
                      }}
                    >
                      {uploadedFile.error}
                    </div>
                  )}

                  {uploadedFile.tags.length > 0 &&
                    !uploadedFile.uploading &&
                    !uploadedFile.error && (
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--success-color)",
                        }}
                      >
                        ✓ Uploaded
                      </div>
                    )}
                </div>

                {/* Remove Button */}
                <button
                  onClick={() => removeFile(index)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-color-secondary)",
                    cursor: "pointer",
                    fontSize: "1.25rem",
                    padding: "0.25rem",
                    marginLeft: "0.5rem",
                  }}
                  disabled={uploadedFile.uploading}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUploader;
