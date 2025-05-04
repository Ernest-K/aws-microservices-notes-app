import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { noteService } from "../../services/noteService";
import NoteItem from "./NoteItem";
import { Card, Container, Grid, Flex, Spinner, Text, Button, Heading } from "@radix-ui/themes";

const NotesList = () => {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchNotes = async () => {
      try {
        const data = await noteService.getAllNotes();
        setNotes(data);
        setLoading(false);
      } catch (err) {
        console.error(err);
        setError("Nie udało się pobrać notatek");
        setLoading(false);
      }
    };

    fetchNotes();
  }, []);

  const handleDelete = async (id) => {
    try {
      await noteService.deleteNote(id);
      setNotes(notes.filter((note) => note.id !== id));
    } catch (err) {
      console.error(err);
      setError("Nie udało się usunąć notatki");
    }
  };

  if (error) return <div>{error}</div>;

  return (
    <Container>
      <Flex justify={"between"} align={"center"} style={{ marginBottom: "1rem" }}>
        <Heading>Your Notes</Heading>
        <Button asChild>
          <Link to="/notes/new">Add note</Link>
        </Button>
      </Flex>
      {loading ? (
        <Spinner size={"3"} />
      ) : notes.length === 0 ? (
        <Text>No notes</Text>
      ) : (
        <Grid columns="3" gap="3" width="auto">
          {notes.length !== 0 && notes.map((note) => <NoteItem key={note.id} note={note} onDelete={handleDelete} />)}
        </Grid>
      )}
    </Container>
  );
};

export default NotesList;
