import { useState, useEffect } from "react";
import { fileService } from "../../services/fileService";
import FileUpload from "./FileUpload";
import { Container, Heading, Flex, Spinner, Text, Button, Card } from "@radix-ui/themes";

const FilesList = () => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchFiles = async () => {
    try {
      const data = await fileService.getAllFiles();
      setFiles(data);
      setLoading(false);
    } catch (err) {
      setError("Nie udało się pobrać plików");
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleFileUploaded = () => {
    fetchFiles();
  };

  const handleDelete = async (key) => {
    if (window.confirm("Czy na pewno chcesz usunąć ten plik?")) {
      try {
        await fileService.deleteFile(key);
        setFiles(files.filter((file) => file.s3Key.split("/").pop().split(".").slice(0, -1).join(".") !== key));
      } catch (err) {
        setError("Nie udało się usunąć pliku");
      }
    }
  };

  // Funkcja do formatowania rozmiaru pliku
  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <Container>
      <Flex direction={"column"} gap={"3"}>
        <FileUpload onFileUploaded={handleFileUploaded} />
        <Heading>Your Files</Heading>
        {loading ? (
          <Spinner size={"3"} />
        ) : files.length === 0 ? (
          <Text>No files</Text>
        ) : (
          files.map((file) => {
            const fileName = file.s3Key.split("/").pop();
            const key = fileName.split(".").slice(0, -1).join(".");
            return (
              <Card key={key}>
                <Flex justify={"between"} align={"center"}>
                  <a href={file.s3Url} target="_blank" rel="noopener noreferrer">
                    {fileName}
                  </a>
                  <Text>{formatFileSize(file.size)}</Text>
                  <Text>{new Date(file.uploadTimestamp).toLocaleString("pl-PL")}</Text>
                  <Flex gap={"3"}>
                    <Button asChild>
                      <a href={file.s3Url} download>
                        Download
                      </a>
                    </Button>
                    <Button color="red" onClick={() => handleDelete(key)}>
                      Delete
                    </Button>
                  </Flex>
                </Flex>
              </Card>
            );
          })
        )}
      </Flex>
    </Container>
  );
};

export default FilesList;
