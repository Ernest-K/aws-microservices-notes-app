import api from "./api";

export const fileService = {
  uploadFile: async (file) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await api.post("/files/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },

  getAllFiles: async () => {
    const response = await api.get("/files");
    return response.data;
  },

  deleteFile: async (key) => {
    const response = await api.delete(`/files/${encodeURIComponent(key)}`);
    return response.data;
  },
};
