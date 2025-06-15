// lambda-functions/notes-service/common/db.js
const { Sequelize, DataTypes } = require("sequelize");

const dbUrl = process.env.DB_URL;
if (!dbUrl) {
  throw new Error("FATAL ERROR: DB_URL environment variable is not set.");
}

const sequelizeOptions = {
  dialect: "postgres",
  logging: console.log, // Włącz logowanie dla debugowania w Lambdzie
  dialectOptions: {
    // Możliwe, że potrzebne będą opcje SSL dla RDS
    // ssl: {
    //   require: true,
    //   rejectUnauthorized: false // Ustaw ostrożnie, lepiej użyć certyfikatu CA
    // }
  },
  pool: {
    // Ważne dla Lambdy, aby zarządzać połączeniami
    max: 2, // Mała pula, Lambda skaluje się przez instancje
    min: 0,
    idle: 10000, // Czas w ms, po którym nieużywane połączenie jest zamykane
    acquire: 30000, // Timeout dla uzyskania połączenia
  },
};

let sequelizeInstance;

function getSequelize() {
  if (!sequelizeInstance) {
    sequelizeInstance = new Sequelize(dbUrl, sequelizeOptions);
  }
  return sequelizeInstance;
}

const Note = getSequelize().define(
  "Note",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
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
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    timestamps: true,
  }
);

// Funkcja do zapewnienia, że model jest zsynchronizowany (ostrożnie w produkcji)
// W Lambdzie lepiej jest zakładać, że tabela już istnieje
const initializeDatabase = async () => {
  const currentSequelize = getSequelize();
  try {
    await currentSequelize.authenticate();
    console.log("Database connection established successfully.");
    // W Lambdzie nie chcemy robić sync() przy każdym wywołaniu
    await Note.sync({ alter: true });
    console.log("Note model synchronized successfully.");
  } catch (error) {
    console.error("Unable to connect to the database or model not synchronized:", error);
    throw error; // Rzuć błąd dalej, aby Lambda mogła go obsłużyć
  }
};

module.exports = {
  getSequelize,
  Note,
  initializeDatabase,
};
