import { useAuth } from "./contexts/AuthContext";
import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/layout/Navbar";
import Login from "./components/auth/Login";
import Register from "./components/auth/Register";
import ForgotPassword from "./components/auth/ForgotPassword";
import ResetPassword from "./components/auth/ResetPassword";
import NotesList from "./components/notes/NotesList";
import NoteForm from "./components/notes/NoteForm";
import FilesList from "./components/files/FilesList";
import PrivateRoute from "./components/layout/PrivateRoute";
import Profile from "./components/auth/Profile";
import Confirmation from "./components/auth/Confirmation";

function App() {
  const { isAuthenticated } = useAuth();

  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/notes" />} />
        <Route path="/register" element={!isAuthenticated ? <Register /> : <Navigate to="/notes" />} />
        <Route path="/confirmation" element={!isAuthenticated ? <Confirmation /> : <Navigate to="/notes" />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route element={<PrivateRoute />}>
          <Route path="/notes" element={<NotesList />} />
          <Route path="/notes/new" element={<NoteForm />} />
          <Route path="/notes/edit/:id" element={<NoteForm />} />
          <Route path="/files" element={<FilesList />} />
          <Route path="/profile" element={<Profile />} />
        </Route>

        <Route path="/" element={<Navigate to={isAuthenticated ? "/notes" : "/login"} />} />
      </Routes>
    </>
  );
}

export default App;
