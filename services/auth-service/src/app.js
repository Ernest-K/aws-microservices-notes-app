import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  GetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";

dotenv.config();

// --- Konfiguracja ---
const app = express();
const port = process.env.PORT || 3001;
const cognitoClientId = process.env.COGNITO_CLIENT_ID;
const awsRegion = process.env.AWS_REGION;

// Sprawdzenie kluczowych zmiennych środowiskowych
if (!cognitoClientId || !awsRegion) {
  console.error("FATAL ERROR: Missing required environment variables: COGNITO_CLIENT_ID, AWS_REGION");
  process.exit(1); // Zatrzymanie aplikacji, jeśli brakuje konfiguracji
}

// --- Middleware ---
app.use(cors()); // Umożliwia żądania z innych domen (np. od API Gateway lub frontendu w dev)
app.use(express.json()); // Parsowanie ciała żądań JSON

// Proste logowanie każdego żądania
app.use((req, res, next) => {
  console.log(`[AuthService] Received Request: ${req.method} ${req.originalUrl}`);
  next();
});

// --- Klient AWS Cognito ---
// Zakładamy, że uprawnienia pochodzą z roli IAM zadania Fargate
const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// --- Endpointy API ---

// POST /register : Rejestracja nowego użytkownika
app.post("/auth/register", async (req, res) => {
  const { email, password, firstName, lastName } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email i hasło są wymagane" });
  }

  const params = {
    ClientId: cognitoClientId,
    Username: email, // Używamy email jako nazwy użytkownika w Cognito
    Password: password,
    UserAttributes: [
      { Name: "email", Value: email },
      // Ustawiamy email_verified na false, Cognito wyśle email weryfikacyjny
      // { Name: 'email_verified', Value: 'false' }, // Zwykle zarządzane przez Cognito
      { Name: "given_name", Value: firstName || "" },
      { Name: "family_name", Value: lastName || "" },
    ],
  };

  try {
    const command = new SignUpCommand(params);
    const response = await cognitoClient.send(command);
    console.log(`[AuthService] User registration initiated for ${email}. UserSub: ${response.UserSub}`);
    res.status(201).json({
      message: "Użytkownik zarejestrowany. Sprawdź email, aby potwierdzić konto.",
      userId: response.UserSub, // Cognito User ID
    });
  } catch (error) {
    console.error(`[AuthService] Registration error for ${email}:`, error);
    // Zwracamy bardziej generyczny błąd, chyba że to UsernameExistsException
    const errorMessage = error.name === "UsernameExistsException" ? "Użytkownik o podanym adresie email już istnieje." : "Błąd podczas rejestracji.";
    res.status(400).json({ message: errorMessage, errorName: error.name });
  }
});

// POST /confirm : Potwierdzenie rejestracji kodem
app.post("/auth/confirm", async (req, res) => {
  const { email, confirmationCode } = req.body;

  if (!email || !confirmationCode) {
    return res.status(400).json({ message: "Email i kod potwierdzający są wymagane" });
  }

  const params = {
    ClientId: cognitoClientId,
    Username: email,
    ConfirmationCode: confirmationCode,
  };

  try {
    const command = new ConfirmSignUpCommand(params);
    await cognitoClient.send(command);
    console.log(`[AuthService] User confirmation successful for ${email}`);
    res.status(200).json({ message: "Konto zostało potwierdzone. Możesz się teraz zalogować." });
  } catch (error) {
    console.error(`[AuthService] Confirmation error for ${email}:`, error);
    const errorMessage = error.name === "CodeMismatchException" ? "Nieprawidłowy kod potwierdzający." : "Błąd podczas potwierdzania konta.";
    res.status(400).json({ message: errorMessage, errorName: error.name });
  }
});

// POST /login : Logowanie użytkownika
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email i hasło są wymagane" });
  }

  const loginParams = {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: cognitoClientId,
    AuthParameters: {
      USERNAME: email,
      PASSWORD: password,
    },
  };

  try {
    const loginCommand = new InitiateAuthCommand(loginParams);
    const loginResponse = await cognitoClient.send(loginCommand);
    console.log(`[AuthService] User login successful for ${email}`);

    if (!loginResponse.AuthenticationResult || !loginResponse.AuthenticationResult.AccessToken) {
      console.error(`[AuthService] Login succeeded for ${email} but no Access Token received.`);
      // To nie powinno się zdarzyć przy poprawnym flow, ale lepiej obsłużyć
      return res.status(500).json({ message: "Błąd wewnętrzny: Nie udało się uzyskać tokenu dostępowego po zalogowaniu." });
    }

    const accessToken = loginResponse.AuthenticationResult.AccessToken;
    const getUserParams = {
      AccessToken: accessToken,
    };

    let userDataObject = null;
    const getUserCommand = new GetUserCommand(getUserParams);
    const userDataResponse = await cognitoClient.send(getUserCommand);

    // Przetwarzamy atrybuty na obiekt user
    const userAttributes = {};
    userDataResponse.UserAttributes.forEach((attr) => {
      userAttributes[attr.Name] = attr.Value;
    });

    userDataObject = {
      id: userAttributes["sub"], // Używamy 'sub' jako unikalnego ID
      email: userAttributes["email"],
      firstName: userAttributes["given_name"] || "", // Użyj pustego stringa, jeśli brak
      lastName: userAttributes["family_name"] || "", // Użyj pustego stringa, jeśli brak
    };
    console.log(`[AuthService] Retrieved user data for ${email} after login.`);

    // Zwracamy cały obiekt AuthenticationResult zawierający tokeny
    res.status(200).json({
      message: "Zalogowano pomyślnie",
      tokens: loginResponse.AuthenticationResult,
      user: userDataObject,
    });
  } catch (error) {
    console.error(`[AuthService] Login error for ${email}:`, error);
    // Obsługa konkretnych błędów Cognito dla logowania
    let statusCode = 401; // Domyślnie Unauthorized
    let message = "Nieprawidłowe dane logowania lub błąd.";
    if (error.name === "UserNotFoundException") {
      message = "Użytkownik nie znaleziony.";
      statusCode = 404; // Not Found może być bardziej odpowiednie
    } else if (error.name === "NotAuthorizedException") {
      message = "Nieprawidłowe hasło lub użytkownik nie istnieje.";
    } else if (error.name === "UserNotConfirmedException") {
      message = "Użytkownik nie jest potwierdzony. Sprawdź email lub poproś o nowy kod.";
      statusCode = 403; // Forbidden może pasować
    }
    res.status(statusCode).json({ message: message, errorName: error.name });
  }
});

// POST /forgot-password : Wysłanie kodu resetu hasła
app.post("/auth/forgot-password", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email jest wymagany" });
  }

  const params = {
    ClientId: cognitoClientId,
    Username: email,
  };

  try {
    const command = new ForgotPasswordCommand(params);
    await cognitoClient.send(command);
    console.log(`[AuthService] Forgot password request successful for ${email}`);
    // Zawsze zwracamy sukces, aby nie ujawniać istnienia konta
    res.status(200).json({ message: "Jeśli konto istnieje, kod do resetowania hasła został wysłany na podany adres email." });
  } catch (error) {
    // Logujemy błąd, ale dla użytkownika zawsze zwracamy sukces
    console.error(`[AuthService] Forgot password error for ${email}:`, error);
    res.status(200).json({ message: "Jeśli konto istnieje, kod do resetowania hasła został wysłany na podany adres email." });
  }
});

// POST /reset-password : Ustawienie nowego hasła z kodem
app.post("/auth/reset-password", async (req, res) => {
  const { email, confirmationCode, newPassword } = req.body;

  if (!email || !confirmationCode || !newPassword) {
    return res.status(400).json({ message: "Email, kod potwierdzający i nowe hasło są wymagane" });
  }

  const params = {
    ClientId: cognitoClientId,
    Username: email,
    ConfirmationCode: confirmationCode,
    Password: newPassword,
  };

  try {
    const command = new ConfirmForgotPasswordCommand(params);
    await cognitoClient.send(command);
    console.log(`[AuthService] Reset password confirmation successful for ${email}`);
    res.status(200).json({ message: "Hasło zostało zmienione. Możesz się teraz zalogować." });
  } catch (error) {
    console.error(`[AuthService] Reset password confirmation error for ${email}:`, error);
    const errorMessage = error.name === "CodeMismatchException" ? "Nieprawidłowy kod potwierdzający." : "Błąd podczas ustawiania nowego hasła.";
    res.status(400).json({ message: errorMessage, errorName: error.name });
  }
});

// GET /profile : Pobranie danych użytkownika na podstawie Access Tokenu
// Ten endpoint zakłada, że Access Token jest przekazywany w nagłówku przez gateway
app.get("/auth/profile", async (req, res) => {
  // Oczekujemy, że API Gateway przekazało oryginalny nagłówek Authorization
  const authHeader = req.headers.authorization;
  const accessToken = authHeader && authHeader.split(" ")[1]; // Wyciągnij token

  if (!accessToken) {
    console.warn("[AuthService] /profile called without Authorization header.");
    // Zwracamy 401, bo to problem autoryzacji, nawet jeśli gateway miał przepuścić
    return res.status(401).json({ message: "Brak nagłówka autoryzacyjnego" });
  }

  const params = {
    AccessToken: accessToken,
  };

  try {
    const command = new GetUserCommand(params);
    const userData = await cognitoClient.send(command);

    // Przetwórz atrybuty na bardziej przyjazny obiekt JSON
    const profileData = {
      username: userData.Username, // Nazwa użytkownika Cognito
    };
    userData.UserAttributes.forEach((attr) => {
      // Proste mapowanie nazw atrybutów
      const keyMapping = {
        sub: "id", // Używamy 'sub' jako głównego ID użytkownika
        email_verified: "emailVerified",
        given_name: "firstName",
        family_name: "lastName",
      };
      const key = keyMapping[attr.Name] || attr.Name;
      // Konwertujemy 'true'/'false' string na boolean dla emailVerified
      profileData[key] = key === "emailVerified" ? attr.Value === "true" : attr.Value;
    });

    console.log(`[AuthService] Profile data retrieved for user: ${profileData.id}`);
    res.status(200).json(profileData);
  } catch (error) {
    // Błąd może wystąpić, jeśli token wygasł między gatewayem a tym serwisem,
    // lub jeśli jest nieprawidłowy (co nie powinno się zdarzyć, jeśli gateway działa).
    console.error("[AuthService] GetUser (/profile) error:", error);
    if (error.name === "NotAuthorizedException" || error.name === "ResourceNotFoundException" || error.name === "UserNotFoundException") {
      res.status(401).json({ message: "Nie udało się pobrać profilu - problem z autoryzacją (np. token wygasł)", errorName: error.name });
    } else {
      res.status(500).json({ message: "Wewnętrzny błąd serwera podczas pobierania profilu", errorName: error.name });
    }
  }
});

// GET /health : Podstawowy endpoint sprawdzający "życie" serwisu
app.get("/auth/health", (req, res) => {
  res.status(200).json({ status: "UP", message: "Auth Service is running" });
});

// --- Globalny Error Handler (łapie nieobsłużone błędy) ---
// Powinien być zdefiniowany jako ostatni middleware
app.use((err, req, res, next) => {
  console.error("[AuthService] Unhandled Application Error:", err);
  // Zwracamy generyczny błąd, aby nie ujawniać szczegółów implementacji
  res.status(500).json({ message: "Wystąpił nieoczekiwany błąd wewnętrzny w Auth Service" });
});

// --- Uruchomienie serwera ---
app.listen(port, () => {
  console.log(`[AuthService] Server started successfully on port ${port}`);
  console.log(`[AuthService] Configured for AWS Region: ${awsRegion}`);
  console.log(`[AuthService] Configured for Cognito Client ID: ${cognitoClientId}`);
});
