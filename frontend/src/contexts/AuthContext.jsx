import { createContext, useState, useContext, useEffect } from "react";
import { authService } from "../services/authService";

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in from localStorage
    const tokens = JSON.parse(localStorage.getItem("tokens"));
    const user = JSON.parse(localStorage.getItem("user"));

    if (tokens && user) {
      setCurrentUser(user);
      setIsAuthenticated(true);
    }

    setLoading(false);
  }, []);

  const login = async (email, password) => {
    try {
      setLoading(true);
      const { tokens, user } = await authService.login(email, password);

      localStorage.setItem("tokens", JSON.stringify(tokens));
      localStorage.setItem("user", JSON.stringify(user));

      setCurrentUser(user);
      setIsAuthenticated(true);
      return true;
    } catch (error) {
      console.error(error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const register = async (userData) => {
    try {
      setLoading(true);
      await authService.register(userData);
      return true;
    } catch (error) {
      console.error(error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const confirmRegistration = async (email, confirmationCode) => {
    try {
      setLoading(true);
      await authService.confirmRegistration(email, confirmationCode);
      return true;
    } catch (error) {
      console.error(error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const forgotPassword = async (email) => {
    try {
      setLoading(true);
      await authService.forgotPassword(email);
      return true;
    } catch (error) {
      console.error(error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (email, confirmationCode, newPassword) => {
    try {
      setLoading(true);
      await authService.resetPassword(email, confirmationCode, newPassword);
      return true;
    } catch (error) {
      console.error(error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("tokens");
    localStorage.removeItem("user");
    setCurrentUser(null);
    setIsAuthenticated(false);
  };

  const value = {
    currentUser,
    isAuthenticated,
    loading,
    login,
    register,
    confirmRegistration,
    forgotPassword,
    resetPassword,
    logout,
  };

  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
};
