# Use official lightweight Node.js image
FROM node:20-slim

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install --production

# Copy app source
COPY . .

# Expose port (Cloud Run defaults to 8080)
EXPOSE 8080

# Start the application
CMD [ "node", "server.js" ]
