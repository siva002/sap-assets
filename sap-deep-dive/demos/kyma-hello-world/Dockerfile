FROM node:20-alpine

WORKDIR /app

# Copy only what we need — no node_modules, no framework, no build step
COPY package.json .
COPY app.js .

EXPOSE 8080

CMD ["node", "app.js"]
