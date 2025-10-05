.PHONY: setup db-create db-push install dev build start clean help

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'

install: ## Install npm dependencies
	npm install

db-create: ## Create the MySQL database and user
	@echo "Creating ghost_atproto database and user..."
	@DB_PASS="ghostatproto2025"; \
	mysql -u root -e "CREATE DATABASE IF NOT EXISTS ghost_atproto CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" && \
	mysql -u root -e "DROP USER IF EXISTS 'ghost_atproto'@'localhost';" || true && \
	mysql -u root -e "CREATE USER 'ghost_atproto'@'localhost' IDENTIFIED WITH mysql_native_password BY '$$DB_PASS';" && \
	mysql -u root -e "GRANT ALL PRIVILEGES ON ghost_atproto.* TO 'ghost_atproto'@'localhost';" && \
	mysql -u root -e "FLUSH PRIVILEGES;" && \
	echo "" && \
	echo "✅ Database and user created!" && \
	echo "" && \
	echo "Password: $$DB_PASS" && \
	echo ""

db-push: ## Push Prisma schema to database
	@echo "Pushing Prisma schema to database..."
	npx prisma db push
	@echo "✅ Schema pushed"

db-generate: ## Generate Prisma client
	@echo "Generating Prisma client..."
	npx prisma generate
	@echo "✅ Prisma client generated"

setup: install db-create db-push db-generate ## Complete setup: install deps, create DB, push schema, generate client
	@echo ""
	@echo "✅ Setup complete!"
	@echo ""
	@echo "Next steps:"
	@echo "  1. Edit .env file with your configuration"
	@echo "  2. Run 'make dev' to start the development server"
	@echo ""

dev: ## Start development server with nodemon
	npm run dev

build: ## Build TypeScript to JavaScript
	npm run build

start: ## Start production server
	npm start

clean: ## Clean generated files
	rm -rf node_modules dist

.DEFAULT_GOAL := help
