import React from "react";

function FolderUpload({ onUploadComplete }) {
  const handleFolderSelect = async (event) => {
    const files = Array.from(event.target.files);

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
    }
  };

  return (
    <div style={{ marginBottom: "0.2rem" }}>
      <label
        style={{
          background: "#9146ff",
          color: "white",
          padding: "0.5rem 1rem",
          borderRadius: "6px",
          cursor: "pointer",
        }}
      >
        📁 Upload Spotify History Folder
        <input
          type="file"
          multiple
          hidden
          ref={(ref) => {
            if (ref) {
              ref.setAttribute("webkitdirectory", "");
              ref.setAttribute("directory", "");
            }
          }}
          onChange={handleFolderSelect}
        />
      </label>
    </div>
  );
}

export default FolderUpload;
