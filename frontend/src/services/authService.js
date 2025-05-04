import api from "./api";

export const authService = {
  register: async (userData) => {
    const response = await api.post("/auth/register", userData);
    return response.data;
  },

  confirmRegistration: async (email, confirmationCode) => {
    const response = await api.post("/auth/confirm", { email, confirmationCode });
    return response.data;
  },

  login: async (email, password) => {
    const response = await api.post("/auth/login", { email, password });
    return response.data;
  },

  forgotPassword: async (email) => {
    const response = await api.post("/auth/forgot-password", { email });
    return response.data;
  },

  resetPassword: async (email, confirmationCode, newPassword) => {
    const response = await api.post("/auth/reset-password", {
      email,
      confirmationCode,
      newPassword,
    });
    return response.data;
  },

  getProfile: async () => {
    const response = await api.get("/auth/profile");
    return response.data;
  },
};
