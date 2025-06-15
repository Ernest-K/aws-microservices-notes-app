import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

// --- Konfiguracja ---
const app = express();
const port = process.env.PORT || 3004;
const awsRegion = process.env.AWS_REGION;
const snsTopicArn = process.env.AWS_SNS_TOPIC_ARN;
const dynamoDbTableName = process.env.DYNAMODB_NOTIFICATIONS_TABLE_NAME;
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL; // Nowa zmienna środowiskowa

if (!awsRegion || !snsTopicArn || !dynamoDbTableName || !SQS_QUEUE_URL) {
  console.error("FATAL ERROR: Missing required environment variables: AWS_REGION, AWS_SNS_TOPIC_ARN, DYNAMODB_NOTIFICATIONS_TABLE_NAME, SQS_QUEUE_URL");
  process.exit(1);
}

// --- Klienci AWS SDK ---
const snsClient = new SNSClient({ region: awsRegion });
const ddbClient = new DynamoDBClient({ region: awsRegion });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const sqsClient = new SQSClient({ region: awsRegion }); // Nowy klient SQS

// --- Middleware ---
app.use(cors());
app.use(express.json());
// ... (logowanie żądań i extractUserIdOptional bez zmian) ...

// --- Logika Przetwarzania Wiadomości SQS ---
async function processSqsMessage(message) {
  console.log(`[NotificationsService] Received SQS message with ID: ${message.MessageId}`);
  let eventData;
  try {
    eventData = JSON.parse(message.Body);
    console.log("[NotificationsService] Parsed SQS Message Body:", eventData);

    // Walidacja podstawowych pól
    if (!eventData.type || !eventData.userId || !eventData.noteId || !eventData.title) {
      console.error("[NotificationsService] Invalid SQS message format. Missing required fields.", eventData);
      // Zdecyduj, czy usunąć wiadomość, czy pozwolić jej wrócić (potencjalnie do DLQ)
      // Na razie logujemy i próbujemy usunąć, aby uniknąć pętli
      await deleteMessageFromQueue(message.ReceiptHandle, "InvalidFormat");
      return;
    }

    let subject, emailMessageBody;

    switch (eventData.type) {
      case "NOTE_CREATED":
        subject = `Nowa notatka utworzona: "${eventData.title.substring(0, 30)}${eventData.title.length > 30 ? "..." : ""}"`;
        emailMessageBody = `Użytkownik (ID: ${eventData.userId}) utworzył nową notatkę (ID: ${eventData.noteId}) o tytule: "${eventData.title}".\nTimestamp: ${eventData.timestamp}`;
        break;
      case "NOTE_UPDATED":
        subject = `Notatka zaktualizowana: "${eventData.title.substring(0, 30)}${eventData.title.length > 30 ? "..." : ""}"`;
        emailMessageBody = `Użytkownik (ID: ${eventData.userId}) zaktualizował notatkę (ID: ${eventData.noteId}) o tytule: "${eventData.title}".\nTimestamp: ${eventData.timestamp}`;
        break;
      case "NOTE_DELETED":
        subject = `Notatka usunięta: "${eventData.title.substring(0, 30)}${eventData.title.length > 30 ? "..." : ""}"`;
        emailMessageBody = `Użytkownik (ID: ${eventData.userId}) usunął notatkę (ID: ${eventData.noteId}) o tytule: "${eventData.title}".\nTimestamp: ${eventData.timestamp}`;
        break;
      default:
        console.warn(`[NotificationsService] Unknown event type received: ${eventData.type}`);
        await deleteMessageFromQueue(message.ReceiptHandle, "UnknownEventType");
        return;
    }

    // 1. Publikuj do SNS
    const snsParams = {
      TopicArn: snsTopicArn,
      Subject: subject,
      Message: emailMessageBody,
      MessageAttributes: {
        userId: { DataType: "String", StringValue: eventData.userId },
        noteId: { DataType: "String", StringValue: eventData.noteId },
        eventType: { DataType: "String", StringValue: eventData.type },
      },
    };
    const snsResponse = await snsClient.send(new PublishCommand(snsParams));
    console.log(
      `[NotificationsService] Message published to SNS for event type ${eventData.type}, Note ID: ${eventData.noteId}. SNS Message ID: ${snsResponse.MessageId}`
    );

    // 2. Zapisz do historii w DynamoDB
    const notificationId = uuidv4();
    const dynamoDbParams = {
      TableName: dynamoDbTableName,
      Item: {
        recipientUserId: eventData.userId, // Klucz partycji
        notificationId: notificationId, // Klucz sortowania
        originalEventId: eventData.noteId,
        eventType: eventData.type,
        subject: subject,
        message: emailMessageBody,
        snsMessageId: snsResponse.MessageId,
        status: "SENT",
        timestamp: new Date().toISOString(), // Użyj bieżącego czasu dla rekordu powiadomienia
        originalEventTimestamp: eventData.timestamp, // Timestamp oryginalnego zdarzenia
      },
    };
    await ddbDocClient.send(new PutCommand(dynamoDbParams));
    console.log(`[NotificationsService] Notification history saved to DynamoDB. Notification ID: ${notificationId}`);

    // 3. Usuń wiadomość z kolejki SQS
    await deleteMessageFromQueue(message.ReceiptHandle, "Processed");
  } catch (error) {
    console.error(`[NotificationsService] Error processing SQS message ID ${message.MessageId}:`, error);
    // W przypadku błędu NIE usuwamy wiadomości, aby mogła być przetworzona ponownie
    // lub trafić do Dead Letter Queue (DLQ), jeśli jest skonfigurowana.
    // Można dodać logikę do zwiększania licznika prób dla wiadomości.
  }
}

async function deleteMessageFromQueue(receiptHandle, reason) {
  try {
    const deleteParams = {
      QueueUrl: SQS_QUEUE_URL,
      ReceiptHandle: receiptHandle,
    };
    await sqsClient.send(new DeleteMessageCommand(deleteParams));
    console.log(`[NotificationsService] SQS message deleted successfully. Reason: ${reason}. ReceiptHandle: ${receiptHandle.substring(0, 10)}...`);
  } catch (deleteError) {
    console.error(`[NotificationsService] Error deleting SQS message. ReceiptHandle: ${receiptHandle.substring(0, 10)}...`, deleteError);
  }
}

// --- Pętla Nasłuchująca na Kolejce SQS ---
async function pollSqsQueue() {
  console.log(`[NotificationsService] Polling SQS queue: ${SQS_QUEUE_URL}`);
  const params = {
    QueueUrl: SQS_QUEUE_URL,
    MaxNumberOfMessages: 5, // Pobierz do 5 wiadomości na raz
    WaitTimeSeconds: 20, // Long polling (max 20s)
    VisibilityTimeout: 60, // Czas na przetworzenie (w sekundach)
    MessageAttributeNames: ["All"], // Pobierz wszystkie atrybuty wiadomości
  };

  try {
    const data = await sqsClient.send(new ReceiveMessageCommand(params));
    if (data.Messages && data.Messages.length > 0) {
      console.log(`[NotificationsService] Received ${data.Messages.length} message(s) from SQS.`);
      // Przetwarzaj wiadomości sekwencyjnie (await), aby uniknąć problemów z VisibilityTimeout,
      // jeśli przetwarzanie jest długie lub chcesz zapewnić kolejność w ramach jednej paczki.
      // Dla większej równoległości można użyć Promise.all, ale trzeba uważać na zarządzanie błędami.
      for (const message of data.Messages) {
        await processSqsMessage(message);
      }
    } else {
      // console.log("[NotificationsService] No messages received from SQS.");
    }
  } catch (error) {
    console.error("[NotificationsService] Error polling SQS:", error);
  }
  // Rekursywne wywołanie lub pętla z opóźnieniem
  // setTimeout(pollSqsQueue, 1000); // Odczekaj 1s przed kolejnym odpytaniem
  setImmediate(pollSqsQueue); // Uruchom kolejne odpytanie tak szybko, jak to możliwe w pętli zdarzeń Node.js
}

// --- Endpointy API (mogą pozostać, np. /history, /health) ---
// Usuń lub zmodyfikuj endpoint /send, jeśli nie jest już potrzebny do bezpośredniego wywoływania
app.post("/notifications/send", (req, res) => {
  res.status(405).json({ message: "Direct sending via /send is deprecated. Use event-driven flow via SQS." });
});

app.get("/notifications/history", async (req, res) => {
  // ... (logika pobierania historii bez zmian, jeśli klucze DynamoDB pasują) ...
  // Upewnij się, że klucz partycji w DynamoDB (recipientUserId) jest używany w zapytaniu
  const queryUserId = req.query.userId;
  if (!queryUserId) {
    return res.status(400).json({ message: "ID użytkownika (userId) jest wymagane jako parametr zapytania." });
  }
  // ... reszta logiki z QueryCommand dla DynamoDB
});

app.get("/notifications/health", (req, res) => {
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
  console.log(`[NotificationsService] SQS Queue URL: ${SQS_QUEUE_URL}`);

  pollSqsQueue(); // Rozpocznij nasłuchiwanie na kolejce SQS
});
