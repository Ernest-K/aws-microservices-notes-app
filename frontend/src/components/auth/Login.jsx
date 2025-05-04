import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { Card, Container, Heading, Flex, Link as StyledLink, TextField, Button } from "@radix-ui/themes";
import { Form } from "radix-ui";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const { login, loading } = useAuth();

  const validate = () => {
    const newErrors = {};
    if (!email) newErrors.email = "Email is required";
    if (!password) newErrors.password = "Password is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    await login(email, password);
  };

  return (
    <Container>
      <Card>
        <Flex direction={"column"} gap={"3"}>
          <Heading>Login</Heading>
          <Form.Root style={{ display: "flex", flexDirection: "column", gap: "1rem" }} onSubmit={handleSubmit}>
            <Form.Field>
              <Form.Label>Email Address</Form.Label>
              <Form.Control asChild>
                <TextField.Root type="email" id="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} required></TextField.Root>
              </Form.Control>
            </Form.Field>
            <Form.Field>
              <Flex justify={"between"}>
                <Form.Label>Password</Form.Label>
                <StyledLink asChild>
                  <Link to="/forgot-password">Forgot password?</Link>
                </StyledLink>
              </Flex>
              <Form.Control asChild>
                <TextField.Root type="password" id="password" name="password" value={password} onChange={(e) => setPassword(e.target.value)} required></TextField.Root>
              </Form.Control>
            </Form.Field>
            <Flex justify={"between"} gap={"3"}>
              <Button asChild variant="outline">
                <Link to="/register">Create an account</Link>
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Logging in..." : "Login"}{" "}
              </Button>
            </Flex>
          </Form.Root>
        </Flex>
      </Card>
    </Container>
  );
};

export default Login;
