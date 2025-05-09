import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

// --- Konfiguracja ---
const app = express();
const port = process.env.PORT || 3004;
const awsRegion = process.env.AWS_REGION;
const snsTopicArn = process.env.AWS_SNS_TOPIC_ARN;
const dynamoDbTableName = process.env.DYNAMODB_NOTIFICATIONS_TABLE_NAME;

if (!awsRegion || !snsTopicArn || !dynamoDbTableName) {
  console.error("FATAL ERROR: Missing required environment variables: AWS_REGION, AWS_SNS_TOPIC_ARN, DYNAMODB_NOTIFICATIONS_TABLE_NAME");
  process.exit(1);
}

// --- Klienci AWS SDK ---
// Zakładamy, że uprawnienia pochodzą z roli IAM zadania Fargate
const snsClient = new SNSClient({ region: awsRegion });
const ddbClient = new DynamoDBClient({ region: awsRegion });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

// --- Middleware ---
app.use(cors());
app.use(express.json()); // Do parsowania ciała żądań

// Logowanie żądań
app.use((req, res, next) => {
  console.log(`[NotificationsService] Received Request: ${req.method} ${req.originalUrl}`);
  next();
});

// Middleware do wyciągania ID użytkownika (może być potrzebne, jeśli powiadomienia są specyficzne dla użytkownika)
// Na razie go nie użyjemy bezpośrednio w logice, ale może być przydatny w przyszłości.
const extractUserIdOptional = (req, res, next) => {
  const userId = req.headers["x-user-id"];
  if (userId) {
    req.userId = userId;
    console.log(`[NotificationsService] User ID from header: ${req.userId}`);
  }
  next();
};
app.use(extractUserIdOptional); // Stosujemy do wszystkich tras

// --- Endpointy API ---

// POST /send : Endpoint do wysłania testowego powiadomienia
// W ciele żądania można przekazać `subject` i `message`
app.post("/send", async (req, res) => {
  const { subject, message, recipientUserId } = req.body; // recipientUserId jest opcjonalny

  if (!subject || !message) {
    return res.status(400).json({ message: 'Pola "subject" i "message" są wymagane.' });
  }

  const notificationId = uuidv4(); // Unikalne ID dla tego powiadomienia
  const timestamp = new Date().toISOString();

  // 1. Publikuj do SNS
  const snsParams = {
    TopicArn: snsTopicArn,
    Subject: subject,
    Message: message,
    // Opcjonalnie: Atrybuty wiadomości, jeśli subskrybenci filtrują
    MessageAttributes: {
      userId: { DataType: "String", StringValue: recipientUserId || "system" },
    },
  };

  try {
    const snsCommand = new PublishCommand(snsParams);
    const snsResponse = await snsClient.send(snsCommand);
    console.log(`[NotificationsService] Message published to SNS. Message ID: ${snsResponse.MessageId}`);

    // 2. Zapisz do historii w DynamoDB
    const dynamoDbParams = {
      TableName: dynamoDbTableName,
      Item: {
        // Klucz partycji może być np. datą lub typem powiadomienia, a sortujący timestampem
        // Dla prostoty, użyjmy userId (jeśli jest) lub 'system' jako klucz partycji, a notificationId jako sort
        notificationId: notificationId, // Unikalne ID, może być Sort Key
        subject: subject,
        message: message,
        snsMessageId: snsResponse.MessageId,
        status: "SENT", // Status wysyłki
        recipientUserId: recipientUserId, // Kto był adresatem (jeśli dotyczy)
        timestamp: timestamp,
      },
    };

    // Jeśli recipientUserId nie jest dostępny, można użyć innego klucza partycji, np. 'all_users' lub 'system'
    // lub użyć GSI do zapytań po recipientUserId.
    // Na potrzeby tego przykładu, jeśli recipientUserId nie ma, to traktujemy jako powiadomienie systemowe.
    // Schemat tabeli DynamoDB:
    // - partitionKey (String) - np. recipientUserId lub 'system_notifications'
    // - notificationId (String) - Sort Key

    const dynamoDbCommand = new PutCommand(dynamoDbParams);
    await ddbDocClient.send(dynamoDbCommand);
    console.log(`[NotificationsService] Notification history saved to DynamoDB. Notification ID: ${notificationId}`);

    res.status(200).json({
      message: "Powiadomienie zostało wysłane i zapisane w historii.",
      notificationId: notificationId,
      snsMessageId: snsResponse.MessageId,
    });
  } catch (error) {
    console.error("[NotificationsService] Error sending notification or saving history:", error);
    // Zapisujemy próbę do DynamoDB nawet jeśli SNS zawiódł? To zależy od logiki biznesowej.
    // Na razie zwracamy błąd.
    // Można by zapisać ze statusem 'FAILED_TO_SEND'
    try {
      const failedHistoryParams = {
        TableName: dynamoDbTableName,
        Item: {
          partitionKey: recipientUserId || "system_notifications",
          notificationId: notificationId,
          subject: subject,
          message: message,
          status: "FAILED_TO_SEND_SNS",
          error: error.message,
          recipientUserId: recipientUserId || null,
          timestamp: timestamp,
        },
      };
      await ddbDocClient.send(new PutCommand(failedHistoryParams));
      console.log("[NotificationsService] Failed notification attempt logged to DynamoDB.");
    } catch (dbError) {
      console.error("[NotificationsService] Error logging failed notification to DynamoDB:", dbError);
    }

    res.status(500).json({ message: "Wystąpił błąd podczas wysyłania powiadomienia.", errorName: error.name });
  }
});

// GET /history : Pobierz historię powiadomień (np. dla danego użytkownika lub systemowych)
// Opcjonalny query param `userId`
app.get("/history", async (req, res) => {
  // Możemy filtrować po `recipientUserId` lub po prostu pobrać ostatnie X systemowych.
  // Na razie zaimplementujemy pobieranie dla konkretnego `recipientUserId` lub systemowych.
  const queryUserId = req.query.userId || "system_notifications"; // Domyślnie systemowe

  const params = {
    TableName: dynamoDbTableName,
    KeyConditionExpression: "recipientUserId = :uid",
    ExpressionAttributeValues: {
      ":uid": queryUserId,
    },
    ScanIndexForward: false, // Sortuj malejąco po Sort Key (notificationId lub timestamp, jeśli timestamp jest SK)
    Limit: 20, // Pobierz ostatnie 20 powiadomień
  };

  try {
    const command = new QueryCommand(params);
    const data = await ddbDocClient.send(command);
    console.log(`[NotificationsService] Found ${data.Items?.length || 0} notifications in history for partitionKey: ${queryUserId}`);
    res.status(200).json(data.Items || []);
  } catch (error) {
    console.error("[NotificationsService] Error fetching notification history:", error);
    res.status(500).json({ message: "Błąd podczas pobierania historii powiadomień.", errorName: error.name });
  }
});

// GET /health : Endpoint sprawdzający stan serwisu
app.get("/health", (req, res) => {
  // Można dodać prosty check SNS publish (np. do martwego tematu) lub DynamoDB, jeśli potrzebne
  res.status(200).json({ status: "UP", message: "Notifications Service is running" });
});

// --- Globalny Error Handler ---
app.use((err, req, res, next) => {
  console.error("[NotificationsService] Unhandled Application Error:", err);
  res.status(500).json({ message: "Wystąpił nieoczekiwany błąd wewnętrzny w Notifications Service" });
});

// --- Start Serwera ---
app.listen(port, () => {
  console.log(`[NotificationsService] Server started successfully on port ${port}`);
  console.log(`[NotificationsService] Configured for AWS Region: ${awsRegion}`);
  console.log(`[NotificationsService] SNS Topic ARN: ${snsTopicArn}`);
  console.log(`[NotificationsService] DynamoDB Table: ${dynamoDbTableName}`);
});
