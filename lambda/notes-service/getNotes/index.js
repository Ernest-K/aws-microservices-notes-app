// lambda-functions/notes-service/getAllNotes/index.js
const { Note, initializeDatabase, getSequelize } = require("./db");

exports.handler = async (event) => {
  console.log("Received event for getAllNotes:", JSON.stringify(event, null, 2));
  let sequelize;

  try {
    const userId = event.requestContext?.authorizer?.claims?.sub || event.headers?.["x-user-id"] || event.requestContext?.identity?.cognitoIdentityId;
    if (!userId) {
      console.error("User ID not found in event for getAllNotes.");
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Unauthorized: User ID not provided." }),
      };
    }

    sequelize = getSequelize();
    await initializeDatabase();

    const notes = await Note.findAll({
      where: { userId: userId },
      order: [["updatedAt", "DESC"]], // Sortuj od najnowszych
    });

    console.log(`Found ${notes.length} notes for User ID: ${userId}`);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(notes),
    };
  } catch (error) {
    console.error("Error in getAllNotesLambda:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Error fetching notes", error: error.message }),
    };
  }
};
