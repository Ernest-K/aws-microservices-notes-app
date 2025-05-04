# Użyj oficjalnego obrazu Node.js jako bazy
FROM node:23-alpine

# Ustaw katalog roboczy w kontenerze
WORKDIR /usr/src/app

# Skopiuj package.json i package-lock.json
COPY package*.json ./

# Zainstaluj zależności produkcyjne
RUN npm ci

# Skopiuj kod źródłowy aplikacji
COPY . .

# Ustaw zmienną środowiskową dla portu
ENV PORT=3003

# Wystaw port aplikacji
EXPOSE ${PORT}

# Komenda uruchamiająca aplikację
CMD ["npm", "start"]