FROM ghcr.io/puppeteer/puppeteer:latest

USER root
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

# Ensure the puppeteer user has permissions to the working directory (e.g. for saving PDFs)
RUN chown -R pptruser:pptruser /usr/src/app

# Switch back to the non-root user provided by the puppeteer image
USER pptruser

EXPOSE 3000
CMD ["npm", "start"]
