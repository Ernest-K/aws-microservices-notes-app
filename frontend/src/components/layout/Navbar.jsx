import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { Container, Flex, Link as StyledLink, Button } from "@radix-ui/themes";

const Navbar = () => {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav>
      <Container>
        <Flex justify={"between"} align={"center"} style={{ minHeight: "4rem" }}>
          <StyledLink asChild>
            <Link to="/">Notes App</Link>
          </StyledLink>
          {currentUser ? (
            <Flex gap={"6"} align={"center"}>
              <StyledLink asChild>
                <Link to="/notes">Notes</Link>
              </StyledLink>
              <StyledLink asChild>
                <Link to="/files">Files</Link>
              </StyledLink>
              <StyledLink asChild>
                <Link to="/profile">Profile</Link>
              </StyledLink>
              <Button variant="soft" color="red" onClick={handleLogout}>
                Logout
              </Button>
            </Flex>
          ) : (
            <Flex gap={"6"} align={"center"}>
              <StyledLink asChild>
                <Link to="/login">Login</Link>
              </StyledLink>
              <StyledLink asChild>
                <Link to="/register">Register</Link>
              </StyledLink>
            </Flex>
          )}
        </Flex>
      </Container>
    </nav>
  );
};

export default Navbar;
