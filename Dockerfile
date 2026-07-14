# Frontend BattleCaos — build de Vite + nginx.
# Las URLs se HORNEAN en el build (Vite las sustituye en compilación), por eso
# se pasan como build-args:
#   az acr build --build-arg VITE_GATEWAY_URL=https://... --build-arg VITE_AUTH_URL=https://... ...

FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_GATEWAY_URL
ARG VITE_AUTH_URL
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GATEWAY_URL=$VITE_GATEWAY_URL \
    VITE_AUTH_URL=$VITE_AUTH_URL \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
