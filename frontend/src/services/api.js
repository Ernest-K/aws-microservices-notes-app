import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL;

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add authorization header to requests when user is logged in
api.interceptors.request.use(
  (config) => {
    const tokens = JSON.parse(localStorage.getItem("tokens"));
    if (tokens && tokens.AccessToken) {
      config.headers.Authorization = `Bearer ${tokens.AccessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle token expiration
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Token expired, log the user out
      localStorage.removeItem("tokens");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
