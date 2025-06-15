// lambda-functions/notes-service/updateNote/index.js
const { Note, initializeDatabase, getSequelize } = require("./db");
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");

const sqsClient = new SQSClient({ region: process.env.AWS_REGION });
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;

exports.handler = async (event) => {
  console.log("Received event for updateNote:", JSON.stringify(event, null, 2));
  let sequelize;

  try {
    const userId = event.requestContext?.authorizer?.claims?.sub || event.headers?.["x-user-id"] || event.requestContext?.identity?.cognitoIdentityId;
    if (!userId) {
      console.error("User ID not found in event for updateNote.");
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Unauthorized: User ID not provided." }),
      };
    }

    const noteId = event.pathParameters?.noteId;
    if (!noteId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Note ID is required in the path." }),
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

    if (!title && !content) {
      // Musi być przynajmniej jedno pole do aktualizacji
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Title or content must be provided for update." }),
      };
    }

    sequelize = getSequelize();
    await initializeDatabase();

    const note = await Note.findOne({
      where: {
        id: noteId,
        userId: userId,
      },
    });

    if (!note) {
      console.log(`Note with ID: ${noteId} not found for update for User ID: ${userId}`);
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Note not found" }),
      };
    }

    // Aktualizuj tylko dostarczone pola
    if (title !== undefined) note.title = title;
    if (content !== undefined) note.content = content;

    await note.save(); // Zapisz zmiany
    console.log(`Note updated with ID: ${note.id} for User ID: ${userId}`);

    // (Opcjonalnie) Publikuj zdarzenie do SQS
    if (SQS_QUEUE_URL) {
      try {
        const messageParams = {
          QueueUrl: SQS_QUEUE_URL,
          MessageBody: JSON.stringify({
            type: "NOTE_UPDATED",
            noteId: note.id,
            userId: userId,
            title: note.title,
            timestamp: new Date().toISOString(),
          }),
        };
        await sqsClient.send(new SendMessageCommand(messageParams));
        console.log("Message sent to SQS for NOTE_UPDATED");
      } catch (sqsError) {
        console.error("Error sending message to SQS for NOTE_UPDATED:", sqsError);
      }
    } else {
      console.warn("SQS_QUEUE_URL not configured. Skipping SQS message for NOTE_UPDATED.");
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(note),
    };
  } catch (error) {
    console.error("Error in updateNoteLambda:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Error updating note", error: error.message }),
    };
  }
};
