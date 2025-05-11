import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import { Sequelize, DataTypes } from "sequelize";

dotenv.config(); // Aby załadować DB_URL z .env dla lokalnego rozwoju

const dbUrl = process.env.DB_URL;
const notificationsServiceUrl = process.env.NOTIFICATIONS_SERVICE_URL;

if (!dbUrl) {
  console.error("FATAL ERROR: DB_URL environment variable is not set.");
  process.exit(1);
}

// Konfiguracja Sequelize dla PostgreSQL
// W AWS RDS często wymagane jest SSL
const sequelizeOptions = {
  dialect: "postgres",
  logging: false, // Loguj zapytania tylko w trybie dev
  dialectOptions: {
    dialect: "postgres",
  },
};

const sequelize = new Sequelize(dbUrl, sequelizeOptions);

// Definicja modelu Note
const Note = sequelize.define(
  "Note",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4, // Automatyczne generowanie UUID
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    // KLUCZOWE: Pole do przechowywania identyfikatora użytkownika z Cognito (sub)
    userId: {
      type: DataTypes.STRING, // Cognito 'sub' to zazwyczaj string (UUID)
      allowNull: false,
      // Opcjonalnie: można dodać indeks dla szybszego wyszukiwania notatek użytkownika
      // index: true,
    },
    // Timestamps (createdAt, updatedAt) są dodawane automatycznie przez Sequelize
  },
  {
    timestamps: true, // Włącz timestamps
    // Opcjonalnie: Nazwa tabeli w bazie danych (domyślnie 'Notes')
    // tableName: 'user_notes'
  }
);

// Funkcja do testowania połączenia i synchronizacji modelu
const initializeDatabase = async () => {
  try {
    await sequelize.authenticate();
    console.log("[NotesService DB] Database connection established successfully.");
    // Synchronizuj model z bazą danych
    // UWAGA: `force: true` usunie i odtworzy tabelę (tylko dla developmentu!)
    // W produkcji używaj migracji.
    await sequelize.sync(); // alter: true próbuje dostosować tabelę
    console.log("[NotesService DB] Note model synchronized successfully.");
  } catch (error) {
    console.error("[NotesService DB] Unable to connect to the database or synchronize model:", error);
    // Można tu dodać logikę ponawiania próby lub zakończyć proces
    process.exit(1); // Zakończ, jeśli baza danych jest niedostępna przy starcie
  }
};

// --- Konfiguracja ---
const app = express();
const port = process.env.PORT || 3002;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// Logowanie żądań
app.use((req, res, next) => {
  console.log(`[NotesService] Received Request: ${req.method} ${req.originalUrl}`);
  next();
});

// Middleware do wyciągania ID użytkownika z nagłówka dodanego przez API Gateway
const extractUserId = (req, res, next) => {
  const userId = req.headers["x-user-id"]; // Oczekujemy tego nagłówka

  if (!userId) {
    console.warn("[NotesService] Missing X-User-Id header");
    // Jeśli brakuje nagłówka, to problem z konfiguracją gatewaya lub żądaniem
    return res.status(401).json({ message: "Brak identyfikatora użytkownika w żądaniu (nagłówek X-User-Id)" });
  }

  // Dołączamy ID użytkownika do obiektu żądania dla łatwiejszego dostępu w handlerach
  req.userId = userId;
  console.log(`[NotesService] Authenticated User ID: ${req.userId}`);
  next();
};

// Stosujemy middleware autoryzacyjne do wszystkich poniższych tras
app.use(extractUserId);

// --- Endpointy CRUD dla Notatek ---

// GET / : Pobierz wszystkie notatki dla zalogowanego użytkownika
app.get("/notes/", async (req, res) => {
  try {
    const notes = await Note.findAll({
      where: { userId: req.userId }, // Filtrujemy po ID użytkownika z nagłówka
      order: [["updatedAt", "DESC"]], // Sortujemy od najnowszych
    });
    res.status(200).json(notes);
  } catch (error) {
    console.error("[NotesService] Error fetching notes:", error);
    res.status(500).json({ message: "Błąd podczas pobierania notatek" });
  }
});

// POST / : Utwórz nową notatkę dla zalogowanego użytkownika
app.post("/notes/", async (req, res) => {
  const { title, content } = req.body;
  const userId = req.userId;

  if (!title || !content) {
    return res.status(400).json({ message: "Tytuł i treść notatki są wymagane" });
  }

  try {
    const newNote = await Note.create({
      title,
      content,
      userId: userId, // Przypisujemy notatkę do użytkownika z nagłówka
    });
    console.log(`[NotesService] Note created with ID: ${newNote.id} for User ID: ${userId}`);

    if (notificationsServiceUrl) {
      try {
        const notificationPayload = {
          recipientUserId: userId, // Użytkownik, który stworzył notatkę
          subject: `Nowa notatka: ${newNote.title.substring(0, 50)}${newNote.title.length > 50 ? "..." : ""}`,
          message: `Utworzyłeś nową notatkę o tytule "${newNote.title}".\nTreść: ${newNote.content.substring(0, 100)}${
            newNote.content.length > 100 ? "..." : ""
          }`,
        };

        console.log(`[NotesService] Attempting to send notification to ${notificationsServiceUrl}/send for User ID: ${userId}`);
        // Używamy await, ale nie blokujemy odpowiedzi dla klienta, jeśli notyfikacja się nie powiedzie
        // W produkcji można by to zrobić asynchronicznie "fire and forget" lub z lepszą obsługą błędów
        axios
          .post(`${notificationsServiceUrl}/send`, notificationPayload)
          .then((response) => {
            console.log(`[NotesService] Notification sent successfully for note ${newNote.id}:`, response.data);
          })
          .catch((error) => {
            // Logujemy błąd, ale nie powodujemy, że cała operacja tworzenia notatki się nie powiedzie
            console.error(`[NotesService] Error sending notification for note ${newNote.id}:`, error.response ? error.response.data : error.message);
          });
      } catch (notificationError) {
        // Błąd przy próbie wysłania, ale notatka już zapisana
        console.error(`[NotesService] Failed to initiate notification request for note ${newNote.id}:`, notificationError.message);
      }
    } else {
      console.log(`[NotesService] Notifications service URL not configured, skipping notification for note ${newNote.id}.`);
    }

    res.status(201).json(newNote);
  } catch (error) {
    console.error("[NotesService] Error creating note:", error);
    res.status(500).json({ message: "Błąd podczas tworzenia notatki" });
  }
});

// GET /:id : Pobierz konkretną notatkę użytkownika
app.get("/notes/:id", async (req, res) => {
  const noteId = req.params.id;

  try {
    const note = await Note.findOne({
      where: {
        id: noteId,
        userId: req.userId, // Upewniamy się, że notatka należy do tego użytkownika
      },
    });

    if (!note) {
      return res.status(404).json({ message: "Notatka nie znaleziona" });
    }
    res.status(200).json(note);
  } catch (error) {
    console.error(`[NotesService] Error fetching note ${noteId}:`, error);
    res.status(500).json({ message: "Błąd podczas pobierania notatki" });
  }
});

// PUT /:id : Aktualizuj konkretną notatkę użytkownika
app.put("/notes/:id", async (req, res) => {
  const noteId = req.params.id;
  const { title, content } = req.body;

  // Podstawowa walidacja danych wejściowych
  if (!title && !content) {
    return res.status(400).json({ message: "Należy podać tytuł lub treść do aktualizacji." });
  }

  try {
    const note = await Note.findOne({
      where: {
        id: noteId,
        userId: req.userId, // Upewniamy się, że notatka należy do tego użytkownika
      },
    });

    if (!note) {
      return res.status(404).json({ message: "Notatka nie znaleziona" });
    }

    // Aktualizuj tylko dostarczone pola
    if (title) note.title = title;
    if (content) note.content = content;

    await note.save(); // Zapisz zmiany w bazie danych
    console.log(`[NotesService] Note updated with ID: ${note.id} for User ID: ${req.userId}`);
    res.status(200).json(note);
  } catch (error) {
    console.error(`[NotesService] Error updating note ${noteId}:`, error);
    res.status(500).json({ message: "Błąd podczas aktualizacji notatki" });
  }
});

// DELETE /:id : Usuń konkretną notatkę użytkownika
app.delete("/notes/:id", async (req, res) => {
  const noteId = req.params.id;

  try {
    const deletedRowCount = await Note.destroy({
      where: {
        id: noteId,
        userId: req.userId, // Upewniamy się, że usuwamy notatkę tego użytkownika
      },
    });

    if (deletedRowCount === 0) {
      // Nie znaleziono notatki lub nie należała do użytkownika
      return res.status(404).json({ message: "Notatka nie znaleziona" });
    }

    console.log(`[NotesService] Note deleted with ID: ${noteId} for User ID: ${req.userId}`);
    // Sukces - standardowo zwraca się 204 No Content dla DELETE
    res.status(204).send();
  } catch (error) {
    console.error(`[NotesService] Error deleting note ${noteId}:`, error);
    res.status(500).json({ message: "Błąd podczas usuwania notatki" });
  }
});

// GET /health : Endpoint sprawdzający stan serwisu i połączenie z bazą
app.get("/notes/health", async (req, res) => {
  try {
    // Sprawdź połączenie z bazą danych
    await Note.sequelize.authenticate(); // Używamy sequelize z importowanego modelu
    res.status(200).json({ status: "UP", message: "Notes Service is running and connected to DB" });
  } catch (dbError) {
    console.error("[NotesService Health] Database connection error:", dbError);
    res.status(503).json({ status: "DOWN", message: "Notes Service is running BUT database connection failed" });
  }
});

// --- Globalny Error Handler ---
app.use((err, req, res, next) => {
  console.error("[NotesService] Unhandled Application Error:", err);
  res.status(500).json({ message: "Wystąpił nieoczekiwany błąd wewnętrzny w Notes Service" });
});

// --- Inicjalizacja Bazy i Start Serwera ---
const startServer = async () => {
  await initializeDatabase(); // Połącz się z bazą i zsynchronizuj model
  app.listen(port, () => {
    console.log(`[NotesService] Server started successfully on port ${port}`);
  });
};

startServer(); // Uruchom proces startowy
