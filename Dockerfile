# Use Node.js 18 LTS slim image for smaller size
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package files first (for better layer caching)
COPY package*.json ./

# Install ALL dependencies (including devDependencies for building)
RUN npm install

# Copy application source code
COPY . .

# Build TypeScript
RUN npm run build

# Remove devDependencies after build
RUN npm prune --production

# Expose port (Cloud Run will use PORT env variable)
EXPOSE 8080

# Set the command to run the application
CMD ["npm", "start"]
