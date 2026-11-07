FROM node:22-alpine AS frontend
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate && pnpm install --frozen-lockfile
COPY index.html vite.config.js ./
COPY src ./src
RUN pnpm build

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/requirements-core.txt ./backend/requirements-core.txt
RUN pip install --no-cache-dir -r backend/requirements-core.txt
COPY backend ./backend
COPY --from=frontend /app/dist ./dist
RUN useradd --create-home finwise && mkdir -p backend/instance backend/models_store && chown -R finwise:finwise /app
USER finwise
EXPOSE 5000
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "120", "backend.app:create_app()"]
