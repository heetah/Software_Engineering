# Node.js with MongoDB Dockerfile
FROM node:18
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy local code to the container
COPY . .

# Expose port and start application
EXPOSE 3000
CMD ["node", "server.js"]
