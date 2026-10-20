FROM node:22-alpine
WORKDIR /app
COPY index.html styles.css script.js server.js ./
COPY assets ./assets/
RUN mkdir -p /app/data
ENV PORT=8080 DATA_FILE=/app/data/applications.json
EXPOSE 8080
CMD ["node", "server.js"]
