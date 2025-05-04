import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { Card, Container, Heading, Flex, TextField, Button } from "@radix-ui/themes";
import { Form } from "radix-ui";

const ResetPassword = () => {
  const [formData, setFormData] = useState({
    email: "",
    confirmationCode: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState({});
  const { resetPassword, loading } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.email) newErrors.email = "Email is required";
    if (!formData.confirmationCode) newErrors.confirmationCode = "Code is required";
    if (!formData.newPassword) newErrors.newPassword = "New password is required";
    if (formData.newPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const success = await resetPassword(formData.email, formData.confirmationCode, formData.newPassword);

    if (success) {
      navigate("/login");
    }
  };

  return (
    <Container>
      <Card>
        <Flex direction={"column"} gap={"3"}>
          <Heading>Reset Password</Heading>
          <Form.Root onSubmit={handleSubmit}>
            <Flex direction={"column"} gap={"3"}>
              <Form.Field>
                <Form.Label>Email Address</Form.Label>
                <Form.Control asChild>
                  <TextField.Root type="email" id="email" name="email" value={formData.email} onChange={handleChange} required></TextField.Root>
                </Form.Control>
              </Form.Field>
              <Form.Field>
                <Form.Label>Confirmation Code</Form.Label>
                <Form.Control asChild>
                  <TextField.Root type="text" id="confirmationCode" name="confirmationCode" value={formData.confirmationCode} onChange={handleChange} required></TextField.Root>
                </Form.Control>
              </Form.Field>
              <Form.Field>
                <Form.Label>Password</Form.Label>
                <Form.Control asChild>
                  <TextField.Root type="password" id="password" name="password" value={formData.password} onChange={handleChange} required></TextField.Root>
                </Form.Control>
              </Form.Field>
              <Form.Field>
                <Form.Label>Confirm Password</Form.Label>
                <Form.Control asChild>
                  <TextField.Root type="password" id="newPassword" name="newPassword" value={formData.newPassword} onChange={handleChange} required></TextField.Root>
                </Form.Control>
              </Form.Field>
              <Flex justify={"between"} gap={"3"}>
                <Button asChild variant="outline">
                  <Link to="/login">Back to Login</Link>
                </Button>
                <Button type="submit" disabled={loading} onClick={(e) => handleSubmit(e)}>
                  {loading ? "Resetting..." : "Reset Password"}
                </Button>
              </Flex>
            </Flex>
          </Form.Root>
        </Flex>
      </Card>
    </Container>
  );
};

export default ResetPassword;
