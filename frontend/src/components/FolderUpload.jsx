import React, { useState, useRef } from "react";

function FolderUpload({ onUploadComplete }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  const handleFolderSelect = async (files) => {
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    for (let file of files) {
      formData.append("files", file);
    }

    try {
      const response = await fetch("http://localhost:8000/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      console.log("✅ Received from backend:", data);
      onUploadComplete(data);
    } catch (err) {
      console.error("❌ Upload failed:", err);
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
