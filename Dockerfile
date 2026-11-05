FROM node:22-bookworm-slim

WORKDIR /app

COPY . .

# Keep an immutable copy of the pre-populated database outside /app/data and /data
# so that mounting a Railway volume at either /data or /app/data can still auto-seed
RUN cp data/inventory.db /app/seed_inventory.db && chmod -R 777 /app/data /app/seed_inventory.db

ENV NODE_ENV=production

EXPOSE 3000 8080

CMD ["node", "server.js"]
