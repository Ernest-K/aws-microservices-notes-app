import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import path from "path"; // Do obsługi rozszerzeń plików

dotenv.config();

const app = express();
const port = process.env.PORT || 3003;
const awsRegion = process.env.AWS_REGION;
const s3BucketName = process.env.AWS_S3_BUCKET_NAME;
const dynamoDbTableName = process.env.DYNAMODB_TABLE_NAME;

if (!awsRegion || !s3BucketName || !dynamoDbTableName) {
  console.error("FATAL ERROR: Missing required environment variables: AWS_REGION, AWS_S3_BUCKET_NAME, DYNAMODB_TABLE_NAME");
  process.exit(1);
}

// partition key: userId
// sort key: fileId

// --- Klienci AWS SDK ---
// Zakładamy, że uprawnienia pochodzą z roli IAM zadania Fargate
const s3Client = new S3Client({
  region: awsRegion,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  },
});

const ddbClient = new DynamoDBClient({
  region: awsRegion,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  },
});
// DocumentClient ułatwia pracę z DynamoDB, automatycznie konwertuje typy JS na typy DynamoDB
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Limit rozmiaru pliku (np. 10MB)
});

// --- Middleware ---
app.use(cors());
// Nie potrzebujemy express.json() dla endpointu upload, ale może być potrzebne dla innych
app.use(express.json());

// Logowanie żądań
app.use((req, res, next) => {
  console.log(`[FilesService] Received Request: ${req.method} ${req.originalUrl}`);
  next();
});

// Middleware do wyciągania ID użytkownika (takie samo jak w notes-service)
const extractUserId = (req, res, next) => {
  const userId = req.headers["x-user-id"]; // Oczekujemy nagłówka od API Gateway
  if (!userId) {
    console.warn("[FilesService] Missing X-User-Id header");
    return res.status(401).json({ message: "Brak identyfikatora użytkownika w żądaniu (nagłówek X-User-Id)" });
  }
  req.userId = userId;
  console.log(`[FilesService] Authenticated User ID: ${req.userId}`);
  next();
};

// --- Endpointy API ---

// POST /upload : Upload pliku
// Używamy middleware Multera i extractUserId
app.post("/files/upload", extractUserId, upload.single("file"), async (req, res) => {
  // Sprawdzamy, czy plik został przesłany przez Multer
  if (!req.file) {
    return res.status(400).json({ message: 'Plik nie został przesłany (oczekiwano pola "file")' });
  }

  const userId = req.userId;
  const file = req.file;
  const fileId = uuidv4(); // Unikalny identyfikator dla pliku
  const fileExtension = path.extname(file.originalname);
  // Klucz w S3: np. users/USER_SUB/FILE_UUID.ext
  const s3Key = `users/${userId}/${fileId}${fileExtension}`;

  // 1. Upload do S3
  const s3Params = {
    Bucket: s3BucketName,
    Key: s3Key,
    Body: file.buffer, // Plik z pamięci (Multer memoryStorage)
    ContentType: file.mimetype,
    ACL: "public-read",
    // Opcjonalnie: Metadata
    // Metadata: {
    //   'original-name': encodeURIComponent(file.originalname),
    //   'upload-timestamp': new Date().toISOString(),
    //   'user-id': userId
    // }
  };

  try {
    const s3Command = new PutObjectCommand(s3Params);
    await s3Client.send(s3Command);
    console.log(`[FilesService] File uploaded to S3 successfully. Key: ${s3Key}`);

    // Konstruujemy URL pliku w S3
    const fileUrl = `https://${s3BucketName}.s3.${awsRegion}.amazonaws.com/${s3Key}`;

    // 2. Zapis metadanych do DynamoDB
    const dynamoDbParams = {
      TableName: dynamoDbTableName,
      Item: {
        userId: userId, // Partition Key
        fileId: fileId, // Sort Key
        s3Key: s3Key,
        originalName: file.originalname,
        contentType: file.mimetype,
        size: file.size,
        uploadTimestamp: new Date().toISOString(),
        s3Url: fileUrl, // Zapisujemy też URL dla łatwiejszego dostępu
      },
    };

    const dynamoDbCommand = new PutCommand(dynamoDbParams);
    await ddbDocClient.send(dynamoDbCommand);
    console.log(`[FilesService] File metadata saved to DynamoDB. File ID: ${fileId}`);

    // Zwracamy sukces i dane o zapisanym pliku
    res.status(201).json({
      message: "Plik został pomyślnie przesłany i zapisany.",
      fileId: fileId,
      fileName: file.originalname,
      s3Key: s3Key,
      s3Url: fileUrl,
      contentType: file.mimetype,
      size: file.size,
    });
  } catch (error) {
    console.error("[FilesService] Error during file upload:", error);
    // TODO: W przypadku błędu zapisu do DynamoDB po udanym uploadzie do S3,
    // powinniśmy rozważyć usunięcie pliku z S3, aby uniknąć "osieroconych" plików.
    // Na razie zwracamy generyczny błąd.
    res.status(500).json({ message: "Wystąpił błąd podczas przesyłania pliku", errorName: error.name });
  }
});

// GET / : Listowanie plików użytkownika
// Stosujemy middleware extractUserId
app.get("/files/", extractUserId, async (req, res) => {
  const userId = req.userId;

  const params = {
    TableName: dynamoDbTableName,
    // Zapytanie o wszystkie elementy z danym userId (Partition Key)
    KeyConditionExpression: "userId = :uid",
    ExpressionAttributeValues: {
      ":uid": userId,
    },
    // Opcjonalnie: można sortować po dacie uploadu, jeśli dodamy GSI
    // Opcjonalnie: można wybrać tylko potrzebne atrybuty (ProjectionExpression)
  };

  try {
    const command = new QueryCommand(params);
    const data = await ddbDocClient.send(command);
    console.log(`[FilesService] Found ${data.Items?.length || 0} files for User ID: ${userId}`);
    // Zwracamy listę plików (Items)
    res.status(200).json(data.Items || []);
  } catch (error) {
    console.error("[FilesService] Error listing files:", error);
    res.status(500).json({ message: "Błąd podczas listowania plików", errorName: error.name });
  }
});

// DELETE /:fileId : Usuwanie pliku użytkownika
// Stosujemy middleware extractUserId
app.delete("/files/:fileId", extractUserId, async (req, res) => {
  const userId = req.userId;
  const fileId = req.params.fileId;

  if (!fileId) {
    return res.status(400).json({ message: "Brak fileId w ścieżce URL" });
  }

  // 1. Pobierz metadane pliku z DynamoDB, aby uzyskać s3Key i zweryfikować właściciela
  const getParams = {
    TableName: dynamoDbTableName,
    Key: {
      userId: userId,
      fileId: fileId,
    },
  };

  try {
    const getCommand = new GetCommand(getParams);
    const fileData = await ddbDocClient.send(getCommand);

    if (!fileData.Item) {
      console.warn(`[FilesService] File not found or not owned by user. File ID: ${fileId}, User ID: ${userId}`);
      return res.status(404).json({ message: "Plik nie znaleziony lub brak uprawnień" });
    }

    const s3KeyToDelete = fileData.Item.s3Key;
    console.log(`[FilesService] Attempting to delete file. File ID: ${fileId}, S3 Key: ${s3KeyToDelete}`);

    // 2. Usuń plik z S3
    const s3Params = {
      Bucket: s3BucketName,
      Key: s3KeyToDelete,
    };
    try {
      const s3Command = new DeleteObjectCommand(s3Params);
      await s3Client.send(s3Command);
      console.log(`[FilesService] File deleted from S3 successfully. Key: ${s3KeyToDelete}`);
    } catch (s3Error) {
      // Logujemy błąd S3, ale kontynuujemy usuwanie z DynamoDB
      console.error(`[FilesService] Error deleting file from S3 (Key: ${s3KeyToDelete}):`, s3Error);
      // Można rozważyć dodanie logiki ponawiania lub oznaczenia rekordu w DB jako "do usunięcia z S3"
    }

    // 3. Usuń metadane z DynamoDB
    const deleteParams = {
      TableName: dynamoDbTableName,
      Key: {
        userId: userId,
        fileId: fileId,
      },
    };
    const deleteCommand = new DeleteCommand(deleteParams);
    await ddbDocClient.send(deleteCommand);
    console.log(`[FilesService] File metadata deleted from DynamoDB. File ID: ${fileId}`);

    res.status(204).send(); // Sukces - No Content
  } catch (error) {
    console.error(`[FilesService] Error deleting file ${fileId}:`, error);
    // Sprawdzamy czy błąd wystąpił podczas pobierania (GetCommand) czy usuwania (DeleteCommand)
    if (error.name === "ResourceNotFoundException" && error.message.includes("Requested resource not found")) {
      // Ten błąd często występuje przy GetCommand jeśli elementu nie ma
      return res.status(404).json({ message: "Plik nie znaleziony." });
    }
    res.status(500).json({ message: "Błąd podczas usuwania pliku", errorName: error.name });
  }
});

// GET /health : Endpoint sprawdzający stan serwisu
app.get("/files/health", (req, res) => {
  // Można dodać prosty check połączenia z S3/DynamoDB, jeśli potrzebne
  res.status(200).json({ status: "UP", message: "Files Service is running" });
});

// --- Globalny Error Handler ---
app.use((err, req, res, next) => {
  // Obsługa błędów Multera (np. przekroczenie limitu rozmiaru)
  if (err instanceof multer.MulterError) {
    console.warn("[FilesService] Multer error:", err);
    return res.status(400).json({ message: `Błąd uploadu: ${err.message}`, code: err.code });
  }
  // Inne błędy
  console.error("[FilesService] Unhandled Application Error:", err);
  res.status(500).json({ message: "Wystąpił nieoczekiwany błąd wewnętrzny w Files Service" });
});

// --- Start Serwera ---
app.listen(port, () => {
  console.log(`[FilesService] Server started successfully on port ${port}`);
  console.log(`[FilesService] Configured for AWS Region: ${awsRegion}`);
  console.log(`[FilesService] S3 Bucket: ${s3BucketName}`);
  console.log(`[FilesService] DynamoDB Table: ${dynamoDbTableName}`);
});
