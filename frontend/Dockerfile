FROM node:23-alpine

# Utworzenie katalogu aplikacji
WORKDIR /usr/src/app

# Kopiowanie plików package.json i package-lock.json
COPY package*.json ./

# Instalacja zależności (włącznie z deweloperskimi)
RUN npm ci

# Kopiowanie kodu źródłowego
COPY . .

# Ekspozycja wybranego portu
EXPOSE 80

# Uruchamianie aplikacji w trybie deweloperskim z określonym portem
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "80"]