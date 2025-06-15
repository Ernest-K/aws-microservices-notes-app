// lambda-functions/notes-service/getNote/index.js
const { Note, initializeDatabase, getSequelize } = require("./db");

exports.handler = async (event) => {
  console.log("Received event for getNote:", JSON.stringify(event, null, 2));
  let sequelize;

  try {
    const userId = event.requestContext?.authorizer?.claims?.sub || event.headers?.["x-user-id"] || event.requestContext?.identity?.cognitoIdentityId;
    if (!userId) {
      console.error("User ID not found in event for getNote.");
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Unauthorized: User ID not provided." }),
      };
    }

    const noteId = event.pathParameters?.noteId; // API Gateway przekazuje parametry ścieżki tutaj
    if (!noteId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Note ID is required in the path." }),
      };
    }

    sequelize = getSequelize();
    await initializeDatabase();

    const note = await Note.findOne({
      where: {
        id: noteId,
        userId: userId, // Upewnij się, że notatka należy do tego użytkownika
      },
    });

    if (!note) {
      console.log(`Note with ID: ${noteId} not found for User ID: ${userId}`);
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Note not found" }),
      };
    }

    console.log(`Note found with ID: ${noteId} for User ID: ${userId}`);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(note),
    };
  } catch (error) {
    console.error("Error in getNoteLambda:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Error fetching note", error: error.message }),
    };
  }
};
