import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { Card, Container, Heading, Flex, TextField, Button, Text } from "@radix-ui/themes";
import { Form } from "radix-ui";

const Confirmation = () => {
  const { state } = useLocation();
  const [errors, setErrors] = useState({});
  const [confirmationCode, setConfirmationCode] = useState("");
  const { confirmRegistration, loading } = useAuth();
  const navigate = useNavigate();

  console.log(state.email);

  const handleConfirmation = async (e) => {
    e.preventDefault();
    if (!confirmationCode) {
      setErrors({ confirmationCode: "Confirmation code is required" });
      return;
    }

    const success = await confirmRegistration(state.email, confirmationCode);
    if (success) {
      navigate("/login");
    }
  };

  return (
    <Container>
      <Card>
        <Flex direction={"column"} gap={"3"}>
          <Heading>Confirm Your Registration</Heading>
          <Text>Please check your email for a confirmation code and enter it below.</Text>
          <Form.Root style={{ display: "flex", flexDirection: "column", gap: "1rem" }} onSubmit={handleConfirmation}>
            <Form.Field>
              <Form.Label>Confirmation Code</Form.Label>
              <Form.Control asChild>
                <TextField.Root type="text" id="confirmationCode" name="confirmationCode" value={confirmationCode} onChange={(e) => setConfirmationCode(e.target.value)} required></TextField.Root>
              </Form.Control>
            </Form.Field>
            <Button type="submit" disabled={loading}>
              {loading ? "Confirming..." : "Confirm Registration"}
            </Button>
          </Form.Root>
        </Flex>
      </Card>
    </Container>
  );
};

export default Confirmation;
