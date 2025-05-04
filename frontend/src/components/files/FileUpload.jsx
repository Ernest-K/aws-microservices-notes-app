import { useState } from "react";
import { fileService } from "../../services/fileService";
import { Flex, Heading, Button, Progress } from "@radix-ui/themes";
import { Form } from "radix-ui";

const FileUpload = ({ onFileUploaded }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);

  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setError("Wybierz plik do przesłania");
      return;
    }

    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      const uploadedFile = await fileService.uploadFile(file, (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        setProgress(percentCompleted);
      });

      setFile(null);
      setUploading(false);
      setProgress(100);

      if (onFileUploaded) {
        onFileUploaded(uploadedFile);
      }

      // Reset progress after a short delay
      setTimeout(() => setProgress(0), 2000);
    } catch (err) {
      setError("Nie udało się przesłać pliku");
      setUploading(false);
    }
  };

  return (
    <div>
      <Heading>Upload File</Heading>
      <Form.Root onSubmit={handleUpload}>
        <Flex justify={"between"} align={"center"} gap={"3"}>
          <Form.Field>
            <Flex gap={"3"}>
              <Form.Label>File</Form.Label>
              <Form.Control asChild>
                <input id="file" type="file" onChange={handleFileChange} disabled={uploading} />
              </Form.Control>
            </Flex>
          </Form.Field>
          {progress > 0 && <Progress value={progress} />}
          <Button type="submit" disabled={!file || uploading}>
            {uploading ? "Uploading..." : "Upload"}
          </Button>
        </Flex>
      </Form.Root>
    </div>
  );
};

export default FileUpload;
