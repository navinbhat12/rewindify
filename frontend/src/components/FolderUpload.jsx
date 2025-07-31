import React, { useState, useRef } from "react";
import { API_BASE_URL } from "../config";

function FolderUpload({ onUploadComplete }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  const handleFolderSelect = async (files) => {
    console.log("📁 FolderUpload: Starting upload process");

    if (!files || files.length === 0) {
      console.log("⚠️ No files provided");
      return;
    }

    console.log(`📦 FolderUpload: ${files.length} files selected`);

    // Log file details
    for (let i = 0; i < files.length; i++) {
      console.log(
        `📄 File ${i + 1}: ${files[i].name} (${files[i].size} bytes)`
      );
    }

    // Filter out system files and non-JSON files
    const validFiles = Array.from(files).filter((file) => {
      const fileName = file.name.toLowerCase();

      // Exclude system files
      if (
        fileName === ".ds_store" ||
        fileName === "thumbs.db" ||
        fileName === "desktop.ini" ||
        fileName.startsWith("._")
      ) {
        console.log(`🚫 Skipping system file: ${file.name}`);
        return false;
      }

      // Only include JSON files
      if (!fileName.endsWith(".json")) {
        console.log(`🚫 Skipping non-JSON file: ${file.name}`);
        return false;
      }

      // Only include audio streaming history (exclude video streaming history)
      if (!fileName.startsWith("streaming_history_audio")) {
        console.log(`🚫 Skipping non-audio streaming file: ${file.name}`);
        return false;
      }

      return true;
    });

    if (validFiles.length === 0) {
      console.log("⚠️ No valid JSON files found after filtering");
      setIsUploading(false);
      alert(
        "No valid Spotify JSON files found. Please make sure you're uploading Spotify streaming history files."
      );
      return;
    }

    console.log(`✅ Filtered to ${validFiles.length} valid JSON files`);

    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    for (let file of validFiles) {
      formData.append("files", file);
    }
    console.log("📋 FormData created with", validFiles.length, "files");

    try {
      console.log("🆕 Creating session...");
      // First, create a session
      const sessionResponse = await fetch(`${API_BASE_URL}/session`, {
        method: "POST",
      });

      if (!sessionResponse.ok) {
        throw new Error(
          `Session creation failed: ${sessionResponse.status} ${sessionResponse.statusText}`
        );
      }

      const sessionData = await sessionResponse.json();
      const sessionId = sessionData.session_id;

      console.log("✅ Session created:", sessionId);

      // Store session ID for other components to use
      sessionStorage.setItem("sessionId", sessionId);

      console.log("📤 Starting chunked file upload...");

      // Split large files (13MB each) into smaller chunks to avoid 10MB Cloud Run limit
      const MAX_CHUNK_SIZE = 8 * 1024 * 1024; // 8MB per chunk to stay well under 10MB limit
      const fileArray = Array.from(formData.entries()).filter(
        ([key]) => key === "files"
      );
      const chunks = [];

      console.log(`📁 Processing ${fileArray.length} files for chunking...`);

      // Process each file and split if necessary
      for (let fileIndex = 0; fileIndex < fileArray.length; fileIndex++) {
        const [key, file] = fileArray[fileIndex];

        console.log(
          `📄 File ${fileIndex + 1}: ${file.name} (${(
            file.size /
            (1024 * 1024)
          ).toFixed(1)}MB)`
        );

        if (file.size <= MAX_CHUNK_SIZE) {
          // File is small enough, add as single chunk
          chunks.push([
            { file, originalName: file.name, chunkIndex: 0, totalChunks: 1 },
          ]);
        } else {
          // File is too large, need to split it
          const totalChunks = Math.ceil(file.size / MAX_CHUNK_SIZE);
          console.log(`  ✂️  Splitting into ${totalChunks} chunks`);

          // Read file content and split
          const fileContent = await file.text();
          const jsonData = JSON.parse(fileContent);

          const recordsPerChunk = Math.ceil(jsonData.length / totalChunks);

          for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            const startIdx = chunkIndex * recordsPerChunk;
            const endIdx = Math.min(
              startIdx + recordsPerChunk,
              jsonData.length
            );
            const chunkData = jsonData.slice(startIdx, endIdx);

            // Create new file blob for this chunk
            const chunkBlob = new Blob([JSON.stringify(chunkData)], {
              type: "application/json",
            });
            const chunkFile = new File(
              [chunkBlob],
              `${file.name.replace(".json", "")}_chunk${
                chunkIndex + 1
              }of${totalChunks}.json`,
              { type: "application/json" }
            );

            console.log(
              `    📦 Chunk ${chunkIndex + 1}/${totalChunks}: ${(
                chunkFile.size /
                (1024 * 1024)
              ).toFixed(1)}MB (${chunkData.length} records)`
            );

            chunks.push([
              {
                file: chunkFile,
                originalName: file.name,
                chunkIndex: chunkIndex,
                totalChunks: totalChunks,
              },
            ]);
          }
        }
      }

      console.log(
        `📦 Created ${chunks.length} upload chunks from ${fileArray.length} original files`
      );

      let allData = [];

      // Upload chunks sequentially
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunkFiles = chunks[chunkIndex];
        const chunkFormData = new FormData();

        // Add files from this chunk (now each chunk contains file objects with metadata)
        chunkFiles.forEach((fileInfo) => {
          chunkFormData.append("files", fileInfo.file);
        });

        // Get file info for logging
        const fileInfo = chunkFiles[0]; // Each chunk should have one file now
        const displayName =
          fileInfo.totalChunks > 1
            ? `${fileInfo.originalName} (part ${fileInfo.chunkIndex + 1}/${
                fileInfo.totalChunks
              })`
            : fileInfo.originalName;

        console.log(
          `📤 Uploading chunk ${chunkIndex + 1}/${
            chunks.length
          }: ${displayName}`
        );

        const response = await fetch(`${API_BASE_URL}/upload`, {
          method: "POST",
          headers: {
            "X-Session-ID": sessionId,
            "X-Chunk-Index": chunkIndex.toString(),
            "X-Total-Chunks": chunks.length.toString(),
            "X-Original-Filename": fileInfo.originalName,
            "X-File-Chunk-Index": fileInfo.chunkIndex.toString(),
            "X-File-Total-Chunks": fileInfo.totalChunks.toString(),
          },
          body: chunkFormData,
        });

        if (!response.ok) {
          throw new Error(
            `Chunk ${chunkIndex + 1} upload failed: ${response.status} ${
              response.statusText
            }`
          );
        }

        const chunkData = await response.json();
        console.log(
          `✅ Chunk ${chunkIndex + 1}/${chunks.length} uploaded successfully!`
        );

        // Accumulate data from all chunks
        if (chunkData.data) {
          allData = allData.concat(chunkData.data);
        }
      }

      console.log(
        "✅ All chunks uploaded successfully! Total records:",
        allData.length
      );
      onUploadComplete({ data: allData });
    } catch (err) {
      console.error("❌ Upload failed:", err);
      console.error("Error details:", err.message);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleFileInputChange = (event) => {
    const files = Array.from(event.target.files);
    handleFolderSelect(files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    handleFolderSelect(files);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="upload-container">
      <div
        className={`upload-area ${isDragOver ? "drag-over" : ""} ${
          isUploading ? "uploading" : ""
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        {isUploading ? (
          <div className="upload-progress">
            <div className="progress-spinner"></div>
            <p>Processing your Spotify data...</p>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          </div>
        ) : (
          <>
            <div className="upload-icon">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 2L13.09 8.26L20 9L13.09 9.74L12 16L10.91 9.74L4 9L10.91 8.26L12 2Z"
                  fill="currentColor"
                />
                <path
                  d="M19 15L19.74 12.26L22 12L19.74 11.74L19 9L18.26 11.74L16 12L18.26 12.26L19 15Z"
                  fill="currentColor"
                />
                <path
                  d="M5 15L5.74 12.26L8 12L5.74 11.74L5 9L4.26 11.74L2 12L4.26 12.26L5 15Z"
                  fill="currentColor"
                />
              </svg>
            </div>
            <h3>Upload Your Spotify Data</h3>
            <p>
              Drag and drop your Spotify Extended Streaming History folder here,
              or click to browse
            </p>
            <div className="upload-hint">
              <span>📁 Select the folder containing your JSON files</span>
            </div>
          </>
        )}
      </div>

      <input
        ref={(ref) => {
          fileInputRef.current = ref;
          if (ref) {
            ref.setAttribute("webkitdirectory", "");
            ref.setAttribute("directory", "");
          }
        }}
        type="file"
        multiple
        hidden
        onChange={handleFileInputChange}
      />

      <style jsx>{`
        .upload-container {
          width: 100%;
          max-width: 500px;
          margin: 0 auto;
        }

        .upload-area {
          border: 2px dashed #4a5568;
          border-radius: 16px;
          padding: 3rem 2rem;
          text-align: center;
          cursor: pointer;
          transition: all 0.3s ease;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          position: relative;
          overflow: hidden;
        }

        .upload-area:hover {
          border-color: #9146ff;
          background: linear-gradient(135deg, #1a1a2e 0%, #1e2a4a 100%);
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(145, 70, 255, 0.2);
        }

        .upload-area.drag-over {
          border-color: #9146ff;
          background: linear-gradient(135deg, #1a1a2e 0%, #2d1b69 100%);
          transform: scale(1.02);
          box-shadow: 0 12px 40px rgba(145, 70, 255, 0.3);
        }

        .upload-area.uploading {
          border-color: #9146ff;
          background: linear-gradient(135deg, #1a1a2e 0%, #2d1b69 100%);
          cursor: not-allowed;
        }

        .upload-icon {
          margin-bottom: 1.5rem;
          color: #9146ff;
        }

        .upload-icon svg {
          filter: drop-shadow(0 4px 8px rgba(145, 70, 255, 0.3));
        }

        .upload-area h3 {
          font-size: 1.5rem;
          font-weight: 600;
          margin: 0 0 0.5rem 0;
          color: #ffffff;
          font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI",
            Roboto, sans-serif;
        }

        .upload-area p {
          color: #a0a0a0;
          margin: 0 0 1.5rem 0;
          font-size: 0.95rem;
          line-height: 1.5;
        }

        .upload-hint {
          background: rgba(145, 70, 255, 0.1);
          border: 1px solid rgba(145, 70, 255, 0.2);
          border-radius: 8px;
          padding: 0.75rem 1rem;
          color: #9146ff;
          font-size: 0.9rem;
          font-weight: 500;
        }

        .upload-progress {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }

        .progress-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(145, 70, 255, 0.2);
          border-top: 3px solid #9146ff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        .progress-bar {
          width: 100%;
          height: 4px;
          background: rgba(145, 70, 255, 0.2);
          border-radius: 2px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #9146ff, #b794f4);
          transition: width 0.3s ease;
        }
      `}</style>
    </div>
  );
}

export default FolderUpload;
