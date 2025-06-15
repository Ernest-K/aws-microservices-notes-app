// lambda-functions/notes-service/createNote/index.js
const { Note, initializeDatabase, getSequelize } = require("./db"); // Załóżmy, że db.js jest w ../common/
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");

const sqsClient = new SQSClient({ region: process.env.AWS_REGION });
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL; // Będzie ustawione jako zmienna środowiskowa

exports.handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));
  let sequelize;

  try {
    // 1. Wyciągnij dane
    // Dla API Gateway (HTTP API payload format v2.0 lub REST API)
    // event.requestContext.authorizer.jwt.claims.sub dla Cognito przez JWT
    // lub z nagłówka, jeśli przekazuje go Twój mikroserwis API Gateway
    const userId = event.requestContext?.authorizer?.claims?.sub || event.headers?.["x-user-id"] || event.requestContext?.identity?.cognitoIdentityId;
    if (!userId) {
      console.error("User ID not found in event. Available context:", event.requestContext);
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Unauthorized: User ID not provided." }),
      };
    }

    if (!event.body) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Missing request body" }),
      };
    }
    const { title, content } = JSON.parse(event.body);

    if (!title || !content) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Title and content are required" }),
      };
    }

    // Inicjalizacja połączenia z bazą danych przy pierwszym wywołaniu "ciepłej" Lambdy
    // lub przy każdym "zimnym" starcie.
    sequelize = getSequelize();
    if (typeof sequelize.authenticate !== "function") {
      console.error("Sequelize instance is not correctly initialized.");
      throw new Error("Database client not initialized.");
    }
    await initializeDatabase(); // Sprawdza połączenie

    // 2. Logika tworzenia notatki
    const newNote = await Note.create({ title, content, userId });
    console.log(`Note created with ID: ${newNote.id} for User ID: ${userId}`);

    // 3. (Opcjonalnie na razie) Publikuj zdarzenie do SQS
    if (SQS_QUEUE_URL) {
      try {
        const messageParams = {
          QueueUrl: SQS_QUEUE_URL,
          MessageBody: JSON.stringify({
            type: "NOTE_CREATED",
            noteId: newNote.id,
            userId: userId,
            title: newNote.title,
            timestamp: new Date().toISOString(),
          }),
        };
        await sqsClient.send(new SendMessageCommand(messageParams));
        console.log("Message sent to SQS for NOTE_CREATED");
      } catch (sqsError) {
        console.error("Error sending message to SQS:", sqsError);
        // Nie chcemy, aby błąd SQS zatrzymał odpowiedź o sukcesie tworzenia notatki
        // Można tu dodać bardziej zaawansowaną logikę obsługi błędów SQS
      }
    } else {
      console.warn("SQS_QUEUE_URL not configured. Skipping SQS message.");
    }

    return {
      statusCode: 201,
      headers: {
        "Content-Type": "application/json",
        // "Access-Control-Allow-Origin": "*" // Jeśli API Gateway nie dodaje CORS
      },
      body: JSON.stringify(newNote),
    };
  } catch (error) {
    console.error("Error in createNoteLambda:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Error creating note", error: error.message, details: error.stack }),
    };
  }
  // Nie zamykaj połączenia sequelize tutaj, jeśli Lambda ma być "ciepła"
  // `finally { if (sequelize) await sequelize.close(); }` może być potrzebne, jeśli nie zarządzasz pulą
};
