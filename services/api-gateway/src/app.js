import express from "express";
import cors from "cors";
import { createProxyMiddleware } from "http-proxy-middleware";
import dotenv from "dotenv";
import { CognitoIdentityProviderClient, GetUserCommand } from "@aws-sdk/client-cognito-identity-provider"; // Dodano SDK Cognito

dotenv.config();

// --- Konfiguracja ---
const app = express();
const port = process.env.PORT || 3000;
const awsRegion = process.env.AWS_REGION; // Potrzebny dla klienta Cognito

if (!awsRegion) {
  console.error("Missing required environment variable: AWS_REGION");
  process.exit(1);
}

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || "http://localhost:3001";
const NOTES_SERVICE_URL = process.env.NOTES_SERVICE_URL || "http://localhost:3002";
const FILES_SERVICE_URL = process.env.FILES_SERVICE_URL || "http://localhost:3003";
const NOTIFICATIONS_SERVICE_URL = process.env.NOTIFICATIONS_SERVICE_URL || "http://localhost:3004";

// --- Klient AWS Cognito ---
// W Fargate uprawnienia powinny pochodzić z IAM Role
const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
// --- Middleware ---
app.use(cors());

app.use((req, res, next) => {
  console.log(`[Gateway] Incoming: ${req.method} ${req.originalUrl}`);
  next();
});

// --- Middleware Autoryzacyjne ---
const authenticateAndAttachUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1]; // Bearer <token>

  if (!token) {
    console.warn("[Gateway Auth] No token provided");
    return res.status(401).json({ message: "Brak tokenu autoryzacyjnego" });
  }

  const params = {
    AccessToken: token,
  };

  try {
    const command = new GetUserCommand(params);
    const userData = await cognitoClient.send(command);
    console.log("[Gateway Auth] Token valid. User data retrieved.");

    // Wyciągnij potrzebne dane użytkownika
    const userAttributes = {};
    userData.UserAttributes.forEach((attr) => {
      userAttributes[attr.Name] = attr.Value;
    });

    const userId = userAttributes["sub"]; // Cognito Subject ID
    const userEmail = userAttributes["email"]; // Email użytkownika

    if (!userId) {
      console.error("[Gateway Auth] User Sub (sub) not found in Cognito response.");
      return res.status(500).json({ message: "Błąd wewnętrzny - nie znaleziono ID użytkownika" });
    }

    // Dołącz dane jako niestandardowe nagłówki dla serwisów backendowych
    req.headers["x-user-id"] = userId; // Użyjemy sub jako ID
    if (userEmail) {
      req.headers["x-user-email"] = userEmail;
    }
    // Można dodać więcej nagłówków, np. x-user-roles, jeśli są w Cognito

    console.log(`[Gateway Auth] Attaching headers: X-User-Id=${userId}`);
    next(); // Przejdź do proxy
  } catch (error) {
    // Jeśli GetUserCommand zwróci błąd, token jest najprawdopodobniej nieważny
    console.error("[Gateway Auth] Authentication failed:", error.name, error.message);
    if (error.name === "NotAuthorizedException" || error.name === "ResourceNotFoundException" || error.name === "UserNotFoundException") {
      return res.status(401).json({ message: "Nieautoryzowany dostęp lub token wygasł", error: error.name });
    } else {
      // Inne błędy (np. problem z połączeniem z Cognito)
      return res.status(500).json({ message: "Błąd podczas weryfikacji tokenu", error: error.name });
    }
  }
};

// --- Konfiguracja Proxy ---
const commonProxyOptions = {
  changeOrigin: true,
  xfwd: true,
  // WAŻNE: Musimy przekazać zmodyfikowane nagłówki do serwisu docelowego
  on: {
    error: (err, req, res) => {
      console.error("[Gateway Proxy] Proxy error:", err);
      // Upewnij się, że odpowiedź nie została już wysłana
      if (!res.headersSent) {
        res.status(502).send("Bad Gateway"); // 502 wskazuje na problem z serwerem backendowym
      }
    },
    proxyReq: (proxyReq, req, res) => {
      // Skopiuj niestandardowe nagłówki dodane przez middleware authenticateAndAttachUser
      if (req.headers["x-user-id"]) {
        proxyReq.setHeader("x-user-id", req.headers["x-user-id"]);
      }
      if (req.headers["x-user-email"]) {
        proxyReq.setHeader("x-user-email", req.headers["x-user-email"]);
      }
      console.log(`[Gateway Proxy] Proxying to ${proxyReq.path} with User ID: ${req.headers["x-user-id"] || "N/A"}`);
    },
  },
};

// --- Routing ---

// Ścieżki /auth/* NIE wymagają middleware autoryzacyjnego (oprócz /profile)
app.use(
  "/api/auth/login",
  createProxyMiddleware({
    ...commonProxyOptions,
    pathRewrite: {
      [`^/api/auth`]: "",
    },
    target: AUTH_SERVICE_URL + "/login",
  })
);
app.use(
  "/api/auth/register",
  createProxyMiddleware({
    ...commonProxyOptions,
    pathRewrite: {
      [`^/api/auth`]: "",
    },
    target: AUTH_SERVICE_URL + "/register",
  })
);
app.use(
  "/api/auth/confirm",
  createProxyMiddleware({
    ...commonProxyOptions,
    pathRewrite: {
      [`^/api/auth`]: "",
    },
    target: AUTH_SERVICE_URL + "/confirm",
  })
);
app.use(
  "/api/auth/forgot-password",
  createProxyMiddleware({
    ...commonProxyOptions,
    pathRewrite: {
      [`^/api/auth`]: "",
    },
    target: AUTH_SERVICE_URL + "/forgot-password",
  })
);
app.use(
  "/api/auth/reset-password",
  createProxyMiddleware({
    ...commonProxyOptions,
    pathRewrite: {
      [`^/api/auth`]: "",
    },
    target: AUTH_SERVICE_URL + "/reset-password",
  })
);
app.use(
  "/api/auth/health",
  createProxyMiddleware({
    ...commonProxyOptions,
    pathRewrite: {
      [`^/api/auth`]: "",
    },
    target: AUTH_SERVICE_URL + "/health",
  })
);

// Endpoint /auth/profile wymaga autoryzacji
app.use(
  "/api/auth/profile",
  authenticateAndAttachUser,
  createProxyMiddleware({
    // Dodano middleware
    ...commonProxyOptions,
    pathRewrite: {
      [`^/api/auth`]: "",
    },
    target: AUTH_SERVICE_URL + "/profile",
  })
);

// Ścieżki /notes/* i /files/* ZAWSZE wymagają autoryzacji
app.use(
  "/api/notes",
  authenticateAndAttachUser,
  createProxyMiddleware({
    // Dodano middleware
    ...commonProxyOptions,
    pathRewrite: {
      [`^/api/notes`]: "",
    },
    target: NOTES_SERVICE_URL,
    pathRewrite: { "^/notes": "" },
  })
);

app.use(
  "/api/files",
  authenticateAndAttachUser,
  createProxyMiddleware({
    // Dodano middleware
    ...commonProxyOptions,
    pathRewrite: {
      [`^/api/files`]: "",
    },
    target: FILES_SERVICE_URL,
    pathRewrite: { "^/files": "" },
  })
);

app.use(
  "/api/notifications",
  createProxyMiddleware({
    // Dodano middleware
    ...commonProxyOptions,
    pathRewrite: {
      [`^/api/notifications`]: "",
    },
    target: NOTIFICATIONS_SERVICE_URL,
    pathRewrite: { "^/notifications": "" },
  })
);

// Health Check dla samego Gatewaya
app.get("/api/health", (req, res) => {
  res.status(200).send("API Gateway OK");
});

// Obsługa błędów 404
app.use((req, res) => {
  if (!res.headersSent) {
    res.status(404).send("Not Found in API Gateway");
  }
});

// --- Start serwera ---
app.listen(port, () => {
  console.log(`API Gateway running on port ${port}`);
  console.log(` - Proxying /auth -> ${AUTH_SERVICE_URL}`);
  console.log(` - Proxying /notes -> ${NOTES_SERVICE_URL} (Auth Required)`);
  console.log(` - Proxying /files -> ${FILES_SERVICE_URL} (Auth Required)`);
  console.log(` - Proxying /notifications -> ${NOTIFICATIONS_SERVICE_URL} (Auth Required)`);
});
