import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { Card, Container, Heading, Flex, Text, Button, TextField } from "@radix-ui/themes";
import { Form } from "radix-ui";

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState({});
  const { forgotPassword, loading } = useAuth();

  const validate = () => {
    const newErrors = {};
    if (!email) newErrors.email = "Email is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const success = await forgotPassword(email);
    if (success) {
      navigate("/reset-password");
    }
  };

  return (
    <Container>
      <Card>
        <Flex direction={"column"} gap={"3"}>
          <Heading>Forgot password</Heading>
          <Text>Enter your email address and we'll send you a code to reset your password.</Text>
          <Form.Root style={{ display: "flex", flexDirection: "column", gap: "1rem" }} onSubmit={handleSubmit}>
            <Form.Field>
              <Form.Label>Email Address</Form.Label>
              <Form.Control asChild>
                <TextField.Root type="email" id="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} required></TextField.Root>
              </Form.Control>
            </Form.Field>
            <Flex justify={"between"}>
              <Button asChild variant="outline">
                <Link to="/login">Back</Link>
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Sending..." : "Send Reset Code"}
              </Button>
            </Flex>
          </Form.Root>
        </Flex>
      </Card>
    </Container>
  );
};

export default ForgotPassword;
