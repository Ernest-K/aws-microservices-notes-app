// lambda-functions/notes-service/deleteNote/index.js
const { Note, initializeDatabase, getSequelize } = require("./db");
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");

const sqsClient = new SQSClient({ region: process.env.AWS_REGION });
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;

exports.handler = async (event) => {
  console.log("Received event for deleteNote:", JSON.stringify(event, null, 2));
  let sequelize;

  try {
    const userId = event.requestContext?.authorizer?.claims?.sub || event.headers?.["x-user-id"] || event.requestContext?.identity?.cognitoIdentityId;
    if (!userId) {
      console.error("User ID not found in event for deleteNote.");
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

    sequelize = getSequelize();
    await initializeDatabase();

    // Dodatkowo pobierz notatkę, aby mieć jej tytuł dla SQS, zanim ją usuniesz
    const noteToDelete = await Note.findOne({
      where: { id: noteId, userId: userId },
    });

    if (!noteToDelete) {
      console.log(`Note with ID: ${noteId} not found for deletion for User ID: ${userId}`);
      return {
        statusCode: 404, // Not Found
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Note not found or you don't have permission to delete it" }),
      };
    }
    const noteTitleForSqs = noteToDelete.title; // Zapisz tytuł przed usunięciem

    const deletedRowCount = await Note.destroy({
      where: {
        id: noteId,
        userId: userId,
      },
    });

    // Sprawdzenie `deletedRowCount` nie jest już tak krytyczne, bo sprawdziliśmy istnienie wyżej,
    // ale można zostawić dla pewności.
    if (deletedRowCount === 0) {
      // To nie powinno się zdarzyć, jeśli `findOne` znalazło notatkę
      console.warn(`Note with ID: ${noteId} was found but not deleted for User ID: ${userId}. This is unexpected.`);
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Note not found or could not be deleted" }),
      };
    }

    console.log(`Note deleted with ID: ${noteId} for User ID: ${userId}`);

    // (Opcjonalnie) Publikuj zdarzenie do SQS
    if (SQS_QUEUE_URL) {
      try {
        const messageParams = {
          QueueUrl: SQS_QUEUE_URL,
          MessageBody: JSON.stringify({
            type: "NOTE_DELETED",
            noteId: noteId, // Przekazujemy ID usuniętej notatki
            userId: userId,
            title: noteTitleForSqs, // Przekazujemy zapisany wcześniej tytuł
            timestamp: new Date().toISOString(),
          }),
        };
        await sqsClient.send(new SendMessageCommand(messageParams));
        console.log("Message sent to SQS for NOTE_DELETED");
      } catch (sqsError) {
        console.error("Error sending message to SQS for NOTE_DELETED:", sqsError);
      }
    } else {
      console.warn("SQS_QUEUE_URL not configured. Skipping SQS message for NOTE_DELETED.");
    }

    return {
      statusCode: 204, // No Content - standard dla udanego DELETE
      headers: { "Content-Type": "application/json" },
      body: "", // Puste ciało dla 204
    };
  } catch (error) {
    console.error("Error in deleteNoteLambda:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Error deleting note", error: error.message }),
    };
  }
};
