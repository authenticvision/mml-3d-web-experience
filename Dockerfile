# Use the official Node.js 18.16.0 image from Docker Hub
# Note 3d-web-experience is picky here and only allows exactly 18.16.0
# Not even 18.16.1 is supported...
FROM node:18.16.0

# Create and set the working directory inside the container
WORKDIR /app

# Copy project contents
COPY . .

# Remove unneeded folders - this could be done better by not copying them in the first place
RUN rm -rf node_modules .nx .github .codesandbox

# Install the project dependencies
RUN npm install
RUN npm run build

# Expose the port your app runs on
EXPOSE 8080

# Command to run your app
CMD ["npm", "run", "start"]
