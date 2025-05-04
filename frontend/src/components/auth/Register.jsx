import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { Card, Container, Heading, Flex, TextField, Button } from "@radix-ui/themes";
import { Form } from "radix-ui";

const Register = () => {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
  });
  const [errors, setErrors] = useState({});
  const { register, loading } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.email) newErrors.email = "Email is required";
    if (!formData.password) newErrors.password = "Password is required";
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const success = await register({
      email: formData.email,
      password: formData.password,
      firstName: formData.firstName,
      lastName: formData.lastName,
    });

    if (success) {
      navigate("/confirmation", { state: { email: formData.email } });
    }
  };

  return (
    <Container>
      <Card>
        <Flex direction={"column"} gap={"3"}>
          <Heading>Register</Heading>
          <Form.Root onSubmit={handleSubmit}>
            <Flex direction={"column"} gap={"3"}>
              <Flex gap={"3"}>
                <Form.Field style={{ flexGrow: 1 }}>
                  <Form.Label>First Name</Form.Label>
                  <Form.Control asChild>
                    <TextField.Root type="text" id="firstName" name="firstName" value={formData.firstName} onChange={handleChange} required></TextField.Root>
                  </Form.Control>
                </Form.Field>
                <Form.Field style={{ flexGrow: 1 }}>
                  <Form.Label>Last Name</Form.Label>
                  <Form.Control asChild>
                    <TextField.Root type="text" id="lastName" name="lastName" value={formData.lastName} onChange={handleChange} required></TextField.Root>
                  </Form.Control>
                </Form.Field>
              </Flex>
              <Form.Field>
                <Form.Label>Email Address</Form.Label>
                <Form.Control asChild>
                  <TextField.Root type="email" id="email" name="email" value={formData.email} onChange={handleChange} required></TextField.Root>
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
                  <TextField.Root type="password" id="confirmPassword" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} required></TextField.Root>
                </Form.Control>
              </Form.Field>
              <Flex justify={"between"} gap={"3"}>
                <Button asChild variant="outline">
                  <Link to="/login">Already have an account</Link>
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Registering..." : "Register"}
                </Button>
              </Flex>
            </Flex>
          </Form.Root>
        </Flex>
      </Card>
    </Container>
  );
};

export default Register;
