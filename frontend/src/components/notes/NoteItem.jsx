import { Button, Card, Flex, Heading, Text } from "@radix-ui/themes";
import { Link } from "react-router-dom";

const NoteItem = ({ note, onDelete }) => {
  const formattedDate = new Date(note.updatedAt).toLocaleDateString("pl-PL", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <Card variant="surface">
      <Flex justify={"between"} align={"center"} style={{ marginBottom: "1rem" }}>
        <Button asChild variant="surface">
          <Link to={`/notes/edit/${note.id}`}>Edit</Link>
        </Button>
        <Button variant="surface" color="red" onClick={() => onDelete(note.id)}>
          Delete
        </Button>
      </Flex>
      <Flex direction={"column"}>
        <Heading>{note.title}</Heading>
        <Text>{note.content}</Text>
        <Text size={"1"}>Last update: {formattedDate}</Text>
      </Flex>
    </Card>
  );
};

export default NoteItem;
