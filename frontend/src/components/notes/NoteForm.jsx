import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { noteService } from "../../services/noteService";
import { Container, Heading, TextArea, TextField, Flex, Button, Spinner } from "@radix-ui/themes";
import { Form } from "radix-ui";

const NoteForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const [note, setNote] = useState({
    title: "",
    content: "",
  });
  const [loading, setLoading] = useState(isEditing);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isEditing) {
      const fetchNote = async () => {
        try {
          const data = await noteService.getNote(id);
          setNote({
            title: data.title,
            content: data.content,
          });
          setLoading(false);
        } catch (err) {
          setError("Nie udało się pobrać notatki");
          setLoading(false);
        }
      };

      fetchNote();
    }
  }, [id, isEditing]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setNote((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (isEditing) {
        await noteService.updateNote(id, note);
      } else {
        await noteService.createNote(note);
      }
      navigate("/notes");
    } catch (err) {
      setError(`Nie udało się ${isEditing ? "zaktualizować" : "utworzyć"} notatki`);
      setSubmitting(false);
    }
  };

  return (
    <Container>
      <Flex direction={"column"} gap={"3"}>
        <Heading>{isEditing ? "Edit note" : "Add note"}</Heading>
        {loading ? (
          <Spinner size={"3"} />
        ) : (
          <Form.Root style={{ display: "flex", flexDirection: "column", gap: "1rem" }} onSubmit={handleSubmit}>
            <Form.Field>
              <Form.Label>Title</Form.Label>
              <Form.Control asChild>
                <TextField.Root type="text" id="title" name="title" value={note.title} onChange={handleChange} required></TextField.Root>
              </Form.Control>
            </Form.Field>
            <Form.Field>
              <Form.Label>Content</Form.Label>
              <Form.Control asChild>
                <TextArea id="content" name="content" value={note.content} onChange={handleChange} rows="8" required></TextArea>
              </Form.Control>
            </Form.Field>
            <Flex justify={"between"}>
              <Button onClick={() => navigate("/notes")} color="red">
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : "Save"}
              </Button>
            </Flex>
          </Form.Root>
        )}
      </Flex>
    </Container>
  );
};

export default NoteForm;
